/**
 * FileMaker Data API 型定義
 *
 * FileMaker Data API のレスポンス・リクエスト型を定義
 * 設計書 4.1 セクション準拠
 */

// ============================================================================
// Branded Types（型安全な識別子）
// ============================================================================

/**
 * セッショントークン型
 * FileMaker Data APIから取得した認証トークンを型安全に扱う
 */
export type SessionToken = string & { readonly __brand: 'SessionToken' };

/**
 * レコードID型
 * FileMakerの内部レコードIDを型安全に扱う
 */
export type RecordId = string & { readonly __brand: 'RecordId' };

/**
 * レイアウト名型
 * レイアウト名を型安全に扱う
 */
export type LayoutName = string & { readonly __brand: 'LayoutName' };

// ============================================================================
// FileMaker Data API 共通型
// ============================================================================

/**
 * FileMaker Data API メッセージ
 */
export interface FMMessage {
  code: string;
  message: string;
}

/**
 * FileMaker Data API 共通レスポンス
 */
export interface FMResponse<T> {
  response: T;
  messages: FMMessage[];
}

// ============================================================================
// フィールドメタデータ型
// ============================================================================

/**
 * フィールドの種別
 */
export type FMFieldType = 'normal' | 'calculation' | 'summary';

/**
 * フィールドの表示タイプ
 */
export type FMDisplayType =
  | 'editText'
  | 'popupList'
  | 'checkbox'
  | 'radioButtons'
  | 'selectionList'
  | 'calendar'
  | 'secureText';

/**
 * フィールドの結果型（データ型）
 */
export type FMResultType = 'text' | 'number' | 'date' | 'time' | 'timestamp' | 'container';

/**
 * フィールドメタデータ
 * GET /layouts/{name} から返されるフィールド情報
 */
export interface FMFieldMetaData {
  name: string;
  type: FMFieldType;
  displayType: FMDisplayType;
  result: FMResultType;
  global: boolean;
  autoEnter: boolean;
  fourDigitYear: boolean;
  maxRepeat: number;
  maxCharacters: number;
  notEmpty: boolean;
  numeric: boolean;
  repetitions: number;
  timeOfDay: boolean;
}

// ============================================================================
// レイアウトメタデータ型
// ============================================================================

/**
 * レイアウトメタデータレスポンス
 * GET /layouts/{name} から返される完全なメタデータ
 */
export interface FMLayoutMetadataResponse {
  fieldMetaData: FMFieldMetaData[];
  portalMetaData: Record<string, FMFieldMetaData[]>;
  valueLists?: Record<string, string[]>;
}

// ============================================================================
// レコード型
// ============================================================================

/**
 * ポータルレコード
 * ポータル内の個別レコード
 */
export interface FMPortalRecord {
  recordId: string;
  modId: string;
  [fieldName: string]: unknown;
}

/**
 * FileMakerレコード
 * レコード取得・検索結果の個別レコード
 */
export interface FMRecord {
  recordId: string;
  modId: string;
  fieldData: Record<string, unknown>;
  portalData?: Record<string, FMPortalRecord[]>;
}

/**
 * データ情報
 * レコード取得時に返されるメタ情報
 */
export interface FMDataInfo {
  database: string;
  layout: string;
  table: string;
  totalRecordCount: number;
  foundCount: number;
  returnedCount: number;
}

/**
 * レコードレスポンス
 * GET /records, POST /_find から返されるレコードデータ
 */
export interface FMRecordResponse {
  data: FMRecord[];
  dataInfo: FMDataInfo;
}

// ============================================================================
// 検索・ソート型
// ============================================================================

/**
 * 検索演算子
 */
export interface FindOperator {
  omit?: boolean;
}

/**
 * 検索クエリ
 * POST /_find で使用する検索条件
 */
export interface FindQuery {
  [fieldName: string]: string | FindOperator;
}

/**
 * ソート順序
 */
export type SortOrderDirection = 'ascend' | 'descend';

/**
 * ソート指定
 */
export interface SortOrder {
  fieldName: string;
  sortOrder: SortOrderDirection;
}

// ============================================================================
// 認証関連型
// ============================================================================

/**
 * ログインレスポンス
 * POST /sessions から返される認証結果
 */
export interface FMLoginResponse {
  token: string;
}

/**
 * 外部データベース認証情報
 * 外部ファイルソース接続用
 */
export interface FMExternalDataSource {
  database: string;
  username: string;
  password: string;
}

// ============================================================================
// レイアウト・スクリプト一覧型
// ============================================================================

/**
 * レイアウト情報
 */
export interface FMLayoutInfo {
  name: string;
  isFolder?: boolean;
  folderLayoutNames?: FMLayoutInfo[];
}

/**
 * スクリプト情報
 */
export interface FMScriptInfo {
  name: string;
  isFolder?: boolean;
  folderScriptNames?: FMScriptInfo[];
}

/**
 * レイアウト一覧レスポンス
 */
export interface FMLayoutsResponse {
  layouts: FMLayoutInfo[];
}

/**
 * スクリプト一覧レスポンス
 */
export interface FMScriptsResponse {
  scripts: FMScriptInfo[];
}

// ============================================================================
// ユーティリティ型
// ============================================================================

/**
 * 型ガード: SessionToken
 */
export function isSessionToken(value: unknown): value is SessionToken {
  return typeof value === 'string' && value.length > 0;
}

/**
 * 型ガード: RecordId
 */
export function isRecordId(value: unknown): value is RecordId {
  return typeof value === 'string' && value.length > 0;
}

/**
 * SessionToken を作成
 */
export function createSessionToken(token: string): SessionToken {
  return token as SessionToken;
}

/**
 * RecordId を作成
 */
export function createRecordId(id: string | number): RecordId {
  return String(id) as RecordId;
}

/**
 * LayoutName を作成
 */
export function createLayoutName(name: string): LayoutName {
  return name as LayoutName;
}
