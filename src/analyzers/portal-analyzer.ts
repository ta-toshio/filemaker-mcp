/**
 * ポータル分析エンジン
 *
 * fm_analyze_portal_data ツールのビジネスロジック実装
 * 設計書 3.2.5 セクション準拠
 *
 * 機能概要:
 * - レイアウト内のポータル構造を分析
 * - 各ポータルのフィールド定義を取得
 * - サンプルデータを取得（オプション）
 * - 関連テーブル名を推測
 *
 * Data API対応状況:
 * - ポータルメタデータ取得: 完全サポート
 * - ポータルデータ取得: 完全サポート
 * - この機能はData APIの制約を受けにくい
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
  AnalyzePortalDataInput,
  AnalyzePortalDataOutput,
  ErrorResponse,
  FieldMetadata,
  PortalAnalysis,
} from '../types/tools.js';
import { loggers } from '../utils/logger.js';

const logger = loggers.tools;

// ============================================================================
// 定数定義
// ============================================================================

/**
 * サンプルデータ取得時のデフォルト最大レコード数
 */
const DEFAULT_SAMPLE_LIMIT = 5;

/**
 * サンプルデータ取得時の絶対最大レコード数（安全制限）
 */
const MAX_SAMPLE_LIMIT = 100;

// ============================================================================
// 内部ヘルパー関数
// ============================================================================

/**
 * FMFieldMetaData を FieldMetadata に変換
 *
 * @param fmField - FileMaker Data API から取得したフィールドメタデータ
 * @returns 出力用フォーマットの FieldMetadata
 */
function convertFieldMetadata(fmField: FMFieldMetaData): FieldMetadata {
  return {
    name: fmField.name,
    type: fmField.type,
    displayType: fmField.displayType,
    result: fmField.result,
    global: fmField.global,
    autoEnter: fmField.autoEnter,
    maxRepeat: fmField.maxRepeat,
    maxCharacters: fmField.maxCharacters,
    notEmpty: fmField.notEmpty,
    numeric: fmField.numeric,
  };
}

/**
 * ポータル名から関連テーブル名を推測
 *
 * FileMakerの一般的なポータル命名規則に基づいて推測。
 *
 * @param portalName - ポータル名
 * @returns 推測された関連テーブル名
 */
function inferRelatedTableName(portalName: string): string {
  let tableName = portalName;

  // 一般的なプレフィックス/サフィックスを除去
  const prefixes = ['portal_', 'Portal_', 'PORTAL_', 'rel_', 'Rel_', 'REL_'];
  const suffixes = ['_portal', '_Portal', '_PORTAL', '_rel', '_Rel', '_REL'];

  for (const prefix of prefixes) {
    if (tableName.startsWith(prefix)) {
      tableName = tableName.substring(prefix.length);
      break;
    }
  }

  for (const suffix of suffixes) {
    if (tableName.endsWith(suffix)) {
      tableName = tableName.substring(0, tableName.length - suffix.length);
      break;
    }
  }

  return tableName || portalName;
}

/**
 * ポータルデータからサンプルを抽出
 *
 * ポータル内のレコードから指定件数のサンプルデータを抽出。
 * 各レコードのフィールドデータをオブジェクト形式で返す。
 *
 * @param portalRecords - ポータル内のレコード配列
 * @param limit - 取得するサンプル数
 * @returns サンプルデータの配列
 */
function extractSampleData(
  portalRecords: Array<Record<string, unknown>>,
  limit: number
): Record<string, unknown>[] {
  const samples: Record<string, unknown>[] = [];

  // 指定件数または実際のレコード数の小さい方を使用
  const sampleCount = Math.min(limit, portalRecords.length);

  for (let i = 0; i < sampleCount; i++) {
    const record = portalRecords[i];
    // recordが存在しない場合はスキップ
    if (!record) {
      continue;
    }
    const sampleRecord: Record<string, unknown> = {};

    // recordId と modId 以外のフィールドを抽出
    for (const [key, value] of Object.entries(record)) {
      if (key !== 'recordId' && key !== 'modId') {
        sampleRecord[key] = value;
      }
    }

    samples.push(sampleRecord);
  }

  return samples;
}

// ============================================================================
// メイン関数
// ============================================================================

/**
 * レイアウトのポータルを分析
 *
 * 指定されたレイアウト内のすべてのポータルを分析し、
 * 以下の情報を返す:
 * 1. 各ポータルのフィールド定義
 * 2. 推測された関連テーブル名
 * 3. ポータル内のレコード数
 * 4. サンプルデータ（オプション）
 *
 * @param input - 分析対象レイアウト名とオプション
 * @returns ポータル分析結果
 */
export async function analyzePortalData(
  input: AnalyzePortalDataInput
): Promise<AnalyzePortalDataOutput | ErrorResponse> {
  const sessionManager = getSessionManager();

  // オプションのデフォルト値を設定
  const includeSampleData = input.includeSampleData ?? false;
  const sampleLimit = Math.min(input.sampleLimit ?? DEFAULT_SAMPLE_LIMIT, MAX_SAMPLE_LIMIT);

  logger.info('Analyzing portal data', {
    layout: input.layout,
    includeSampleData,
    sampleLimit,
  });

  // ============================================================================
  // 1. レイアウトメタデータの取得
  // ============================================================================

  const metadataResult = await sessionManager.withSession(async (client, token) => {
    return client.get<FMLayoutMetadataResponse>(
      `/layouts/${encodeURIComponent(input.layout)}`,
      token
    );
  });

  if (isErrorResponse(metadataResult)) {
    logger.error('Failed to get layout metadata', {
      layout: input.layout,
      error: metadataResult,
    });
    return metadataResult;
  }

  if (!('data' in metadataResult)) {
    return createErrorResponse(500, undefined, 'Unexpected response format');
  }

  const metadata = metadataResult.data;

  // ポータルが存在しない場合は空の結果を返す
  if (!metadata.portalMetaData || Object.keys(metadata.portalMetaData).length === 0) {
    logger.info('No portals found in layout', { layout: input.layout });

    return {
      success: true,
      layout: input.layout,
      portals: [],
      summary: {
        totalPortals: 0,
        relatedTables: [],
      },
    };
  }

  // ============================================================================
  // 2. 各ポータルの分析
  // ============================================================================

  const portals: PortalAnalysis[] = [];
  const relatedTables: Set<string> = new Set();

  // サンプルデータを取得する場合は、まずレコードを1件取得
  let portalDataMap: Record<string, Array<Record<string, unknown>>> = {};

  if (includeSampleData) {
    const recordsResult = await sessionManager.withSession(async (client, token) => {
      return client.get<FMRecordResponse>(
        `/layouts/${encodeURIComponent(input.layout)}/records?_limit=1`,
        token
      );
    });

    if (isErrorResponse(recordsResult)) {
      // レコード取得に失敗してもポータルメタデータは返す（警告のみ）
      logger.warn('Failed to get records for sample data', {
        layout: input.layout,
        error: recordsResult,
      });
    } else if ('data' in recordsResult && recordsResult.data.data.length > 0) {
      const firstRecord = recordsResult.data.data[0];
      if (firstRecord?.portalData) {
        portalDataMap = firstRecord.portalData as Record<string, Array<Record<string, unknown>>>;
      }
    }
  }

  // 各ポータルを処理
  for (const [portalName, portalFields] of Object.entries(metadata.portalMetaData)) {
    const relatedTableName = inferRelatedTableName(portalName);
    relatedTables.add(relatedTableName);

    // フィールドメタデータを変換
    const fields = portalFields.map(convertFieldMetadata);

    // ポータル分析結果を構築
    const portalAnalysis: PortalAnalysis = {
      name: portalName,
      relatedTableName,
      fields,
      recordCount: 0, // デフォルト値
    };

    // サンプルデータがある場合は追加
    if (includeSampleData && portalDataMap[portalName]) {
      const portalRecords = portalDataMap[portalName];
      portalAnalysis.recordCount = portalRecords.length;
      portalAnalysis.sampleData = extractSampleData(portalRecords, sampleLimit);
    }

    portals.push(portalAnalysis);
  }

  logger.info('Portal analysis completed', {
    layout: input.layout,
    portalCount: portals.length,
    relatedTableCount: relatedTables.size,
  });

  return {
    success: true,
    layout: input.layout,
    portals,
    summary: {
      totalPortals: portals.length,
      relatedTables: Array.from(relatedTables),
    },
  };
}
