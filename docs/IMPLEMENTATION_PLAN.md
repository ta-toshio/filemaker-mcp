# 邪王炎殺黒龍 FileMaker MCP 実装計画書

**プロジェクト名**: Jaou Ensatsu Kokuryu FileMaker MCP
**設計書**: [JAOU_ENSATSU_KOKURYU_DESIGN.md](./JAOU_ENSATSU_KOKURYU_DESIGN.md)
**作成日**: 2026年1月2日
**ステータス**: Phase 5 完了（全実装完了、195テストケース全て成功）

---

## 実装フェーズ概要

| Phase | 内容 | タスク数 | 依存関係 |
|-------|------|---------|---------|
| **Phase 0** | プロジェクト初期化 | 5 | なし |
| **Phase 1** | コア基盤 | 8 | Phase 0 |
| **Phase 2** | 基本ツール（9ツール） | 9 | Phase 1 |
| **Phase 3** | 分析ツール（4ツール） | 4 | Phase 2 |
| **Phase 4** | 補助ツール（3ツール） | 3 | Phase 2 |
| **Phase 5** | テスト・仕上げ | 3 | Phase 3, 4 |

---

## Phase 0: プロジェクト初期化

### タスク一覧

| ID | タスク | 成果物 | 完了条件 |
|----|--------|--------|---------|
| P0-1 | プロジェクトディレクトリ作成 | `jaou-ensatsu-kokuryu-filemaker-mcp/` | ディレクトリ構成完了 |
| P0-2 | package.json 作成 | `package.json` | 依存関係定義完了 |
| P0-3 | tsconfig.json 作成 | `tsconfig.json` | TypeScript設定完了 |
| P0-4 | .env.example 作成 | `.env.example` | 環境変数テンプレート完了 |
| P0-5 | README.md 作成 | `README.md` | 基本説明完了 |

### P0-2 詳細: package.json

```json
{
  "name": "jaou-ensatsu-kokuryu-filemaker-mcp",
  "version": "1.0.0",
  "description": "FileMaker MCP Server - Database analysis and metadata extraction tools for Claude",
  "type": "module",
  "main": "dist/index.js",
  "bin": {
    "jaou-ensatsu-kokuryu-filemaker-mcp": "dist/index.js"
  },
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsx src/index.ts",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "lint": "biome check src/",
    "lint:fix": "biome check --write src/",
    "format": "biome format --write src/",
    "typecheck": "tsc --noEmit",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0"
  },
  "devDependencies": {
    "@biomejs/biome": "^1.9.0",
    "@types/node": "^22.0.0",
    "@types/jest": "^29.0.0",
    "jest": "^29.0.0",
    "ts-jest": "^29.0.0",
    "tsx": "^4.0.0",
    "typescript": "^5.5.0"
  },
  "engines": {
    "node": ">=24.0.0"
  },
  "keywords": ["mcp", "filemaker", "claude", "database", "api"],
  "license": "MIT"
}
```

---

## Phase 1: コア基盤

### タスク一覧

| ID | タスク | 成果物 | 依存 | 完了条件 |
|----|--------|--------|------|---------|
| P1-1 | 型定義作成 | `src/types/filemaker.ts` | P0 | FM API型定義完了 |
| P1-2 | ツール型定義作成 | `src/types/tools.ts` | P0 | 入出力型定義完了 |
| P1-3 | エラーマッピング実装 | `src/api/error-mapper.ts` | P1-1 | エラーコード変換動作 |
| P1-4 | セキュアロガー実装 | `src/utils/logger.ts` | P0 | パスワード非出力確認 |
| P1-5 | 設定管理実装 | `src/config.ts` | P0 | 環境変数読み込み動作 |
| P1-6 | HTTPクライアント実装 | `src/api/client.ts` | P1-3,4,5 | リクエスト送信動作 |
| P1-7 | セッション管理実装 | `src/api/session.ts` | P1-6 | セッション保持動作 |
| P1-8 | MCPサーバー基盤 | `src/server.ts` | P1-7 | サーバー起動確認 |

### P1-3 詳細: error-mapper.ts

**実装内容** (設計書 5.2 参照):
- `HTTP_ERROR_MAP`: HTTPステータス → 内部エラー
- `FM_ERROR_MAP`: FileMakerエラー → 内部エラー
- `resolveError()`: エラー解決（FM優先）
- `createError()`: ErrorResponse生成

**テスト観点**:
- [ ] HTTP 401 → code: 2001 (Session expired)
- [ ] FM 401 → code: 3002 (No records match)
- [ ] 不明エラー → code: 5001

---

## Phase 2: 基本ツール（9ツール）

### タスク一覧

| ID | ツール | 成果物 | 依存 | 完了条件 |
|----|--------|--------|------|---------|
| P2-1 | fm_login | `src/tools/auth.ts` | P1-7 | ログイン成功・失敗確認 |
| P2-2 | fm_logout | `src/tools/auth.ts` | P2-1 | セッション終了確認 |
| P2-3 | fm_validate_session | `src/tools/auth.ts` | P2-1 | 有効/無効判定確認 |
| P2-4 | fm_get_layouts | `src/tools/metadata.ts` | P2-1 | レイアウト一覧取得 |
| P2-5 | fm_get_layout_metadata | `src/tools/metadata.ts` | P2-4 | フィールド定義取得 |
| P2-6 | fm_get_scripts | `src/tools/metadata.ts` | P2-1 | スクリプト一覧取得 |
| P2-7 | fm_get_records | `src/tools/records.ts` | P2-4 | ページング動作確認 |
| P2-8 | fm_get_record_by_id | `src/tools/records.ts` | P2-7 | 単一レコード取得 |
| P2-9 | fm_find_records | `src/tools/records.ts` | P2-7 | 検索・ソート動作確認 |

### P2-1 詳細: fm_login

**実装内容** (設計書 3.2.1 参照):
- 環境変数 or 引数から認証情報取得
- POST `/sessions` でトークン取得
- トークンは内部保持、外部非公開
- セキュリティ: パスワードをログ出力しない

**API呼び出し**:
```
POST /fmi/data/{version}/databases/{db}/sessions
Headers: Authorization: Basic {base64(username:password)}
Body: {} または { "fmDataSource": [...] }（外部DB接続時のみ）
```

**テスト観点**:
- [ ] 正常ログイン → success: true
- [ ] 不正パスワード → エラー（パスワード非表示）
- [ ] サーバー接続不可 → code: 1002

---

## Phase 3: 分析ツール（4ツール）

### タスク一覧

| ID | ツール | 成果物 | 依存 | 完了条件 |
|----|--------|--------|------|---------|
| P3-1 | fm_export_database_metadata | `src/analyzers/metadata-aggregator.ts` | P2-4,5,6 | JSON/XML出力確認 |
| P3-2 | fm_infer_relationships | `src/analyzers/relationship-inferrer.ts` | P2-5 | 推測結果+disclaimer |
| P3-3 | fm_analyze_portal_data | `src/analyzers/portal-analyzer.ts` | P2-5 | ポータル構造取得 |
| P3-4 | fm_global_search_data | `src/analyzers/global-searcher.ts` | P2-9 | 横断検索動作確認 |

### P3-1 詳細: fm_export_database_metadata

**実装内容** (設計書 3.2.3 参照):
- 全レイアウトのメタデータ集約
- スクリプト名一覧
- ポータル情報
- `limitations[]` で制限事項を明示

**出力フォーマット**: JSON / XML / HTML

**テスト観点**:
- [ ] JSON出力が有効なJSON
- [ ] limitations に「真のDDRとは異なる」含む
- [ ] 大量レイアウト時のタイムアウト処理

### P3-4 詳細: fm_global_search_data

**実装内容** (設計書 3.2.6 参照):
- 複数レイアウトに対するOR検索
- フィールド自動選定（text/number/date/time/timestamp）
- global除外、calculation/summaryはオプション
- テキスト型のみワイルドカード適用

**スロットリング設定**:
```typescript
maxConcurrentLayouts: 3
delayBetweenRequestsMs: 100
timeoutPerLayoutMs: 10000
totalTimeoutMs: 60000
```

**テスト観点**:
- [ ] 複数レイアウト検索動作
- [ ] skippedLayouts に検索不可レイアウト含む
- [ ] disclaimer 含む

---

## Phase 4: 補助ツール（3ツール）

### タスク一覧

| ID | ツール | 成果物 | 依存 | 完了条件 |
|----|--------|--------|------|---------|
| P4-1 | fm_global_search_fields | `src/tools/analysis.ts` | P2-5 | フィールド横断検索 |
| P4-2 | fm_get_record_count | `src/tools/records.ts` | P2-7 | 件数取得確認 |
| P4-3 | fm_list_value_lists | `src/tools/metadata.ts` | P2-5 | 値一覧取得確認 |

### P4-2 詳細: fm_get_record_count

**実装内容** (設計書 3.2.8 参照):
- `GET /records?_limit=1` で dataInfo.totalRecordCount 取得
- `_find` は使用しない（クエリ必須のため）

**テスト観点**:
- [ ] 正常取得 → totalRecordCount が数値
- [ ] 空レイアウト → totalRecordCount: 0

---

## Phase 5: テスト・仕上げ

### タスク一覧

| ID | タスク | 成果物 | 依存 | 完了条件 |
|----|--------|--------|------|---------|
| P5-1 | 単体テスト作成 | `tests/unit/` | P3,4 | カバレッジ80%以上 |
| P5-2 | セキュリティ検証 | - | P5-1 | パスワード非露出確認 |
| P5-3 | ドキュメント整備 | `README.md` 更新 | P5-2 | 使用方法記載完了 |

### P5-1 詳細: 単体テスト

**重点テスト対象**:
- `error-mapper.ts`: エラーコードマッピング
- `logger.ts`: パスワードマスキング
- `relationship-inferrer.ts`: 推測ロジック
- `global-searcher.ts`: フィールド選定ロジック

---

## 進捗トラッキング

### チェックリスト形式

```markdown
## Phase 0: プロジェクト初期化 ✅
- [x] P0-1: プロジェクトディレクトリ作成
- [x] P0-2: package.json 作成
- [x] P0-3: tsconfig.json 作成
- [x] P0-4: .env.example 作成
- [x] P0-5: README.md 作成

## Phase 1: コア基盤 ✅
- [x] P1-1: 型定義作成 (`src/types/filemaker.ts`)
- [x] P1-2: ツール型定義作成 (`src/types/tools.ts`)
- [x] P1-3: エラーマッピング実装 (`src/api/error-mapper.ts`)
- [x] P1-4: セキュアロガー実装 (`src/utils/logger.ts`)
- [x] P1-5: 設定管理実装 (`src/config.ts`)
- [x] P1-6: HTTPクライアント実装 (`src/api/client.ts`)
- [x] P1-7: セッション管理実装 (`src/api/session.ts`)
- [x] P1-8: MCPサーバー基盤 (`src/server.ts`, `src/index.ts`)

## Phase 2: 基本ツール（9ツール） ✅
- [x] P2-1: fm_login (`src/tools/auth.ts`)
- [x] P2-2: fm_logout (`src/tools/auth.ts`)
- [x] P2-3: fm_validate_session (`src/tools/auth.ts`)
- [x] P2-4: fm_get_layouts (`src/tools/metadata.ts`)
- [x] P2-5: fm_get_layout_metadata (`src/tools/metadata.ts`)
- [x] P2-6: fm_get_scripts (`src/tools/metadata.ts`)
- [x] P2-7: fm_get_records (`src/tools/records.ts`)
- [x] P2-8: fm_get_record_by_id (`src/tools/records.ts`)
- [x] P2-9: fm_find_records (`src/tools/records.ts`)
- [x] モジュール分割完了（`src/tools/index.ts` でエクスポート集約）

## Phase 3: 分析ツール ✅
- [x] P3-1: fm_export_database_metadata (`src/analyzers/metadata-aggregator.ts`)
- [x] P3-2: fm_infer_relationships (`src/analyzers/relationship-inferrer.ts`)
- [x] P3-3: fm_analyze_portal_data (`src/analyzers/portal-analyzer.ts`)
- [x] P3-4: fm_global_search_data (`src/analyzers/global-searcher.ts`)
- [x] 設計書3.2.3-3.2.6との整合性検証完了（global-searcher.tsのフィールド型別検索ロジック修正含む）

## Phase 4: 補助ツール
- [x] P4-1: fm_global_search_fields (`src/tools/analysis.ts`)
- [x] P4-2: fm_get_record_count (`src/tools/records.ts`)
- [x] P4-3: fm_list_value_lists (`src/tools/metadata.ts`)
- [x] 設計書3.2.7-3.2.9との整合性検証完了（デフォルト上限値を実装に合わせて更新済み）

## Phase 5: テスト・仕上げ
- [x] P5-1: 単体テスト作成
  - [x] error-mapper.ts テスト（160テストケース）
  - [x] logger.ts テスト（パスワードマスキング、ログレベル制御）
  - [x] relationship-inferrer.ts テスト（外部キー推測、ポータル名解析）
  - [x] global-searcher.ts テスト（検索可能フィールド判定、検索値生成）
- [x] P5-2: セキュリティ検証
  - [x] 静的コード解析（危険パターン検出）
  - [x] SEC-003 テスト（ファイルシステム安全性: tests/unit/security/filesystem-safety.test.ts）
  - [x] SEC-005 テスト（HTTPS強制: tests/unit/security/config-security.test.ts）
  - [x] SEC-006 テスト（SSL検証警告: tests/unit/security/config-security.test.ts）
  - [x] SECURITY.md 作成（docs/SECURITY.md）
- [x] P5-3: ドキュメント整備
  - [x] README.md 更新（pnpm統一、MCP使用方法追加、主要ツール使用例）
  - [x] セキュリティドキュメントへのリンク追加
```

---

## 依存関係図

```
Phase 0 ─────────────────────────────────────────────────────────┐
   │                                                             │
   ▼                                                             │
Phase 1: コア基盤                                                │
   │  P1-1 型定義 ──┐                                            │
   │  P1-2 ツール型 ─┤                                           │
   │  P1-3 エラーマップ ─┬─→ P1-6 HTTPクライアント               │
   │  P1-4 ロガー ───────┤        │                              │
   │  P1-5 設定 ─────────┘        ▼                              │
   │                         P1-7 セッション管理                 │
   │                              │                              │
   │                              ▼                              │
   │                         P1-8 MCPサーバー基盤                │
   │                              │                              │
   ▼──────────────────────────────┴──────────────────────────────┘
Phase 2: 基本ツール
   │  P2-1 login ──────┬─→ P2-2 logout
   │        │          └─→ P2-3 validate_session
   │        │
   │        ├─→ P2-4 get_layouts ──→ P2-5 get_layout_metadata
   │        │                              │
   │        ├─→ P2-6 get_scripts           │
   │        │                              │
   │        └─→ P2-7 get_records ──────────┤
   │                 │                     │
   │                 ├─→ P2-8 get_record_by_id
   │                 └─→ P2-9 find_records │
   │                              │        │
   ▼──────────────────────────────┴────────┴─────────────────────
Phase 3: 分析ツール          Phase 4: 補助ツール
   │  P3-1 export_metadata      P4-1 global_search_fields
   │  P3-2 infer_relationships  P4-2 get_record_count
   │  P3-3 analyze_portal       P4-3 list_value_lists
   │  P3-4 global_search_data
   │                              │
   ▼──────────────────────────────┴──────────────────────────────
Phase 5: テスト・仕上げ
   P5-1 単体テスト → P5-2 セキュリティ → P5-3 ドキュメント
```

---

## 参照ドキュメント

- [設計書](./JAOU_ENSATSU_KOKURYU_DESIGN.md)
- [FileMaker MCPサーバー比較](./FILEMAKER_MCP_COMPARISON.md)
- [FileMaker Data API ガイド](https://help.claris.com/en/data-api-guide/)

---

## 更新履歴

| 日付 | 内容 |
|------|------|
| 2026-01-02 | 初版作成 |
| 2026-01-02 | Phase 0/1 完了、ステータス更新、package.json サンプルを実装に合わせて更新 |
| 2026-01-02 | Phase 2 完了：9ツールを `src/tools/` へモジュール分割（auth.ts, metadata.ts, records.ts, index.ts） |
| 2026-01-03 | Phase 3 完了：4分析ツールを `src/analyzers/` に実装、設計書3.2.3-3.2.6との整合性検証（global-searcher.tsのフィールド型別検索ロジック修正） |
| 2026-01-03 | Phase 4 完了：3補助ツール実装（fm_global_search_fields, fm_get_record_count, fm_list_value_lists）、設計書デフォルト上限値を実装に合わせて更新（3.2.5: 50/100、3.2.9: 50/500） |
| 2026-01-03 | Phase 5 簡素化：モック統合テスト（P5-2）を削除、タスク数 4→3、ID再採番（P5-2: セキュリティ検証、P5-3: ドキュメント整備） |
| 2026-01-03 | P5-1 完了：4モジュールの単体テスト160ケース実装（error-mapper, logger, relationship-inferrer, global-searcher） |
| 2026-01-03 | P5-2 完了：セキュリティ検証（静的コード解析、SEC-003/005/006テスト35ケース追加、SECURITY.md作成）、全195テスト成功 |
| 2026-01-03 | P5-3 完了：README.md整備（pnpm統一、MCP使用方法・主要ツール使用例追加、セキュリティリンク）。**Phase 5 全完了** |
