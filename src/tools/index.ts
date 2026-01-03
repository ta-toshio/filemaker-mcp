/**
 * ツールモジュール エクスポート集約
 *
 * 各ツールカテゴリからツール定義とハンドラをエクスポートする。
 * server.ts はこのモジュールからすべてのツールをインポートする。
 *
 * ツールカテゴリ:
 * - Phase 1: 認証・基本機能（9ツール）
 *   - auth.ts: 認証関連（3ツール）
 *   - metadata.ts: メタデータ取得（3ツール）
 *   - records.ts: レコード操作（3ツール）
 * - Phase 2: 高度な分析機能（4ツール）
 *   - analysis.ts: 分析ツール（4ツール）
 * - Phase 3: 補助ツール（3ツール）
 *   - records.ts: fm_get_record_count
 *   - metadata.ts: fm_list_value_lists
 *   - analysis.ts: fm_global_search_fields
 */

// 認証ツール
export {
  AUTH_TOOLS,
  handleLogin,
  handleLogout,
  handleValidateSession,
} from './auth.js';

// メタデータツール
export {
  METADATA_TOOLS,
  handleGetLayouts,
  handleGetLayoutMetadata,
  handleGetScripts,
  handleListValueLists,
} from './metadata.js';

// レコード操作ツール
export {
  RECORDS_TOOLS,
  handleGetRecords,
  handleGetRecordById,
  handleFindRecords,
  handleGetRecordCount,
} from './records.js';

// 分析ツール（Phase 2 + Phase 3）
export {
  ANALYSIS_TOOLS,
  handleExportDatabaseMetadata,
  handleInferRelationships,
  handleAnalyzePortalData,
  handleGlobalSearchData,
  handleGlobalSearchFields,
} from './analysis.js';

// 型のre-export
export type {
  // 認証系
  LoginInput,
  LoginOutput,
  LogoutOutput,
  ValidateSessionOutput,
  // メタデータ系
  GetLayoutsOutput,
  GetLayoutMetadataInput,
  GetLayoutMetadataOutput,
  GetScriptsOutput,
  ListValueListsInput,
  ListValueListsOutput,
  // レコード操作系
  GetRecordsInput,
  GetRecordsOutput,
  GetRecordByIdInput,
  GetRecordByIdOutput,
  GetRecordCountInput,
  GetRecordCountOutput,
  FindRecordsInput,
  FindRecordsOutput,
  // 分析系（Phase 2 + Phase 3）
  ExportDatabaseMetadataInput,
  ExportDatabaseMetadataOutput,
  InferRelationshipsInput,
  InferRelationshipsOutput,
  AnalyzePortalDataInput,
  AnalyzePortalDataOutput,
  GlobalSearchDataInput,
  GlobalSearchDataOutput,
  GlobalSearchFieldsInput,
  GlobalSearchFieldsOutput,
  // 共通
  ErrorResponse,
} from '../types/tools.js';
