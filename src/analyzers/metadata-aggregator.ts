/**
 * データベースメタデータアグリゲーター
 *
 * fm_export_database_metadata ツールのビジネスロジック実装
 * 設計書 3.2.3 セクション準拠
 *
 * 機能概要:
 * - 全レイアウトのメタデータを集約
 * - スクリプト一覧を取得
 * - 値一覧を取得（オプション）
 * - ポータル分析を含める（オプション）
 *
 * 重要な制限事項:
 * - FileMaker Data APIの制約により、真のDDR（Database Design Report）は取得不可
 * - リレーションシップ定義、計算式定義、スクリプト内容は取得不可
 * - レイアウト配置情報は取得不可
 */

import { isErrorResponse } from '../api/client.js';
import { createErrorResponse } from '../api/error-mapper.js';
import { getSessionManager } from '../api/session.js';
import type {
  FMFieldMetaData,
  FMLayoutMetadataResponse,
  FMLayoutsResponse,
  FMScriptsResponse,
} from '../types/filemaker.js';
import type {
  DatabaseMetadata,
  ErrorResponse,
  ExportDatabaseMetadataInput,
  ExportDatabaseMetadataOutput,
  FieldMetadata,
  InferredRelationship,
  LayoutMetadata,
  PortalMetadata,
  ScriptMetadata,
  ValueListMetadata,
} from '../types/tools.js';
import { loggers } from '../utils/logger.js';

const logger = loggers.tools;

// ============================================================================
// 定数定義
// ============================================================================

/**
 * Data API 制限事項の固定メッセージ
 * 設計書 3.2.3 に基づく limitations 配列
 */
const DATA_API_LIMITATIONS: string[] = [
  'リレーションシップ定義は取得不可（Data API制約）',
  '計算式の内容は取得不可（Data API制約）',
  'スクリプトの内容は取得不可（名前のみ）',
  'テーブル定義は取得不可（レイアウト経由の推測のみ）',
  'セキュリティ権限情報は取得不可',
  'カスタムファンクションは取得不可',
];

// ============================================================================
// 内部ヘルパー関数
// ============================================================================

/**
 * FMFieldMetaData を FieldMetadata に変換
 *
 * FileMaker Data API のフィールドメタデータを、出力用の統一フォーマットに変換する。
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
 * ポータル名からリレーション先テーブル名を推測
 *
 * FileMaker のポータル命名規則に基づいて、関連テーブル名を推測する。
 * 一般的なパターン:
 * - "RelatedTable" → "RelatedTable"
 * - "portal_RelatedTable" → "RelatedTable"
 * - "RelatedTable_portal" → "RelatedTable"
 *
 * @param portalName - ポータル名
 * @returns 推測されたテーブル名
 */
function inferRelatedTableName(portalName: string): string {
  // 一般的なプレフィックス/サフィックスを除去
  let tableName = portalName;

  // "portal_" プレフィックスを除去
  if (tableName.toLowerCase().startsWith('portal_')) {
    tableName = tableName.substring(7);
  }

  // "_portal" サフィックスを除去
  if (tableName.toLowerCase().endsWith('_portal')) {
    tableName = tableName.substring(0, tableName.length - 7);
  }

  return tableName || portalName;
}

/**
 * ポータル情報からリレーションシップを推測
 *
 * ポータルメタデータを分析し、リレーションシップの推測情報を生成する。
 * 信頼度はポータル名のパターンマッチングに基づいて決定。
 *
 * @param layoutName - ソースレイアウト名
 * @param portalName - ポータル名
 * @returns 推測されたリレーションシップ情報
 */
function inferRelationshipFromPortal(layoutName: string, portalName: string): InferredRelationship {
  const inferredTable = inferRelatedTableName(portalName);

  // 信頼度の判定: ポータル名がテーブル名と一致する場合は高、そうでなければ中
  const confidence = inferredTable.toLowerCase() === portalName.toLowerCase() ? 'high' : 'medium';

  return {
    sourceLayout: layoutName,
    portalName: portalName,
    inferredTargetTable: inferredTable,
    confidence: confidence,
    inferenceMethod: 'portal_name',
  };
}

// ============================================================================
// メイン関数
// ============================================================================

/**
 * データベースメタデータをエクスポート
 *
 * データベースの構造情報を集約して返す。
 * 以下の情報を収集:
 * 1. 全レイアウトのフィールド・ポータルメタデータ
 * 2. スクリプト一覧
 * 3. 値一覧（オプション）
 * 4. 推測されたリレーションシップ（ポータル分析時）
 *
 * @param input - エクスポートオプション（format, includeLayouts など）
 * @returns データベースメタデータまたはエラーレスポンス
 */
export async function exportDatabaseMetadata(
  input: ExportDatabaseMetadataInput
): Promise<ExportDatabaseMetadataOutput | ErrorResponse> {
  const sessionManager = getSessionManager();

  // オプションのデフォルト値を設定
  const options = {
    includeLayouts: input.options?.includeLayouts ?? true,
    includeScripts: input.options?.includeScripts ?? true,
    includeValueLists: input.options?.includeValueLists ?? true,
    includePortalAnalysis: input.options?.includePortalAnalysis ?? true,
  };

  logger.info('Exporting database metadata', { format: input.format, options });

  // 結果格納用
  const layouts: LayoutMetadata[] = [];
  const scripts: ScriptMetadata[] = [];
  const valueLists: ValueListMetadata[] = [];
  const inferredRelationships: InferredRelationship[] = [];
  const valueListMap = new Map<string, string[]>();

  // ============================================================================
  // 1. レイアウト一覧の取得
  // ============================================================================

  if (options.includeLayouts) {
    const layoutsResult = await sessionManager.withSession(async (client, token) => {
      return client.get<FMLayoutsResponse>('/layouts', token);
    });

    if (isErrorResponse(layoutsResult)) {
      logger.error('Failed to get layouts', { error: layoutsResult });
      return layoutsResult;
    }

    if (!('data' in layoutsResult)) {
      return createErrorResponse(500, undefined, 'Unexpected response format for layouts');
    }

    // フォルダを除外してレイアウト名のみを抽出
    const layoutNames = layoutsResult.data.layouts.filter((l) => !l.isFolder).map((l) => l.name);

    logger.debug('Found layouts', { count: layoutNames.length });

    // ============================================================================
    // 2. 各レイアウトのメタデータを取得
    // ============================================================================

    for (const layoutName of layoutNames) {
      const metadataResult = await sessionManager.withSession(async (client, token) => {
        return client.get<FMLayoutMetadataResponse>(
          `/layouts/${encodeURIComponent(layoutName)}`,
          token
        );
      });

      if (isErrorResponse(metadataResult)) {
        // 個別のレイアウトエラーはログして続行
        logger.warn('Failed to get metadata for layout', {
          layout: layoutName,
          error: metadataResult,
        });
        continue;
      }

      if (!('data' in metadataResult)) {
        logger.warn('Unexpected response format for layout metadata', { layout: layoutName });
        continue;
      }

      const metadata = metadataResult.data;

      // フィールドメタデータを変換
      const fields = metadata.fieldMetaData.map(convertFieldMetadata);

      // ポータルメタデータを変換
      const portals: PortalMetadata[] = [];
      if (metadata.portalMetaData) {
        for (const [portalName, portalFields] of Object.entries(metadata.portalMetaData)) {
          portals.push({
            name: portalName,
            relatedTableName: inferRelatedTableName(portalName),
            fields: portalFields.map(convertFieldMetadata),
          });

          // ポータル分析オプションが有効な場合、リレーションシップを推測
          if (options.includePortalAnalysis) {
            inferredRelationships.push(inferRelationshipFromPortal(layoutName, portalName));
          }
        }
      }

      // 値一覧を収集（重複を排除）
      if (options.includeValueLists && metadata.valueLists) {
        for (const [vlName, vlValues] of Object.entries(metadata.valueLists)) {
          if (!valueListMap.has(vlName)) {
            valueListMap.set(vlName, vlValues);
          }
        }
      }

      layouts.push({
        name: layoutName,
        fields,
        portals,
      });
    }
  }

  // ============================================================================
  // 3. スクリプト一覧の取得
  // ============================================================================

  if (options.includeScripts) {
    const scriptsResult = await sessionManager.withSession(async (client, token) => {
      return client.get<FMScriptsResponse>('/scripts', token);
    });

    if (isErrorResponse(scriptsResult)) {
      logger.error('Failed to get scripts', { error: scriptsResult });
      return scriptsResult;
    }

    if ('data' in scriptsResult) {
      // フォルダを除外してスクリプト情報を変換
      for (const script of scriptsResult.data.scripts) {
        if (!script.isFolder) {
          scripts.push({
            name: script.name,
            isAvailable: true, // Data API経由で実行可能として扱う
          });
        }
      }
    }
  }

  // ============================================================================
  // 4. 値一覧をValueListMetadata形式に変換
  // ============================================================================

  if (options.includeValueLists) {
    for (const [name, values] of valueListMap.entries()) {
      valueLists.push({ name, values });
    }
  }

  // ============================================================================
  // 5. 結果を構築
  // ============================================================================

  // セッション情報からデータベース名とサーバー名を取得
  const sessionInfo = sessionManager.getSessionInfo();
  const databaseName = sessionInfo?.database || 'unknown';
  const serverName = sessionInfo?.server || 'unknown';

  const databaseMetadata: DatabaseMetadata = {
    database: {
      name: databaseName,
      server: serverName,
    },
    layouts,
    scripts,
  };

  // オプションに応じて追加情報を含める
  if (options.includeValueLists && valueLists.length > 0) {
    databaseMetadata.valueLists = valueLists;
  }

  if (options.includePortalAnalysis && inferredRelationships.length > 0) {
    databaseMetadata.inferredRelationships = inferredRelationships;
  }

  logger.info('Database metadata export completed', {
    layoutCount: layouts.length,
    scriptCount: scripts.length,
    valueListCount: valueLists.length,
    relationshipCount: inferredRelationships.length,
  });

  return {
    success: true,
    format: input.format,
    data: databaseMetadata,
    generatedAt: new Date().toISOString(),
    limitations: DATA_API_LIMITATIONS,
  };
}
