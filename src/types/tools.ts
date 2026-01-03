/**
 * ツール入出力型定義
 *
 * MCPツールの入力パラメータと出力結果の型を定義
 * 設計書 3.2 セクション準拠
 */

import type { FMFieldMetaData, FMRecord, FindQuery, SortOrder } from './filemaker.js';

// ============================================================================
// 共通型
// ============================================================================

/**
 * 成功レスポンスの基本形
 */
export interface SuccessResponse {
  success: true;
}

/**
 * エラーレスポンス
 * 設計書 5.3 準拠
 */
export interface ErrorResponse {
  success: false;
  error: {
    code: number;
    message: string;
    details?: string;
    fmErrorCode?: number;
    retryable: boolean;
  };
}

/**
 * ツールレスポンス共通型
 */
export type ToolResponse<T> = (SuccessResponse & T) | ErrorResponse;

// ============================================================================
// 認証系ツール (fm_login, fm_logout, fm_validate_session)
// ============================================================================

/**
 * fm_login 入力
 * 設計書 3.2.1 準拠
 */
export interface LoginInput {
  server?: string;
  database?: string;
  username?: string;
  password?: string;
}

/**
 * fm_login 出力
 */
export interface LoginOutput extends SuccessResponse {
  message: string;
  sessionInfo?: {
    database: string;
    server: string;
  };
}

/**
 * fm_logout 出力
 */
export interface LogoutOutput extends SuccessResponse {
  message: string;
}

/**
 * fm_validate_session 出力
 * 設計書 3.2.2 準拠
 */
export interface ValidateSessionOutput {
  valid: boolean;
  message: string;
  sessionAge?: number;
}

// ============================================================================
// メタデータ取得系ツール
// ============================================================================

/**
 * fm_get_layouts 出力
 */
export interface GetLayoutsOutput extends SuccessResponse {
  layouts: Array<{
    name: string;
    isFolder?: boolean;
  }>;
}

/**
 * fm_get_layout_metadata 入力
 */
export interface GetLayoutMetadataInput {
  layout: string;
}

/**
 * fm_get_layout_metadata 出力
 */
export interface GetLayoutMetadataOutput extends SuccessResponse {
  layout: string;
  fieldMetaData: FMFieldMetaData[];
  portalMetaData: Record<string, FMFieldMetaData[]>;
  valueLists?: Record<string, string[]>;
}

/**
 * fm_get_scripts 出力
 */
export interface GetScriptsOutput extends SuccessResponse {
  scripts: Array<{
    name: string;
    isFolder?: boolean;
  }>;
}

/**
 * fm_list_value_lists 入力
 */
export interface ListValueListsInput {
  layout: string;
}

/**
 * fm_list_value_lists 出力
 */
export interface ListValueListsOutput extends SuccessResponse {
  layout: string;
  valueLists: Record<string, string[]>;
}

// ============================================================================
// レコード操作系ツール
// ============================================================================

/**
 * fm_get_records 入力
 */
export interface GetRecordsInput {
  layout: string;
  offset?: number;
  limit?: number;
}

/**
 * fm_get_records 出力
 */
export interface GetRecordsOutput extends SuccessResponse {
  layout: string;
  records: FMRecord[];
  dataInfo: {
    totalRecordCount: number;
    foundCount: number;
    returnedCount: number;
  };
}

/**
 * fm_get_record_by_id 入力
 */
export interface GetRecordByIdInput {
  layout: string;
  recordId: string | number;
}

/**
 * fm_get_record_by_id 出力
 */
export interface GetRecordByIdOutput extends SuccessResponse {
  layout: string;
  record: FMRecord;
}

/**
 * fm_find_records 入力
 */
export interface FindRecordsInput {
  layout: string;
  query: FindQuery[];
  sort?: SortOrder[];
  offset?: number;
  limit?: number;
}

/**
 * fm_find_records 出力
 */
export interface FindRecordsOutput extends SuccessResponse {
  layout: string;
  records: FMRecord[];
  dataInfo: {
    totalRecordCount: number;
    foundCount: number;
    returnedCount: number;
  };
}

/**
 * fm_get_record_count 入力
 * 設計書 3.2.8 準拠
 */
export interface GetRecordCountInput {
  layout: string;
}

/**
 * fm_get_record_count 出力
 */
export interface GetRecordCountOutput extends SuccessResponse {
  layout: string;
  totalRecordCount: number;
  foundCount: number;
}

// ============================================================================
// 分析系ツール
// ============================================================================

/**
 * 出力フォーマット
 */
export type ExportFormat = 'json' | 'xml' | 'html';

/**
 * 信頼度レベル
 */
export type ConfidenceLevel = 'high' | 'medium' | 'low';

/**
 * 推測方法
 */
export type InferenceMethod = 'portal_name' | 'field_pattern' | 'foreign_key_naming';

/**
 * fm_export_database_metadata 入力
 * 設計書 3.2.3 準拠
 */
export interface ExportDatabaseMetadataInput {
  format: ExportFormat;
  options?: {
    includeLayouts?: boolean;
    includeScripts?: boolean;
    includeValueLists?: boolean;
    includePortalAnalysis?: boolean;
  };
}

/**
 * フィールドメタデータ（出力用）
 */
export interface FieldMetadata {
  name: string;
  type: 'normal' | 'calculation' | 'summary';
  displayType: string;
  result: 'text' | 'number' | 'date' | 'time' | 'timestamp' | 'container';
  global: boolean;
  autoEnter: boolean;
  maxRepeat: number;
  maxCharacters: number;
  notEmpty: boolean;
  numeric: boolean;
}

/**
 * ポータルメタデータ（出力用）
 */
export interface PortalMetadata {
  name: string;
  relatedTableName: string;
  fields: FieldMetadata[];
}

/**
 * レイアウトメタデータ（出力用）
 */
export interface LayoutMetadata {
  name: string;
  fields: FieldMetadata[];
  portals: PortalMetadata[];
}

/**
 * スクリプトメタデータ（出力用）
 */
export interface ScriptMetadata {
  name: string;
  isAvailable: boolean;
}

/**
 * 値一覧メタデータ（出力用）
 */
export interface ValueListMetadata {
  name: string;
  values: string[];
}

/**
 * 推測されたリレーション
 */
export interface InferredRelationship {
  sourceLayout: string;
  portalName: string;
  inferredTargetTable: string;
  confidence: ConfidenceLevel;
  inferenceMethod: InferenceMethod;
}

/**
 * データベースメタデータ
 */
export interface DatabaseMetadata {
  database: {
    name: string;
    server: string;
  };
  layouts: LayoutMetadata[];
  scripts: ScriptMetadata[];
  valueLists?: ValueListMetadata[];
  inferredRelationships?: InferredRelationship[];
}

/**
 * fm_export_database_metadata 出力
 */
export interface ExportDatabaseMetadataOutput extends SuccessResponse {
  format: ExportFormat;
  data: DatabaseMetadata;
  generatedAt: string;
  limitations: string[];
}

/**
 * fm_infer_relationships 入力
 * 設計書 3.2.4 準拠
 */
export interface InferRelationshipsInput {
  layout: string;
  depth?: number;
}

/**
 * 詳細な推測リレーション
 */
export interface DetailedInferredRelationship {
  name: string;
  sourceTable: string;
  targetTable: string;
  sourceField?: string;
  targetField?: string;
  type: 'one-to-one' | 'one-to-many' | 'many-to-many' | 'unknown';
  confidence: ConfidenceLevel;
  inferenceMethod: string;
}

/**
 * 推測された外部キー
 */
export interface InferredForeignKey {
  fieldName: string;
  inferredReferencedTable: string;
  confidence: ConfidenceLevel;
  inferenceReason: string;
}

/**
 * fm_infer_relationships 出力
 */
export interface InferRelationshipsOutput extends SuccessResponse {
  layout: string;
  inferredRelationships: DetailedInferredRelationship[];
  inferredForeignKeys: InferredForeignKey[];
  summary: {
    totalInferred: number;
    confidenceBreakdown: {
      high: number;
      medium: number;
      low: number;
    };
  };
  disclaimer: string;
}

/**
 * fm_analyze_portal_data 入力
 * 設計書 3.2.5 準拠
 */
export interface AnalyzePortalDataInput {
  layout: string;
  includeSampleData?: boolean;
  sampleLimit?: number;
}

/**
 * ポータル分析結果
 */
export interface PortalAnalysis {
  name: string;
  relatedTableName: string;
  fields: FieldMetadata[];
  recordCount: number;
  sampleData?: Record<string, unknown>[];
}

/**
 * fm_analyze_portal_data 出力
 */
export interface AnalyzePortalDataOutput extends SuccessResponse {
  layout: string;
  portals: PortalAnalysis[];
  summary: {
    totalPortals: number;
    relatedTables: string[];
  };
}

/**
 * fm_global_search_data 入力
 * 設計書 3.2.6 準拠
 */
export interface GlobalSearchDataInput {
  searchText: string;
  layouts: string[];
  options?: {
    maxFieldsPerLayout?: number;
    maxRecordsPerLayout?: number;
    includeCalculations?: boolean;
    searchMode?: 'contains' | 'exact' | 'startsWith';
  };
}

/**
 * 検索結果レコード
 */
export interface SearchResultRecord {
  recordId: string;
  fieldData: Record<string, unknown>;
}

/**
 * レイアウト検索結果
 */
export interface LayoutSearchResult {
  layout: string;
  recordCount: number;
  records: SearchResultRecord[];
  searchedFields: string[];
  matchedFields?: string[];
}

/**
 * fm_global_search_data 出力
 */
export interface GlobalSearchDataOutput extends SuccessResponse {
  searchText: string;
  results: LayoutSearchResult[];
  summary: {
    totalLayouts: number;
    totalRecordsFound: number;
    searchedLayouts: string[];
    skippedLayouts: string[];
  };
  limitations: string[];
  disclaimer: string;
}

/**
 * fm_global_search_fields 入力
 * 設計書 3.2.7 準拠
 */
export interface GlobalSearchFieldsInput {
  fieldName?: string;
  fieldType?: 'text' | 'number' | 'date' | 'time' | 'timestamp' | 'container';
  options?: {
    maxLayouts?: number;
    maxResults?: number;
  };
}

/**
 * フィールド検索結果
 */
export interface FieldSearchResult {
  layout: string;
  field: string;
  result: string;
  displayType: string;
  type: string;
}

/**
 * fm_global_search_fields 出力
 */
export interface GlobalSearchFieldsOutput extends SuccessResponse {
  results: FieldSearchResult[];
  summary: {
    totalLayoutsSearched: number;
    totalFieldsFound: number;
    searchCriteria: {
      fieldName?: string;
      fieldType?: string;
    };
  };
  limitations: string[];
}
