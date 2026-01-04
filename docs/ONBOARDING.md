# Jaou Ensatsu Kokuryu FileMaker MCP - オンボーディングガイド

後任エンジニア向けの開発ガイドです。プロジェクト構造、各モジュールの役割、機能追加の手順を説明します。

---

## 目次

1. [プロジェクト概要](#プロジェクト概要)
2. [ディレクトリ構成](#ディレクトリ構成)
3. [アーキテクチャ](#アーキテクチャ)
4. [コアモジュール詳細](#コアモジュール詳細)
5. [ツール一覧と実装場所](#ツール一覧と実装場所)
6. [新規ツール追加の手順](#新規ツール追加の手順)
7. [型定義](#型定義)
8. [テスト](#テスト)
9. [開発コマンド](#開発コマンド)
10. [設計上の注意点](#設計上の注意点)

---

## プロジェクト概要

FileMaker Data API を通じてデータベースの**読み取り専用**操作を提供するMCPサーバーです。

### 設計原則

- **読み取り専用**: レコードの作成・更新・削除は意図的に非対応
- **セキュリティ重視**: パスワードのログ出力禁止、ファイルシステム書き込み禁止
- **推測ベースの分析**: Data APIの制約上、リレーション定義は推測で提供（disclaimer付き）

---

## ディレクトリ構成

```
jaou-ensatsu-kokuryu-filemaker-mcp/
├── src/
│   ├── index.ts              # エントリーポイント（main関数）
│   ├── server.ts             # MCPサーバー本体（ツール登録・リクエストハンドラ）
│   ├── config.ts             # 環境変数・設定管理
│   │
│   ├── api/                  # FileMaker Data API通信層
│   │   ├── index.ts          # re-export
│   │   ├── client.ts         # HTTPクライアント（FileMakerHttpClient）
│   │   ├── session.ts        # セッション管理（SessionManager）
│   │   └── error-mapper.ts   # エラーコード変換
│   │
│   ├── tools/                # MCPツール定義・ハンドラ
│   │   ├── index.ts          # 全ツールのre-export
│   │   ├── auth.ts           # 認証系ツール（login, logout, validate）
│   │   ├── metadata.ts       # メタデータ取得ツール
│   │   ├── records.ts        # レコード操作ツール
│   │   └── analysis.ts       # 分析系ツール
│   │
│   ├── analyzers/            # 高度な分析ロジック
│   │   ├── relationship-inferrer.ts  # リレーション推測
│   │   ├── metadata-aggregator.ts    # メタデータ集約
│   │   ├── portal-analyzer.ts        # ポータル分析
│   │   └── global-searcher.ts        # 横断検索
│   │
│   ├── types/                # 型定義
│   │   ├── index.ts          # re-export
│   │   ├── filemaker.ts      # FileMaker API型（FMRecord, FMFieldMetaData等）
│   │   └── tools.ts          # ツール入出力型
│   │
│   └── utils/                # ユーティリティ
│       ├── index.ts          # re-export
│       └── logger.ts         # ログ出力（パスワードマスク機能付き）
│
├── tests/                    # テストコード
│   └── unit/
│       ├── analyzers/        # アナライザのユニットテスト
│       ├── api/              # APIクライアントのテスト
│       ├── security/         # セキュリティテスト
│       └── utils/            # ユーティリティのテスト
│
├── docs/                     # ドキュメント
│   ├── DESIGN.md             # 設計ドキュメント
│   ├── IMPLEMENTATION_PLAN.md # 実装計画
│   ├── SECURITY.md           # セキュリティ仕様
│   └── ONBOARDING.md         # このファイル
│
└── scripts/                  # 開発用スクリプト
    ├── test-phase2-tools.ts  # Phase2ツールのテスト
    └── test-phase3-tools.ts  # Phase3ツールのテスト
```

---

## アーキテクチャ

```
┌─────────────────────────────────────────────────────────────┐
│                      MCP Client (Claude等)                   │
└─────────────────────────────────────────────────────────────┘
                              │ JSON-RPC (stdio)
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  src/index.ts                                                │
│  - main(): サーバー起動                                       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  src/server.ts                                               │
│  - createServer(): MCPサーバー構築                            │
│  - startServer(): トランスポート接続                          │
│  - ツール定義のTOOLS配列にハンドラを登録                       │
│  - tools/call リクエストをルーティング                        │
└─────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│  tools/auth.ts  │ │ tools/metadata  │ │ tools/analysis  │
│  認証系ツール    │ │ メタデータ取得   │ │ 分析系ツール     │
└─────────────────┘ └─────────────────┘ └─────────────────┘
              │               │               │
              └───────────────┼───────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  api/session.ts - SessionManager                             │
│  - login/logout管理                                          │
│  - セッショントークン保持                                     │
│  - withSession(): 認証が必要な操作のラッパー                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  api/client.ts - FileMakerHttpClient                         │
│  - HTTP通信の抽象化                                           │
│  - get/post/delete メソッド                                   │
│  - レスポンスのバリデーション                                  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   FileMaker Data API                         │
└─────────────────────────────────────────────────────────────┘
```

---

## コアモジュール詳細

### `src/index.ts` - エントリーポイント

```typescript
// main()関数がサーバーを起動
async function main(): Promise<void> {
  const server = createServer();
  await startServer(server);
}
```

**役割**: プロセス起動時の初期化処理のみ。ロジックは持たない。

---

### `src/server.ts` - MCPサーバー本体

**主要シンボル**:

| シンボル | 役割 |
|---------|------|
| `TOOLS` | 全ツール定義の配列。各ツールの `name`, `description`, `inputSchema` を保持 |
| `createServer()` | MCPサーバーインスタンスを生成し、ツールリスト・ツール呼び出しハンドラを登録 |
| `startServer()` | stdioトランスポートでサーバーを起動 |
| `formatToolResult()` | ツール実行結果をMCPレスポンス形式に変換 |
| `formatErrorResult()` | エラーをMCPレスポンス形式に変換 |

**ツール追加時の編集箇所**: `TOOLS` 配列と `tools/call` ハンドラ内のswitch文

---

### `src/config.ts` - 設定管理

**主要シンボル**:

| シンボル | 役割 |
|---------|------|
| `ENV_VARS` | 環境変数名の定数（FM_SERVER, FM_DATABASE等） |
| `CONFIG_DEFAULTS` | デフォルト値 |
| `FileMakerConfig` | 設定インターフェース |
| `loadConfigFromEnv()` | 環境変数から設定を読み込み |
| `validateConfig()` | 設定の妥当性検証 |
| `formatConfigForLog()` | ログ出力用にパスワードをマスク |

---

### `src/api/session.ts` - セッション管理

**主要クラス**: `SessionManager`

| メソッド | 役割 |
|---------|------|
| `login()` | FileMakerへログインしトークンを取得 |
| `logout()` | セッション終了 |
| `hasActiveSession()` | セッション有効判定 |
| `withSession()` | 認証済みコンテキストでコールバックを実行 |
| `getHttpClient()` | 認証済みHTTPクライアントを取得 |

**使用パターン**:
```typescript
const sessionManager = getSessionManager();
const result = await sessionManager.withSession(async (client, token) => {
  return await client.get(`/layouts/${layout}/records`, token);
});
```

---

### `src/api/client.ts` - HTTPクライアント

**主要クラス**: `FileMakerHttpClient`

| メソッド | 役割 |
|---------|------|
| `loginRequest()` | ログインAPI呼び出し（Basic認証） |
| `get()` | GET リクエスト（Bearer認証） |
| `post()` | POST リクエスト |
| `delete()` | DELETE リクエスト |

---

## ツール一覧と実装場所

### 認証系（`src/tools/auth.ts`）

| ツール名 | ハンドラ | 説明 |
|---------|---------|------|
| `fm_login` | `handleLogin()` | FileMakerへログイン |
| `fm_logout` | `handleLogout()` | セッション終了 |
| `fm_validate_session` | `handleValidateSession()` | セッション有効性確認 |

### メタデータ系（`src/tools/metadata.ts`）

| ツール名 | ハンドラ | 説明 |
|---------|---------|------|
| `fm_get_layouts` | `handleGetLayouts()` | レイアウト一覧取得 |
| `fm_get_layout_metadata` | `handleGetLayoutMetadata()` | フィールド定義取得 |
| `fm_get_scripts` | `handleGetScripts()` | スクリプト一覧取得 |
| `fm_list_value_lists` | `handleListValueLists()` | 値一覧取得 |

### レコード系（`src/tools/records.ts`）

| ツール名 | ハンドラ | 説明 |
|---------|---------|------|
| `fm_get_records` | `handleGetRecords()` | レコード取得（ページング対応） |
| `fm_get_record_by_id` | `handleGetRecordById()` | ID指定でレコード取得 |
| `fm_find_records` | `handleFindRecords()` | 検索クエリでレコード取得 |
| `fm_get_record_count` | `handleGetRecordCount()` | レコード件数取得 |

### 分析系（`src/tools/analysis.ts`）

| ツール名 | ハンドラ | 説明 |
|---------|---------|------|
| `fm_export_database_metadata` | `handleExportDatabaseMetadata()` | メタデータ一括エクスポート |
| `fm_infer_relationships` | `handleInferRelationships()` | リレーション推測 |
| `fm_analyze_portal_data` | `handleAnalyzePortalData()` | ポータル構造分析 |
| `fm_global_search_data` | `handleGlobalSearchData()` | 複数レイアウト横断検索 |
| `fm_global_search_fields` | `handleGlobalSearchFields()` | フィールド名検索 |

---

## 新規ツール追加の手順

### 手順1: ツール定義を作成

適切なファイル（`tools/auth.ts`, `tools/metadata.ts`, `tools/records.ts`, `tools/analysis.ts`）に追加するか、新しいカテゴリの場合は新規ファイルを作成。

```typescript
// src/tools/example.ts

import type { Tool } from "@modelcontextprotocol/sdk/types.js";

/**
 * 新規ツールの定義
 */
export const EXAMPLE_TOOLS: Tool[] = [
  {
    name: "fm_example_tool",
    description: "ツールの説明文（AIが理解できるよう詳細に記載）",
    inputSchema: {
      type: "object" as const,
      properties: {
        param1: {
          type: "string",
          description: "パラメータ1の説明",
        },
        param2: {
          type: "number",
          description: "パラメータ2の説明",
          default: 10,
        },
      },
      required: ["param1"],
    },
  },
];

/**
 * ツールハンドラ
 * @param args - ツール引数
 * @returns ツール実行結果
 */
export async function handleExampleTool(args: {
  param1: string;
  param2?: number;
}): Promise<{ success: boolean; data: unknown }> {
  const { param1, param2 = 10 } = args;

  // SessionManagerを使用してFileMaker APIを呼び出す
  const sessionManager = getSessionManager();
  const result = await sessionManager.withSession(async (client, token) => {
    // API呼び出しロジック
    return await client.get(`/some/endpoint`, token);
  });

  return {
    success: true,
    data: result,
  };
}
```

### 手順2: tools/index.ts でエクスポート

```typescript
// src/tools/index.ts
export * from "./auth.js";
export * from "./metadata.js";
export * from "./records.js";
export * from "./analysis.js";
export * from "./example.js";  // 追加
```

### 手順3: server.ts に登録

```typescript
// src/server.ts

import {
  AUTH_TOOLS,
  METADATA_TOOLS,
  RECORDS_TOOLS,
  ANALYSIS_TOOLS,
  EXAMPLE_TOOLS,  // 追加
  handleLogin,
  handleLogout,
  // ... 他のハンドラ
  handleExampleTool,  // 追加
} from "./tools/index.js";

// TOOLS配列に追加
const TOOLS: Tool[] = [
  ...AUTH_TOOLS,
  ...METADATA_TOOLS,
  ...RECORDS_TOOLS,
  ...ANALYSIS_TOOLS,
  ...EXAMPLE_TOOLS,  // 追加
];

// tools/call ハンドラに追加
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    // ... 既存のcase

    case "fm_example_tool":
      return formatToolResult(await handleExampleTool(args));

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});
```

### 手順4: テストを作成

```typescript
// tests/unit/tools/example.test.ts
import { describe, it, expect } from "vitest";
import { handleExampleTool } from "../../../src/tools/example.js";

describe("handleExampleTool", () => {
  it("正常系: 期待する結果を返す", async () => {
    // テスト実装
  });
});
```

### 手順5: README.md を更新

`README.md` の「提供ツール」セクションに新しいツールを追加。

---

## 型定義

### `src/types/filemaker.ts` - FileMaker API型

主要な型:

| 型名 | 説明 |
|-----|------|
| `FMRecord` | レコードデータ（fieldData, portalData, recordId, modId） |
| `FMFieldMetaData` | フィールドメタデータ（name, type, result等） |
| `FMLayoutInfo` | レイアウト情報 |
| `FMScriptInfo` | スクリプト情報 |
| `FMDataInfo` | レコード取得時の付加情報（foundCount, totalRecordCount等） |
| `FindQuery` | 検索クエリ |
| `SortOrder` | ソート順指定 |

### Branded Types

型安全性のためのBranded Types:

```typescript
type SessionToken = string & { readonly __brand: "SessionToken" };
type LayoutName = string & { readonly __brand: "LayoutName" };
type RecordId = string & { readonly __brand: "RecordId" };
```

---

## テスト

### テスト実行

```bash
# 全テスト実行
pnpm test

# 特定ファイルのテスト
pnpm test tests/unit/analyzers/relationship-inferrer.test.ts

# カバレッジ付き
pnpm test -- --coverage
```

### テスト構成

```
tests/
└── unit/
    ├── analyzers/           # アナライザのユニットテスト
    │   ├── global-searcher.test.ts
    │   └── relationship-inferrer.test.ts
    ├── api/                 # APIクライアントのテスト
    │   └── error-mapper.test.ts
    ├── security/            # セキュリティテスト
    │   ├── config-security.test.ts
    │   └── filesystem-safety.test.ts
    └── utils/               # ユーティリティのテスト
        └── logger.test.ts
```

---

## 開発コマンド

```bash
# ビルド
pnpm run build

# 型チェック
pnpm run typecheck

# リント
pnpm run lint

# リント自動修正
pnpm run lint:fix

# テスト
pnpm test
```

---

## 設計上の注意点

### 1. Data APIの制約

FileMaker Data APIには以下の制約があります:

- **テーブル一覧の直接取得不可**: レイアウト経由でのみフィールド情報取得可能
- **リレーション定義の取得不可**: ポータル名やフィールド名から推測するしかない
- **スクリプト内容の取得不可**: スクリプト名一覧のみ取得可能

これらの制約により、`fm_infer_relationships` 等の分析ツールは**推測**に基づきます。必ず disclaimer を出力に含めてください。

### 2. セキュリティ

- **パスワードのログ出力禁止**: `formatConfigForLog()` で必ずマスク
- **ファイルシステム書き込み禁止**: MCPサーバーからファイル操作しない
- **読み取り専用**: レコードのCRUD操作のうち、Readのみ実装

### 3. エラーハンドリング

- FileMaker APIエラーは `api/error-mapper.ts` で変換
- ツールハンドラでは例外をキャッチし、`{ success: false, error: ... }` 形式で返却
- `server.ts` の `formatErrorResult()` で最終的なMCPレスポンス形式に変換

### 4. 命名規則

- ツール名: `fm_` プレフィックス + スネークケース（例: `fm_get_records`）
- ハンドラ関数: `handle` プレフィックス + パスカルケース（例: `handleGetRecords`）
- 型名: パスカルケース、FileMaker関連は `FM` プレフィックス（例: `FMRecord`）

---

## 参考資料

- [docs/DESIGN.md](./DESIGN.md) - 詳細設計ドキュメント
- [docs/IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) - 実装計画
- [docs/SECURITY.md](./SECURITY.md) - セキュリティ仕様
- [README.md](../README.md) - 使用方法
- [FileMaker Data API ガイド](https://help.claris.com/ja/data-api-guide/)
