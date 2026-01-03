/**
 * グローバルデータ検索エンジン
 *
 * fm_global_search_data ツールのビジネスロジック実装
 * 設計書 3.2.6 セクション準拠
 *
 * 機能概要:
 * - 複数レイアウトを横断してデータを検索
 * - テキストフィールドに対する部分一致検索
 * - 検索結果のスロットリング（レート制限）
 *
 * 重要な制限事項:
 * - 検索はレイアウト単位で順次実行される
 * - 大量のレイアウトを指定するとパフォーマンスに影響
 * - 計算フィールドの検索はオプション（デフォルト無効）
 */

import { isErrorResponse } from '../api/client.js';
import { createErrorResponse } from '../api/error-mapper.js';
import { getSessionManager } from '../api/session.js';
import type {
  FMFieldMetaData,
  FMLayoutMetadataResponse,
  FMRecordResponse,
} from '../types/filemaker.js';
import type {
  ErrorResponse,
  GlobalSearchDataInput,
  GlobalSearchDataOutput,
  LayoutSearchResult,
  SearchResultRecord,
} from '../types/tools.js';
import { loggers } from '../utils/logger.js';

const logger = loggers.tools;

// ============================================================================
// 定数定義
// ============================================================================

/**
 * デフォルトのレイアウトあたり最大フィールド数
 */
const DEFAULT_MAX_FIELDS_PER_LAYOUT = 50;

/**
 * デフォルトのレイアウトあたり最大レコード数
 */
const DEFAULT_MAX_RECORDS_PER_LAYOUT = 100;

/**
 * 絶対最大レコード数（安全制限）
 */
const ABSOLUTE_MAX_RECORDS = 1000;

/**
 * 検索可能なフィールド結果型
 * 設計書 3.2.6 準拠: text, number, date, time, timestamp を対象
 * container（バイナリ）は検索不可
 */
const SEARCHABLE_RESULT_TYPES = ['text', 'number', 'date', 'time', 'timestamp'];

/**
 * グローバル検索の制限事項メッセージ
 */
const GLOBAL_SEARCH_LIMITATIONS: string[] = [
  '検索はレイアウト単位で順次実行されるため、大量のレイアウト指定は遅延の原因となる',
  'バイナリ/コンテナフィールドは検索対象外',
  '計算フィールドの検索はオプション（デフォルト無効）',
  '検索演算子（=, ==, !, など）はFileMaker検索文法に準拠',
];

/**
 * グローバル検索の免責事項
 */
const GLOBAL_SEARCH_DISCLAIMER =
  'この検索結果は指定されたレイアウトのテキストフィールドに対する部分一致検索の結果です。' +
  'すべてのデータが検索対象になるわけではありません。';

// ============================================================================
// 内部ヘルパー関数
// ============================================================================

/**
 * フィールドが検索可能かどうかを判定
 *
 * @param field - フィールドメタデータ
 * @param includeCalculations - 計算フィールドを含めるかどうか
 * @returns 検索可能な場合は true
 */
function isSearchableField(field: FMFieldMetaData, includeCalculations: boolean): boolean {
  // 結果型が検索可能でない場合は除外
  if (!SEARCHABLE_RESULT_TYPES.includes(field.result)) {
    return false;
  }

  // 計算フィールドの処理
  if (field.type === 'calculation' && !includeCalculations) {
    return false;
  }

  // サマリーフィールドは検索対象外
  if (field.type === 'summary') {
    return false;
  }

  return true;
}

/**
 * 検索モードとフィールド型に応じた検索値を生成
 *
 * 設計書 3.2.6 準拠:
 * - ワイルドカード（*）はテキスト型にのみ適用
 * - number/date/time/timestamp は完全一致のみ
 *
 * @param searchText - 検索テキスト
 * @param searchMode - 検索モード
 * @param fieldResultType - フィールドの結果型
 * @returns FileMaker検索文法に準拠した検索値
 */
function buildSearchValue(
  searchText: string,
  searchMode: 'contains' | 'exact' | 'startsWith',
  fieldResultType: string
): string {
  // テキスト型以外は完全一致のみ（ワイルドカード非対応）
  if (fieldResultType !== 'text') {
    return searchText;
  }

  // テキスト型のみワイルドカードを適用
  switch (searchMode) {
    case 'exact':
      // 完全一致: == を使用
      return `==${searchText}`;
    case 'startsWith':
      // 前方一致: 検索語の後に * を追加
      return `${searchText}*`;
    default:
      // 部分一致: * で囲む
      return `*${searchText}*`;
  }
}

/**
 * 単一レイアウトに対して検索を実行
 *
 * @param layoutName - レイアウト名
 * @param searchText - 検索テキスト
 * @param options - 検索オプション
 * @returns レイアウト検索結果または null（スキップ時）
 */
async function searchLayout(
  layoutName: string,
  searchText: string,
  options: {
    maxFieldsPerLayout: number;
    maxRecordsPerLayout: number;
    includeCalculations: boolean;
    searchMode: 'contains' | 'exact' | 'startsWith';
  }
): Promise<{
  result: LayoutSearchResult | null;
  skipped: boolean;
  skipReason?: string;
}> {
  const sessionManager = getSessionManager();

  // ============================================================================
  // 1. レイアウトメタデータを取得して検索対象フィールドを決定
  // ============================================================================

  const metadataResult = await sessionManager.withSession(async (client, token) => {
    return client.get<FMLayoutMetadataResponse>(
      `/layouts/${encodeURIComponent(layoutName)}`,
      token
    );
  });

  if (isErrorResponse(metadataResult)) {
    logger.warn('Failed to get metadata for layout', {
      layout: layoutName,
      error: metadataResult,
    });
    return {
      result: null,
      skipped: true,
      skipReason: `メタデータ取得エラー: ${metadataResult.error.message}`,
    };
  }

  if (!('data' in metadataResult)) {
    return {
      result: null,
      skipped: true,
      skipReason: '予期しないレスポンス形式',
    };
  }

  const metadata = metadataResult.data;

  // 検索可能なフィールドをフィルタリング
  const searchableFields = metadata.fieldMetaData
    .filter((f) => isSearchableField(f, options.includeCalculations))
    .slice(0, options.maxFieldsPerLayout);

  if (searchableFields.length === 0) {
    return {
      result: null,
      skipped: true,
      skipReason: '検索可能なフィールドが存在しない',
    };
  }

  // ============================================================================
  // 2. 検索クエリを構築して実行
  // ============================================================================

  // OR検索: 各フィールドに対して個別の検索条件を配列で指定
  // 設計書 3.2.6 準拠: フィールド型に応じて検索値を生成
  // - テキスト型: ワイルドカード適用
  // - それ以外（number/date/time/timestamp）: 完全一致のみ
  const query = searchableFields.map((field) => ({
    [field.name]: buildSearchValue(searchText, options.searchMode, field.result),
  }));

  const searchRequestBody = {
    query,
    limit: options.maxRecordsPerLayout,
  };

  const searchResult = await sessionManager.withSession(async (client, token) => {
    return client.post<FMRecordResponse>(
      `/layouts/${encodeURIComponent(layoutName)}/_find`,
      token,
      searchRequestBody
    );
  });

  // 検索エラーの処理（レコードが見つからない場合もエラーになる）
  if (isErrorResponse(searchResult)) {
    // FileMakerエラーコード 401 = "No records match the request"
    if (searchResult.error.fmErrorCode === 401) {
      // レコードが見つからない場合は空の結果を返す
      return {
        result: {
          layout: layoutName,
          recordCount: 0,
          records: [],
          searchedFields: searchableFields.map((f) => f.name),
        },
        skipped: false,
      };
    }

    logger.warn('Search failed for layout', {
      layout: layoutName,
      error: searchResult,
    });
    return {
      result: null,
      skipped: true,
      skipReason: `検索エラー: ${searchResult.error.message}`,
    };
  }

  if (!('data' in searchResult)) {
    return {
      result: null,
      skipped: true,
      skipReason: '予期しないレスポンス形式',
    };
  }

  // ============================================================================
  // 3. 検索結果を整形
  // ============================================================================

  const records: SearchResultRecord[] = searchResult.data.data.map((record) => ({
    recordId: record.recordId,
    fieldData: record.fieldData,
  }));

  // マッチしたフィールドを特定（オプション機能）
  const matchedFields: string[] = [];
  if (records.length > 0) {
    const firstRecord = records[0];
    // firstRecordが存在する場合のみフィールドマッチングを実行
    if (firstRecord) {
      for (const field of searchableFields) {
        const value = firstRecord.fieldData[field.name];
        if (
          value !== null &&
          value !== undefined &&
          String(value).toLowerCase().includes(searchText.toLowerCase())
        ) {
          matchedFields.push(field.name);
        }
      }
    }
  }

  return {
    result: {
      layout: layoutName,
      recordCount: records.length,
      records,
      searchedFields: searchableFields.map((f) => f.name),
      matchedFields: matchedFields.length > 0 ? matchedFields : undefined,
    },
    skipped: false,
  };
}

// ============================================================================
// メイン関数
// ============================================================================

/**
 * 複数レイアウトを横断してデータを検索
 *
 * 指定されたレイアウト群に対して、テキスト検索を実行。
 * 各レイアウトの検索可能なフィールドに対してOR検索を行い、
 * 結果を集約して返す。
 *
 * @param input - 検索テキスト、対象レイアウト、オプション
 * @returns グローバル検索結果
 */
export async function globalSearchData(
  input: GlobalSearchDataInput
): Promise<GlobalSearchDataOutput | ErrorResponse> {
  // 入力検証
  if (!input.searchText || input.searchText.trim().length === 0) {
    return createErrorResponse(400, undefined, '検索テキストが空です');
  }

  if (!input.layouts || input.layouts.length === 0) {
    return createErrorResponse(400, undefined, '検索対象レイアウトが指定されていません');
  }

  // オプションのデフォルト値を設定
  const options = {
    maxFieldsPerLayout: input.options?.maxFieldsPerLayout ?? DEFAULT_MAX_FIELDS_PER_LAYOUT,
    maxRecordsPerLayout: Math.min(
      input.options?.maxRecordsPerLayout ?? DEFAULT_MAX_RECORDS_PER_LAYOUT,
      ABSOLUTE_MAX_RECORDS
    ),
    includeCalculations: input.options?.includeCalculations ?? false,
    searchMode: input.options?.searchMode ?? 'contains',
  };

  logger.info('Starting global search', {
    searchText: input.searchText,
    layoutCount: input.layouts.length,
    options,
  });

  // ============================================================================
  // 各レイアウトに対して検索を実行
  // ============================================================================

  const results: LayoutSearchResult[] = [];
  const skippedLayouts: string[] = [];
  let totalRecordsFound = 0;

  for (const layoutName of input.layouts) {
    const { result, skipped, skipReason } = await searchLayout(
      layoutName,
      input.searchText,
      options
    );

    if (skipped) {
      logger.debug('Layout skipped', { layout: layoutName, reason: skipReason });
      skippedLayouts.push(layoutName);
    } else if (result) {
      results.push(result);
      totalRecordsFound += result.recordCount;
    }
  }

  logger.info('Global search completed', {
    searchText: input.searchText,
    searchedLayouts: results.length,
    skippedLayouts: skippedLayouts.length,
    totalRecordsFound,
  });

  return {
    success: true,
    searchText: input.searchText,
    results,
    summary: {
      totalLayouts: input.layouts.length,
      totalRecordsFound,
      searchedLayouts: results.map((r) => r.layout),
      skippedLayouts,
    },
    limitations: GLOBAL_SEARCH_LIMITATIONS,
    disclaimer: GLOBAL_SEARCH_DISCLAIMER,
  };
}
