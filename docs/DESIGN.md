# 邪王炎殺黒龍 FileMaker MCP 設計書

**プロジェクト名**: Jaou Ensatsu Kokuryu FileMaker MCP
**バージョン**: 1.0.0（計画）
**作成日**: 2026年1月2日
**更新日**: 2026年1月2日
**ステータス**: 設計フェーズ

---

## 1. プロジェクト概要

### 1.1 目的

FileMaker Data APIを通じてFileMakerデータベースの**読み取り**と**高度な分析**を行うMCPサーバー。

既存MCPサーバーの良い点を統合し、セキュリティ問題を回避した新しいサーバーを構築する。

### 1.2 ポジショニング

```
┌─────────────────────────────────────────────────────────────────┐
│                    FileMaker MCP サーバー群                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  FileMaker-Server-DAPI-MCP    filemaker-mcp-server              │
│  ┌─────────────────────┐      ┌─────────────────────┐          │
│  │ ✅ 安全             │      │ ✅ 高度な分析       │          │
│  │ ✅ 読み取り機能充実 │      │ ⚠️ セキュリティ問題 │          │
│  │ ❌ 分析機能なし     │      │ ❌ 複数DB非対応     │          │
│  └─────────────────────┘      └─────────────────────┘          │
│              │                          │                       │
│              └──────────┬───────────────┘                       │
│                         ▼                                       │
│         ┌───────────────────────────────────────┐               │
│         │ 邪王炎殺黒龍 FileMaker MCP            │               │
│         │ ✅ 安全                               │               │
│         │ ✅ 読み取り機能充実                   │               │
│         │ ✅ 高度な分析機能（Data API制約内）   │               │
│         └───────────────────────────────────────┘               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 1.3 主要な特徴

| 特徴 | 説明 |
|------|------|
| **読み取り特化** | データ操作（CRUD）のうちRead機能に注力 |
| **高度な分析** | メタデータ集約、リレーション推測、ポータル分析 |
| **セキュリティ重視** | パスワードログ記録問題を回避 |
| **シンプル設計** | モノリシック構成で保守性を確保 |
| **制約の明示** | Data APIで取得できない情報を明確化 |

---

## 2. FileMaker Data API の制約事項

### 2.1 Data API で取得できる情報

| 情報 | エンドポイント | 備考 |
|------|--------------|------|
| レイアウト一覧 | `GET /layouts` | ✅ 完全取得可能 |
| フィールドメタデータ | `GET /layouts/{name}` | フィールド名、型、属性 |
| ポータルメタデータ | `GET /layouts/{name}` | `portalMetaData` セクション |
| スクリプト名一覧 | `GET /scripts` | 名前のみ（ステップは不可） |
| 値一覧の値 | `GET /layouts/{name}` | `valueLists` セクション |
| レコードデータ | `GET /layouts/{name}/records` | ✅ 完全取得可能 |

### 2.2 Data API で取得できない情報

| 情報 | 取得可否 | 代替手段 |
|------|---------|---------|
| テーブル定義 | ❌ | レイアウト経由で推測 |
| リレーション定義 | ❌ | ポータル名・フィールド名パターンから推測 |
| 計算式 | ❌ | なし |
| スクリプトステップ | ❌ | なし |
| アクセス権 | ❌ | なし |
| 値一覧の動的ソース | △ | 値のみ取得可能 |
| 隠しスクリプト | ❌ | 原理的に発見不可能 |

### 2.3 本プロジェクトの分析機能の実態

| 設計書での機能名 | 実際の動作 | 制限事項 |
|----------------|-----------|---------|
| `fm_export_database_metadata` | Data API経由で取得可能な情報を集約 | 真のDDRとは異なる |
| `fm_infer_relationships` | フィールド名パターン（`::`）から推測 | 定義ではなく推測 |
| `fm_analyze_portal_data` | ポータルメタデータとサンプルデータ取得 | ✅ 完全動作 |

---

## 3. 機能要件

### 3.1 ツール一覧（計16ツール）

#### Phase 1: 認証・基本機能（9ツール）- 必須

| No. | ツール名 | 機能 | 入力パラメータ | 出力 |
|-----|----------|------|----------------|------|
| 1 | `fm_login` | FileMakerサーバーにログイン | server?, database?, username?, password? | セッション情報 |
| 2 | `fm_logout` | セッション終了 | - | 成功/失敗 |
| 3 | `fm_validate_session` | セッション有効性確認 | - | 有効/無効 |
| 4 | `fm_get_layouts` | レイアウト一覧取得 | - | レイアウト配列 |
| 5 | `fm_get_layout_metadata` | レイアウトメタデータ取得 | layout | フィールド定義 |
| 6 | `fm_get_scripts` | スクリプト一覧取得 | - | スクリプト配列 |
| 7 | `fm_get_records` | レコード取得（ページング） | layout, offset, limit | レコード配列 |
| 8 | `fm_get_record_by_id` | ID指定でレコード取得 | layout, recordId | 単一レコード |
| 9 | `fm_find_records` | 条件検索 | layout, query, sort, offset, limit | レコード配列 |

#### Phase 2: 高度な分析機能（4ツール）- 優先度高

| No. | ツール名 | 機能 | 入力パラメータ | 出力 | 制限事項 |
|-----|----------|------|----------------|------|---------|
| 10 | `fm_export_database_metadata` | データベースメタデータ集約 | format, options | メタデータ | 真のDDRとは異なる |
| 11 | `fm_infer_relationships` | リレーション推測 | layout, depth | 推測結果 | 定義ではなく推測 |
| 12 | `fm_analyze_portal_data` | ポータル分析 | layout | ポータル構造・データ | ✅ 完全動作 |
| 13 | `fm_global_search_data` | 全レイアウト横断データ検索 | searchText, layouts | 検索結果 | レイアウト数に注意 |

#### Phase 3: 補助機能（3ツール）- 優先度低

| No. | ツール名 | 機能 | 入力パラメータ | 出力 |
|-----|----------|------|----------------|------|
| 14 | `fm_global_search_fields` | 全レイアウト横断フィールド検索 | fieldName, fieldType | フィールド一覧 |
| 15 | `fm_get_record_count` | レコード数取得 | layout | 件数 |
| 16 | `fm_list_value_lists` | 値一覧取得 | layout | 値一覧配列 |

> **注意**: `fm_discover_hidden_scripts` は削除しました。
> - 理由: スクリプト実行を試行するブルートフォース方式はセキュリティリスクが高い
> - Data APIのGET /scriptsは公開スクリプトのみ返却するため、「隠し」スクリプトの発見は原理的に不可能

### 3.2 機能詳細仕様

#### 3.2.1 fm_login

```typescript
interface LoginInput {
  // 環境変数から読み込む場合は省略可能
  server?: string;      // FileMakerサーバーURL
  database?: string;    // データベース名
  username?: string;    // ユーザー名
  password?: string;    // パスワード
}

interface LoginOutput {
  success: boolean;
  message: string;
  sessionInfo?: {
    database: string;
    server: string;
    // トークンは内部保持、外部には返さない
  };
}
```

#### 3.2.2 fm_validate_session

```typescript
/**
 * セッション有効性確認
 *
 * 実装方針:
 * Data APIにはセッション検証専用エンドポイントがないため、
 * 認証済みエンドポイント（GET /layouts）を呼び出してセッション有効性を確認する。
 *
 * ⚠️ 注意:
 * - /layouts は _limit パラメータをサポートしない（Data API仕様）
 * - 全レイアウト一覧が返却されるが、通常は数十〜数百件程度のため許容範囲
 * - レスポンスのパースは最小限に抑え、成功/失敗のみを判定
 *
 * ⚠️ 性能に関する注意:
 * - レイアウト数が数百件以上の大規模環境では、セッション検証が遅くなる可能性あり
 * - 頻繁な検証が必要な場合は、呼び出し頻度を制限するか、キャッシュ戦略を検討
 * - 他のエンドポイント（scripts等）も検討可能だが、本設計では /layouts を採用
 */
interface ValidateSessionOutput {
  valid: boolean;
  message: string;
  sessionAge?: number;  // セッション経過時間（秒）
}

// 実装例
async function validateSession(): Promise<ValidateSessionOutput> {
  try {
    // 認証済みエンドポイントでセッション検証
    // 注: /layouts は _limit 非対応のため全件返却される
    await this.request('GET', `/layouts`);
    return {
      valid: true,
      message: 'Session is valid',
      sessionAge: this.getSessionAge()
    };
  } catch (error) {
    if (error.status === 401) {
      return { valid: false, message: 'Session expired or invalid' };
    }
    throw error;
  }
}
```

#### 3.2.3 fm_export_database_metadata（旧 fm_export_ddr）

```typescript
/**
 * データベースメタデータ集約
 *
 * ⚠️ 制限事項:
 * - テーブル定義（フィールド計算式、バリデーション等）は取得不可
 * - スクリプトステップは取得不可（スクリプト名のみ）
 * - リレーション定義は取得不可（ポータル情報から推測のみ）
 * - 真のDDR（FileMaker Advanced からのエクスポート）とは異なる
 *
 * ✅ 取得可能:
 * - レイアウト一覧とフィールドメタデータ
 * - ポータル構成
 * - スクリプト名一覧
 * - フィールドの型・属性情報
 */
interface ExportDatabaseMetadataInput {
  format: 'json' | 'xml' | 'html';
  options?: {
    includeLayouts?: boolean;      // デフォルト: true
    includeScripts?: boolean;      // デフォルト: true
    includeValueLists?: boolean;   // デフォルト: true
    includePortalAnalysis?: boolean; // デフォルト: true
  };
}

interface ExportDatabaseMetadataOutput {
  format: string;
  data: DatabaseMetadata;
  generatedAt: string;
  limitations: string[];  // 明示的に制限を記載
}

interface DatabaseMetadata {
  database: {
    name: string;
    server: string;
  };
  layouts: LayoutMetadata[];
  scripts: ScriptMetadata[];
  valueLists?: ValueListMetadata[];
  inferredRelationships?: InferredRelationship[];  // 推測であることを明示
}

interface LayoutMetadata {
  name: string;
  fields: FieldMetadata[];
  portals: PortalMetadata[];
}

interface FieldMetadata {
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

interface PortalMetadata {
  name: string;
  relatedTableName: string;  // ポータル名から推測
  fields: FieldMetadata[];
}

interface ScriptMetadata {
  name: string;
  // 注意: スクリプトステップは取得不可
  isAvailable: boolean;
}

interface ValueListMetadata {
  name: string;
  values: string[];
}

interface InferredRelationship {
  sourceLayout: string;
  portalName: string;
  inferredTargetTable: string;
  confidence: 'high' | 'medium' | 'low';
  inferenceMethod: 'portal_name' | 'field_pattern';
}
```

#### 3.2.4 fm_infer_relationships（旧 fm_analyze_relationships）

```typescript
/**
 * リレーション推測
 *
 * ⚠️ 重要: この機能は「推測」であり、実際のリレーション定義ではありません
 *
 * 推測方法:
 * 1. フィールド名に "::" が含まれる場合、リレーション先と推定
 * 2. ポータル名から関連テーブルを推定
 * 3. フィールド命名パターン（xxx_id, xxx_ID等）から外部キーを推定
 */
interface InferRelationshipsInput {
  layout: string;
  depth?: number;  // 推測の深さ（1-3）、デフォルト: 1
}

interface InferRelationshipsOutput {
  layout: string;
  inferredRelationships: InferredRelationship[];
  inferredForeignKeys: InferredForeignKey[];
  summary: {
    totalInferred: number;
    confidenceBreakdown: {
      high: number;
      medium: number;
      low: number;
    };
  };
  disclaimer: string;  // 「これは推測であり、実際の定義とは異なる場合があります」
}

interface InferredRelationship {
  name: string;
  sourceTable: string;
  targetTable: string;
  sourceField?: string;
  targetField?: string;
  type: 'one-to-one' | 'one-to-many' | 'many-to-many' | 'unknown';
  confidence: 'high' | 'medium' | 'low';
  inferenceMethod: string;
}

interface InferredForeignKey {
  fieldName: string;
  inferredReferencedTable: string;
  confidence: 'high' | 'medium' | 'low';
  inferenceReason: string;  // 例: "フィールド名が '_id' で終わる"
}
```

#### 3.2.5 fm_analyze_portal_data

```typescript
/**
 * ポータル分析
 *
 * ✅ この機能はData APIで完全にサポートされています
 */
interface AnalyzePortalInput {
  layout: string;
  includeSampleData?: boolean;  // デフォルト: true
  sampleLimit?: number;         // デフォルト: 5
}

interface AnalyzePortalOutput {
  layout: string;
  portals: PortalAnalysis[];
  summary: {
    totalPortals: number;
    relatedTables: string[];
  };
}

interface PortalAnalysis {
  name: string;
  relatedTableName: string;
  fields: FieldMetadata[];
  recordCount: number;
  sampleData?: Record<string, unknown>[];
}
```

#### 3.2.6 fm_global_search_data

```typescript
/**
 * 全レイアウト横断データ検索
 *
 * ⚠️ 重要な制限事項:
 * - Data API には「全フィールド全文検索」機能がない
 * - 本ツールはレイアウト単位で _find を複数回実行するOR検索方式
 * - 真の全文検索ではなく、指定フィールドに対するOR検索
 *
 * 検索ルール:
 * 1. 対象レイアウトは明示的に指定（省略時はエラー）
 * 2. 検索対象フィールドは自動選定（text/number/date/time/timestamp）
 * 3. global フィールドは常に除外
 * 4. calculation/summary フィールドはデフォルト除外（includeCalculations: true で含める）
 * 5. 1レイアウトあたり最大50フィールドに制限（実用性を考慮）
 */
interface GlobalSearchDataInput {
  searchText: string;           // 検索文字列
  layouts: string[];            // 検索対象レイアウト（必須、1-10件）
  options?: {
    maxFieldsPerLayout?: number;  // デフォルト: 50（実用的なレイアウトサイズを考慮）
    maxRecordsPerLayout?: number; // デフォルト: 100（十分な検索結果を取得）
    includeCalculations?: boolean; // デフォルト: false
    searchMode?: 'contains' | 'exact' | 'startsWith'; // デフォルト: 'contains'
  };
}

interface GlobalSearchDataOutput {
  searchText: string;
  results: LayoutSearchResult[];
  summary: {
    totalLayouts: number;
    totalRecordsFound: number;
    searchedLayouts: string[];
    skippedLayouts: string[];  // フィールドなし等でスキップ
  };
  limitations: string[];  // 制限事項の説明
  disclaimer: string;     // 「全文検索ではない」旨の免責
}

interface LayoutSearchResult {
  layout: string;
  recordCount: number;
  records: SearchResultRecord[];
  searchedFields: string[];    // 実際に検索したフィールド
  matchedFields?: string[];    // ヒットしたと推定されるフィールド
}

interface SearchResultRecord {
  recordId: string;
  fieldData: Record<string, unknown>;
}

/**
 * 実装詳細
 */

// 検索対象フィールドの選定（型情報も保持）
function selectSearchableFields(
  fieldMetaData: FMFieldMetaData[],
  maxFields: number = 12,
  includeCalculations: boolean = false
): Array<{ name: string; result: string }> {
  return fieldMetaData
    .filter(f => {
      // 検索可能な型のみ
      const searchableTypes = ['text', 'number', 'date', 'time', 'timestamp'];
      if (!searchableTypes.includes(f.result)) return false;
      // global は常に除外
      if (f.global) return false;
      // calculation/summary は includeCalculations オプションで制御
      if (!includeCalculations && (f.type === 'calculation' || f.type === 'summary')) {
        return false;
      }
      return true;
    })
    .slice(0, maxFields)  // 上限適用
    .map(f => ({ name: f.name, result: f.result }));  // 型情報も返す
}

// クエリ構築（OR検索）
// ⚠️ 注意: ワイルドカード（*）はテキスト型にのみ適用
// number/date/time/timestamp にはワイルドカードを使用しない
function buildSearchQuery(
  searchText: string,
  fields: Array<{ name: string; result: string }>,  // フィールド名と型情報
  mode: 'contains' | 'exact' | 'startsWith'
): FindQuery[] {
  // 各フィールドに対してOR条件を作成（型に応じてフォーマット）
  return fields.map(field => {
    let formattedText: string;

    if (field.result === 'text') {
      // テキスト型のみワイルドカード適用
      formattedText = mode === 'contains' ? `*${searchText}*`
        : mode === 'startsWith' ? `${searchText}*`
        : searchText;
    } else {
      // number/date/time/timestamp は完全一致のみ
      formattedText = searchText;
    }

    return { [field.name]: formattedText };
  });
}

// 使用例
// searchText = "ABC", fields = [{name: "顧客名", result: "text"}, {name: "電話", result: "text"}]
// → query: [{"顧客名": "*ABC*"}, {"電話": "*ABC*"}]
// searchText = "100", fields = [{name: "金額", result: "number"}]
// → query: [{"金額": "100"}]  ※ ワイルドカードなし

/**
 * スロットリング設定
 */
const GLOBAL_SEARCH_THROTTLE = {
  maxConcurrentLayouts: 3,     // 同時実行数
  delayBetweenRequestsMs: 100, // リクエスト間隔
  timeoutPerLayoutMs: 10000,   // レイアウトごとのタイムアウト
  totalTimeoutMs: 60000,       // 全体タイムアウト
};
```

#### 3.2.7 fm_global_search_fields

```typescript
/**
 * 全レイアウト横断フィールド検索
 *
 * 指定した名前パターンまたは型に一致するフィールドを
 * 全レイアウトから検索する
 */
interface GlobalSearchFieldsInput {
  fieldName?: string;           // フィールド名（部分一致）
  fieldType?: 'text' | 'number' | 'date' | 'time' | 'timestamp' | 'container';
  options?: {
    maxLayouts?: number;        // デフォルト: 50（より多くのレイアウトを対象に）
    maxResults?: number;        // デフォルト: 500（十分な結果を取得）
  };
}

interface GlobalSearchFieldsOutput {
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

interface FieldSearchResult {
  layout: string;
  field: string;
  result: string;       // フィールド型（text, number等）
  displayType: string;  // 表示タイプ
  type: string;         // フィールド種別（normal, calculation等）
}
```

#### 3.2.8 fm_get_record_count

```typescript
/**
 * レコード数取得
 *
 * 実装方針:
 * POST /_find はクエリ必須のため使用せず、
 * GET /records?_limit=1 で dataInfo.totalRecordCount を取得する
 */
interface GetRecordCountInput {
  layout: string;
}

interface GetRecordCountOutput {
  layout: string;
  totalRecordCount: number;
  foundCount: number;  // 通常は totalRecordCount と同じ
}

// 実装例
async function getRecordCount(layout: string): Promise<GetRecordCountOutput> {
  // _limit=1 で最小限のデータを取得
  const response = await this.request('GET', `/layouts/${layout}/records?_limit=1`);
  const dataInfo = response.dataInfo;

  return {
    layout,
    totalRecordCount: dataInfo.totalRecordCount,
    foundCount: dataInfo.foundCount,
  };
}
```

---

## 4. 型定義

### 4.1 FileMaker Data API レスポンス型

```typescript
// types/filemaker.ts

/** FileMaker Data API 共通レスポンス */
interface FMResponse<T> {
  response: T;
  messages: FMMessage[];
}

interface FMMessage {
  code: string;
  message: string;
}

/** レイアウトメタデータレスポンス */
interface FMLayoutMetadataResponse {
  fieldMetaData: FMFieldMetaData[];
  portalMetaData: Record<string, FMFieldMetaData[]>;
  valueLists?: Record<string, string[]>;
}

interface FMFieldMetaData {
  name: string;
  type: 'normal' | 'calculation' | 'summary';
  displayType: 'editText' | 'popupList' | 'checkbox' | 'radioButtons' | 'selectionList' | 'calendar' | 'secureText';
  result: 'text' | 'number' | 'date' | 'time' | 'timestamp' | 'container';
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

/** レコードレスポンス */
interface FMRecordResponse {
  data: FMRecord[];
  dataInfo: FMDataInfo;
}

interface FMRecord {
  recordId: string;
  modId: string;
  fieldData: Record<string, unknown>;
  portalData?: Record<string, FMPortalRecord[]>;
}

interface FMPortalRecord {
  recordId: string;
  modId: string;
  [fieldName: string]: unknown;
}

interface FMDataInfo {
  database: string;
  layout: string;
  table: string;
  totalRecordCount: number;
  foundCount: number;
  returnedCount: number;
}

/** 検索クエリ型 */
interface FindQuery {
  [fieldName: string]: string | FindOperator;
}

interface FindOperator {
  omit?: boolean;
}

interface SortOrder {
  fieldName: string;
  sortOrder: 'ascend' | 'descend';
}

/** Branded Types（型安全な識別子） */
type SessionToken = string & { readonly brand: unique symbol };
type RecordId = string & { readonly brand: unique symbol };
type LayoutName = string & { readonly brand: unique symbol };
```

---

## 5. エラーハンドリング

### 5.1 エラーコード体系

| コード範囲 | カテゴリ | 詳細コード |
|-----------|---------|-----------|
| 1000-1099 | 認証エラー | 1001: 認証情報不正, 1002: サーバー接続不可, 1003: DB不存在, 1004: 権限不足, 1005: アカウントロック |
| 2000-2099 | セッションエラー | 2001: セッション期限切れ, 2002: セッション無効, 2003: 同時接続数超過 |
| 3000-3099 | APIエラー | 3001: レイアウト不存在, 3002: レコード不存在, 3003: フィールド不存在, 3004: クエリ不正, 3005: 権限不足, 3006: レート制限 |
| 4000-4099 | 分析エラー | 4001: メタデータ取得失敗, 4002: ポータル分析失敗, 4003: タイムアウト |
| 5000-5099 | 内部エラー | 5001: 予期しないエラー, 5002: 設定エラー, 5003: メモリ不足 |

### 5.2 FileMaker Data API エラーマッピング

```typescript
/**
 * エラーマッピング
 *
 * HTTP ステータスと FileMaker エラーコードは別マップで管理する。
 * 適用順序:
 * 1. FileMaker エラーコード（レスポンス内）が存在すれば FM_ERROR_MAP を優先
 * 2. FM エラーコードがなければ HTTP ステータスで判定
 * 3. 両方不明なら 5001 / Unknown error
 *
 * 理由: HTTP 401 は「セッション期限切れ」だが、FM 401 は「レコード該当なし」。
 *       FM 固有のセマンティクスを尊重するため、FM コードを優先する。
 */

/** エラー情報の型定義 */
interface ErrorInfo {
  code: number;
  message: string;
  retryable: boolean;
}

// HTTP ステータス → 内部エラー
const HTTP_ERROR_MAP: Record<number, { code: number; message: string; retryable: boolean }> = {
  400: { code: 3004, message: 'Bad request', retryable: false },
  401: { code: 2001, message: 'Session expired', retryable: true },
  403: { code: 1004, message: 'Insufficient privileges', retryable: false },
  404: { code: 3001, message: 'Resource not found', retryable: false },
  409: { code: 3004, message: 'Conflict', retryable: false },
  413: { code: 3004, message: 'Payload too large', retryable: false },
  429: { code: 3006, message: 'Rate limited - too many requests', retryable: true },
  500: { code: 5001, message: 'FileMaker server error', retryable: true },
  503: { code: 1002, message: 'FileMaker server unavailable', retryable: true },
};

// FileMaker エラーコード → 内部エラー
const FM_ERROR_MAP: Record<number, { code: number; message: string; retryable: boolean }> = {
  100: { code: 3002, message: 'File is missing', retryable: false },
  101: { code: 3002, message: 'Record is missing', retryable: false },
  102: { code: 3003, message: 'Field is missing', retryable: false },
  105: { code: 3001, message: 'Layout is missing', retryable: false },
  212: { code: 1001, message: 'Invalid username or password', retryable: false },
  214: { code: 1005, message: 'Account is locked out', retryable: false },
  400: { code: 3004, message: 'Find criteria are empty', retryable: false },
  401: { code: 3002, message: 'No records match the request', retryable: false },
  802: { code: 1002, message: 'Unable to open file', retryable: true },
  952: { code: 1004, message: 'Insufficient access privileges', retryable: false },
};

// エラー解決関数
function resolveError(httpStatus: number, fmErrorCode?: number): ErrorInfo {
  // 1. FileMaker エラーコードが存在すれば優先
  if (fmErrorCode !== undefined && FM_ERROR_MAP[fmErrorCode]) {
    return FM_ERROR_MAP[fmErrorCode];
  }
  // 2. HTTP ステータスで判定
  if (HTTP_ERROR_MAP[httpStatus]) {
    return HTTP_ERROR_MAP[httpStatus];
  }
  // 3. 不明なエラー
  return { code: 5001, message: 'Unknown error', retryable: false };
}
```

### 5.3 エラーレスポンス形式

```typescript
interface ErrorResponse {
  success: false;
  error: {
    code: number;
    message: string;
    details?: string;        // パスワード等は含めない
    fmErrorCode?: number;    // 元のFileMakerエラーコード（デバッグ用）
    retryable: boolean;      // リトライ可能かどうか
  };
}

// 使用例: resolveError を活用したエラー生成
function createError(httpStatus: number, fmErrorCode?: number, context?: string): ErrorResponse {
  const errorInfo = resolveError(httpStatus, fmErrorCode);
  return {
    success: false,
    error: {
      code: errorInfo.code,
      message: errorInfo.message,
      details: context,
      fmErrorCode: fmErrorCode,
      retryable: errorInfo.retryable  // マップから取得（二重定義を回避）
    }
  };
}
```

### 5.4 リトライに関する方針

```typescript
/**
 * リトライ戦略について
 *
 * 本MCPサーバーでは、自動リトライ機能を実装しない。
 *
 * 理由:
 * 1. MCPサーバーはData APIのラッパーであり、リトライ判断はクライアント（Claude等）に委ねるべき
 * 2. 401（セッション切れ）は再ログインが必要であり、単純リトライでは解決しない
 * 3. Claudeは retryable フラグを見て適切な再試行判断ができる
 *
 * retryable フラグの用途:
 * - ErrorResponse に含まれる retryable: boolean はクライアントへの参考情報
 * - true: 何らかの対処（待機、再ログイン等）で復旧可能
 *   - 例: 401 セッション切れ（再ログインで復旧）
 *   - 例: 502/503/504 サーバー一時障害（待機で復旧）
 *   - 例: 429 レート制限（待機で復旧）
 * - false: 対処しても同じ結果になる可能性が高い
 *   - 例: 404 リソースなし、403 権限不足、400 不正リクエスト
 *
 * クライアント側での推奨対応:
 * - retryable: true → エラー内容に応じた対処後に再試行
 *   - 401: fm_login で再ログイン後に再試行
 *   - 429/5xx: 数秒待って再試行
 * - retryable: false → 再試行せず、リクエスト内容やパラメータを見直す
 */

// エラーマッピングの retryable フラグがクライアントへの情報提供として機能する
// 実装例は 5.2 エラーマッピング および 5.3 エラーレスポンス形式 を参照
```

---

## 6. 非機能要件

### 6.1 セキュリティ要件

| 要件ID | 要件 | 実装方針 |
|--------|------|---------|
| SEC-001 | パスワードをログに記録しない | console.log/writeFileでの出力禁止 |
| SEC-002 | デバッグログは環境変数で制御 | `LOG_LEVEL`環境変数で制御 |
| SEC-003 | /tmp等への書き込み禁止 | ファイルシステムへのログ出力なし |
| SEC-004 | エラーメッセージのサニタイズ | 認証情報を含まないエラーメッセージ |
| SEC-005 | HTTPS通信必須 | HTTP接続は拒否 |
| SEC-006 | SSL検証無効化時の警告 | `FM_SSL_VERIFY=false`設定時に警告ログ出力 |

### 6.2 セキュアなログ設定

```typescript
enum LogLevel {
  TRACE = 0,  // 詳細なデバッグ情報
  DEBUG = 1,  // デバッグ情報
  INFO = 2,   // 一般的な情報
  WARN = 3,   // 警告
  ERROR = 4,  // エラー
  NONE = 5,   // ログなし
}

// 環境変数: LOG_LEVEL=INFO（デフォルト: WARN）

// SSL検証無効化時の警告
if (!config.sslVerify) {
  logger.warn('SEC-006: SSL certificate verification is disabled. ' +
    'This is insecure and should only be used in development.');
}
```

### 6.3 認証情報の安全な管理

```markdown
## 認証情報の安全な設定方法

### 推奨: 環境変数（直接設定）
```bash
export FM_SERVER="https://your-server.com"
export FM_DATABASE="your-database"
export FM_USERNAME="your-username"
export FM_PASSWORD="your-password"
```

### 非推奨: .mcp.json への直接記載
⚠️ .mcp.json にパスワードを記載しないでください。
代わりに環境変数参照を使用してください。

### 6.4 パフォーマンス要件

| 要件ID | 要件 | 目標値 |
|--------|------|--------|
| PERF-001 | 認証レスポンス | 3秒以内 |
| PERF-002 | メタデータ取得 | 5秒以内 |
| PERF-003 | レコード検索（100件） | 5秒以内 |
| PERF-004 | メタデータ集約エクスポート | 30秒以内 |
| PERF-005 | グローバル検索（10レイアウト） | 60秒以内 |

### 6.5 互換性要件

| 要件ID | 要件 | 詳細 |
|--------|------|------|
| COMP-001 | FileMaker Server バージョン | 19.x, 20.x, 21.x |
| COMP-002 | Data API バージョン | v1, v2, vLatest |
| COMP-003 | Node.js バージョン | 24.x 以上 ※1 |
| COMP-004 | MCP SDK バージョン | 1.x |

> **※1 Node.js 24.x 以上を要件とする理由**:
> - **Native ESM サポート**: `--experimental-require-module` フラグなしでESMをサポート
> - **組み込み fetch API**: 外部HTTPライブラリ依存を削減
> - **TypeScript 5.5+ 互換性**: 最新のTypeScript機能をフル活用
> - **パフォーマンス改善**: V8エンジンの最適化によるJSON処理高速化
> - **長期サポート見込み**: 2024年後半からLTSとして安定稼働予定
>
> 普及率を考慮する場合は Node.js 22.x LTS への緩和も可能だが、上記機能を活用するため24.xを推奨。

---

## 7. システム設計

### 7.1 ディレクトリ構成

```
jaou-ensatsu-kokuryu-filemaker-mcp/
├── package.json
├── tsconfig.json
├── .env.example
├── README.md
├── src/
│   ├── index.ts                 # エントリーポイント
│   ├── server.ts                # MCPサーバー定義
│   ├── config.ts                # 設定管理
│   ├── tools/                   # ツール定義
│   │   ├── index.ts             # ツール登録
│   │   ├── auth.ts              # 認証系ツール
│   │   ├── metadata.ts          # メタデータ取得系
│   │   ├── records.ts           # レコード操作系
│   │   └── analysis.ts          # 分析系ツール
│   ├── api/                     # FileMaker API クライアント
│   │   ├── client.ts            # HTTPクライアント
│   │   ├── session.ts           # セッション管理
│   │   ├── endpoints.ts         # APIエンドポイント定義
│   │   └── error-mapper.ts      # エラーマッピング
│   ├── analyzers/               # 分析ロジック
│   │   ├── metadata-aggregator.ts    # メタデータ集約（旧DDR）
│   │   ├── relationship-inferrer.ts  # リレーション推測
│   │   ├── portal-analyzer.ts        # ポータル分析
│   │   └── global-searcher.ts        # グローバル検索
│   ├── types/                   # 型定義
│   │   ├── filemaker.ts         # FileMaker関連型
│   │   ├── tools.ts             # ツール入出力型
│   │   └── analysis.ts          # 分析結果型
│   └── utils/                   # ユーティリティ
│       ├── logger.ts            # セキュアなロガー
│       └── sanitizer.ts         # 入力サニタイズ
└── tests/                       # テスト
    ├── unit/
    │   ├── analyzers/
    │   └── utils/
    └── mocks/
```

### 7.2 クラス図

```
┌─────────────────────────────────────────────────────────────────┐
│                         MCPServer                               │
│  - server: Server                                               │
│  - tools: Map<string, Tool>                                     │
│  + start(): Promise<void>                                       │
│  + registerTools(): void                                        │
└─────────────────────────────────────────────────────────────────┘
                                │
                                │ uses
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      FileMakerClient                            │
│  - sessionManager: SessionManager                               │
│  - config: Config                                               │
│  - errorMapper: ErrorMapper                                     │
│  + login(credentials): Promise<void>                            │
│  + logout(): Promise<void>                                      │
│  + request(endpoint, method, data): Promise<Response>           │
│  + validateSession(): Promise<boolean>                          │
└─────────────────────────────────────────────────────────────────┘
                                │
                                │ uses
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      SessionManager                             │
│  - sessions: Map<string, Session>                               │
│  + getSession(id): Session | undefined                          │
│  + createSession(config): Promise<Session>                      │
│  + destroySession(id): Promise<void>                            │
│  + isSessionValid(id): boolean                                  │
└─────────────────────────────────────────────────────────────────┘
                                │
                                │ manages
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Session                                 │
│  - token: SessionToken                                          │
│  - database: string                                             │
│  - server: string                                               │
│  - createdAt: Date                                              │
│  - expiresAt: Date                                              │
│  + isValid(): boolean                                           │
│  + getAge(): number                                             │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                       Analyzers                                 │
├─────────────────────────────────────────────────────────────────┤
│  MetadataAggregator     │  RelationshipInferrer                 │
│  - client: Client       │  - client: Client                     │
│  + aggregate(): Data    │  + infer(layout): Relationships       │
├─────────────────────────┼─────────────────────────────────────────┤
│  PortalAnalyzer         │  GlobalSearcher                       │
│  - client: Client       │  - client: Client                     │
│  + analyze(): Portals   │  + search(text): Results              │
└─────────────────────────────────────────────────────────────────┘
```

---

## 8. API設計

### 8.1 FileMaker Data API エンドポイント使用一覧

| エンドポイント | メソッド | 使用ツール | 備考 |
|---------------|----------|-----------|------|
| `/fmi/data/{version}/databases/{db}/sessions` | POST | fm_login | 認証 |
| `/fmi/data/{version}/databases/{db}/sessions/{token}` | DELETE | fm_logout | セッション終了 |
| `/fmi/data/{version}/databases/{db}/layouts` | GET | fm_get_layouts, fm_validate_session, fm_export_database_metadata | ※_limit非対応 |
| `/fmi/data/{version}/databases/{db}/layouts/{layout}` | GET | fm_get_layout_metadata, fm_analyze_portal_data, fm_global_search_fields | メタデータ取得 |
| `/fmi/data/{version}/databases/{db}/scripts` | GET | fm_get_scripts | スクリプト一覧 |
| `/fmi/data/{version}/databases/{db}/layouts/{layout}/records` | GET | fm_get_records, fm_get_record_count | ※_limit=1で件数取得 |
| `/fmi/data/{version}/databases/{db}/layouts/{layout}/records/{id}` | GET | fm_get_record_by_id | 単一レコード |
| `/fmi/data/{version}/databases/{db}/layouts/{layout}/_find` | POST | fm_find_records, fm_global_search_data | ※クエリ必須 |

### 8.2 環境変数

| 変数名 | 必須 | デフォルト | 説明 |
|--------|------|-----------|------|
| `FM_SERVER` | Yes | - | FileMakerサーバーURL |
| `FM_DATABASE` | Yes | - | データベース名 |
| `FM_USERNAME` | Yes | - | ユーザー名 |
| `FM_PASSWORD` | Yes | - | パスワード |
| `FM_API_VERSION` | No | `vLatest` | Data APIバージョン |
| `FM_SSL_VERIFY` | No | `true` | SSL証明書検証 |
| `LOG_LEVEL` | No | `WARN` | ログレベル (TRACE/DEBUG/INFO/WARN/ERROR/NONE) |
| `FM_SESSION_TIMEOUT` | No | `840` | セッションタイムアウト（秒）※FileMakerデフォルトは15分 |

---

## 9. テスト計画

### 9.1 テスト種別

| 種別 | 対象 | ツール |
|------|------|--------|
| 単体テスト | Analyzers, Utils, ErrorMapper | Jest |
| モック統合テスト | API Client + Mock Server | Jest + MSW |

> **注意**: 統合テストは実施しません（FileMaker環境依存のため）

### 9.2 テストケース（主要）

| ID | テスト内容 | 期待結果 |
|----|-----------|---------|
| T-001 | 正常ログイン | セッション確立 |
| T-002 | 不正パスワードでログイン | エラー返却（パスワード非表示） |
| T-003 | セッション切れ後のリクエスト | エラー返却（code: 2001, retryable: true） |
| T-004 | メタデータ集約（JSON） | 有効なJSONデータ + 制限事項表示 |
| T-005 | 存在しないレイアウト指定 | 適切なエラー（3001） |
| T-006 | FileMakerエラーコードマッピング | 全エラーコードの正しいマッピング |
| T-007 | SSL無効化時の警告ログ | 警告メッセージ出力 |
| T-008 | リレーション推測 | 推測結果 + disclaimer表示 |
| T-009 | fm_validate_session（有効セッション） | valid: true、sessionAge 含む |
| T-010 | fm_validate_session（期限切れ） | valid: false、適切なメッセージ |
| T-011 | fm_get_record_count（正常） | totalRecordCount が数値 |
| T-012 | fm_get_record_count（空レイアウト） | totalRecordCount: 0 |
| T-013 | fm_global_search_data（正常検索） | 結果 + limitations + disclaimer |
| T-014 | fm_global_search_data（上限超過レイアウト） | エラーまたは警告 |
| T-015 | fm_global_search_data（検索可能フィールドなし） | skippedLayouts に含まれる |
| T-016 | fm_global_search_fields（名前部分一致） | マッチするフィールド配列 |
| T-017 | fm_global_search_fields（型フィルタ） | 指定型のみ返却 |
| T-018 | HTTP_ERROR_MAP / FM_ERROR_MAP 分離 | 401重複が正しく解決される |

### 9.3 単体テスト重点カバー領域

```typescript
describe('SecuritySanitizer', () => {
  it('should never include password in error messages', () => {});
  it('should mask sensitive fields in logs', () => {});
});

describe('ErrorMapper', () => {
  it('should map all FileMaker API errors to internal codes', () => {});
  it('should handle unknown error codes gracefully', () => {});
  it('should identify retryable errors', () => {});
});

describe('SessionManager', () => {
  it('should detect expired sessions', () => {});
  it('should trigger re-authentication when configured', () => {});
});

describe('RelationshipInferrer', () => {
  it('should infer relationships from field patterns', () => {});
  it('should include disclaimer in output', () => {});
  it('should calculate confidence levels', () => {});
});
```

---

## 10. デプロイ・運用

### 10.1 インストール手順

```bash
# 1. リポジトリクローン
git clone https://github.com/your-org/jaou-ensatsu-kokuryu-filemaker-mcp.git
cd jaou-ensatsu-kokuryu-filemaker-mcp

# 2. 依存インストール
npm install

# 3. ビルド
npm run build

# 4. 環境変数設定
cp .env.example .env
# .envを編集

# 5. 動作確認
npm start
```

### 10.2 MCP設定（推奨方法）

```bash
# 環境変数を先に設定（推奨）
export FM_SERVER="https://your-server.com"
export FM_DATABASE="your-database"
export FM_USERNAME="your-username"
export FM_PASSWORD="your-password"
```

```json
{
  "mcpServers": {
    "jaou-filemaker": {
      "command": "node",
      "args": ["/path/to/jaou-ensatsu-kokuryu-filemaker-mcp/dist/index.js"]
    }
  }
}
```

> **⚠️ セキュリティ警告**: `.mcp.json` にパスワードを直接記載しないでください。
> 環境変数を使用することを強く推奨します。

---

## 11. 開発スケジュール（参考）

| Phase | 内容 |
|-------|------|
| Phase 1 | 基本機能（認証、読み取り、セッション管理） |
| Phase 2 | 分析機能（メタデータ集約、ポータル分析、リレーション推測） |
| Phase 3 | 補助機能（グローバル検索、値一覧） |
| Phase 4 | テスト・ドキュメント |

---

## 12. リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| FileMaker Data APIの制約 | 高 | 制約を設計書・ツール出力に明示 |
| セッションタイムアウト | 中 | retryable: true でクライアントに再ログインを促す |
| 大量データでのメモリ不足 | 中 | ページング必須、レイアウト数制限 |
| FileMakerバージョン差異 | 低 | エラーマッピングで吸収 |
| リレーション推測の誤り | 中 | disclaimerを必ず表示 |

---

## 13. 将来の拡張（参考）

以下は現時点では実装しないが、将来的に検討可能な機能：

| 機能 | 説明 |
|------|------|
| 書き込み機能 | Create, Update, Delete |
| 複数DB同時接続 | MCP-Claude-FileMaker方式 |
| キャッシュ機能 | メタデータキャッシュ |
| OttoFMS対応 | APIキー認証 |

---

## 14. 参考資料

- [FileMaker Data API ガイド](https://help.claris.com/en/data-api-guide/)
- [MCP SDK ドキュメント](https://modelcontextprotocol.io/)
- [FileMaker-Server-DAPI-MCP ソースコード](../FileMaker-Server-DAPI-MCP/)
- [filemaker-mcp-server ソースコード](../filemaker-mcp-server/)
- [FileMaker MCPサーバー比較](./FILEMAKER_MCP_COMPARISON.md)

---

## 更新履歴

| 日付 | 内容 | 担当 |
|------|------|------|
| 2026-01-02 | 初版作成 | - |
| 2026-01-02 | Data API制約を明示化、ツール名変更、エラーマッピング追加、セキュリティ強化 | レビュー対応 |
| 2026-01-02 | API_RATE_LIMITED (3006) をエラーコード体系に追加、HTTP 429マッピング修正 | Phase1実装対応 |
