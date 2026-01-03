# Jaou Ensatsu Kokuryu FileMaker MCP

FileMaker Data API を通じてデータベース分析・メタデータ抽出を行う MCP（Model Context Protocol）サーバーです。

## 特徴

- **読み取り専用**: データの安全性を確保（作成・更新・削除は非対応）
- **メタデータ集約**: レイアウト、フィールド、スクリプト情報を一括取得
- **リレーション推測**: フィールド名パターンから関係性を推測（disclaimer付き）
- **グローバル検索**: 複数レイアウトを横断したデータ検索
- **セキュリティ重視**: パスワードのログ出力禁止、ファイルシステム書き込み禁止

## クイックスタート

### 1. インストール

```bash
pnpm install
pnpm run build
```

### 2. 環境変数の設定

```bash
cp .env.example .env
# .env を編集して接続情報を設定
```

### 3. Claude Desktop での MCP 設定

`claude_desktop_config.json` に以下を追加:

```json
{
  "mcpServers": {
    "filemaker": {
      "command": "node",
      "args": ["/path/to/jaou-ensatsu-kokuryu-filemaker-mcp/dist/index.js"],
      "env": {
        "FM_SERVER": "https://your-server.com",
        "FM_DATABASE": "your-database",
        "FM_USERNAME": "your-username",
        "FM_PASSWORD": "your-password"
      }
    }
  }
}
```

### 4. Claude での使用

Claude Desktop を起動すると、FileMaker MCP ツールが利用可能になります。

```
# 使用例（Claude への指示）
「FileMaker にログインして、顧客レイアウトのフィールド一覧を取得してください」
「売上データベースのメタデータをエクスポートしてください」
「注文テーブルで"東京"を含むレコードを検索してください」
```

---

## 提供ツール（16ツール）

### 認証系

| ツール | 説明 |
|--------|------|
| `fm_login` | FileMaker サーバーへのログイン |
| `fm_logout` | セッション終了 |
| `fm_validate_session` | セッション有効性確認 |

### メタデータ取得系

| ツール | 説明 |
|--------|------|
| `fm_get_layouts` | レイアウト一覧取得 |
| `fm_get_layout_metadata` | フィールド定義取得 |
| `fm_get_scripts` | スクリプト一覧取得 |
| `fm_list_value_lists` | 値一覧取得 |

### レコード操作系（読み取りのみ）

| ツール | 説明 |
|--------|------|
| `fm_get_records` | レコード取得（ページング対応） |
| `fm_get_record_by_id` | ID指定でレコード取得 |
| `fm_find_records` | 検索クエリでレコード取得 |
| `fm_get_record_count` | レコード件数取得 |

### 分析系

| ツール | 説明 |
|--------|------|
| `fm_export_database_metadata` | メタデータ一括エクスポート |
| `fm_infer_relationships` | リレーション推測 |
| `fm_analyze_portal_data` | ポータル構造分析 |
| `fm_global_search_data` | 複数レイアウト横断検索 |
| `fm_global_search_fields` | フィールド名検索 |

---

## 主要ツールの使用例

### fm_login - ログイン

環境変数が設定されている場合、引数なしでログイン可能:

```json
// 入力（環境変数使用）
{}

// 入力（引数指定）
{
  "server": "https://your-server.com",
  "database": "YourDB",
  "username": "admin",
  "password": "password123"
}

// 出力
{
  "success": true,
  "message": "Login successful"
}
```

### fm_get_layout_metadata - レイアウトメタデータ取得

```json
// 入力
{
  "layout": "顧客マスタ"
}

// 出力
{
  "success": true,
  "layout": "顧客マスタ",
  "fields": [
    {
      "name": "顧客ID",
      "type": "normal",
      "result": "number",
      "autoEnter": true
    },
    {
      "name": "顧客名",
      "type": "normal",
      "result": "text"
    }
  ],
  "portalNames": ["注文履歴", "連絡先"]
}
```

### fm_find_records - レコード検索

```json
// 入力
{
  "layout": "注文",
  "query": [
    { "顧客名": "田中*" },
    { "都道府県": "東京都" }
  ],
  "sort": [
    { "fieldName": "注文日", "sortOrder": "descend" }
  ],
  "limit": 50
}

// 出力
{
  "success": true,
  "records": [...],
  "dataInfo": {
    "foundCount": 25,
    "returnedCount": 25,
    "totalRecordCount": 1500
  }
}
```

### fm_export_database_metadata - メタデータエクスポート

```json
// 入力
{
  "includeFields": true,
  "includeScripts": true
}

// 出力
{
  "success": true,
  "database": "SalesDB",
  "exportedAt": "2026-01-03T12:00:00Z",
  "layouts": [...],
  "scripts": [...]
}
```

---

## 環境変数

| 変数名 | 必須 | デフォルト | 説明 |
|--------|------|-----------|------|
| `FM_SERVER` | Yes | - | FileMaker サーバー URL（HTTPS必須） |
| `FM_DATABASE` | Yes | - | データベース名 |
| `FM_USERNAME` | Yes | - | ユーザー名 |
| `FM_PASSWORD` | Yes | - | パスワード |
| `FM_API_VERSION` | No | `vLatest` | Data API バージョン |
| `FM_SSL_VERIFY` | No | `true` | SSL 証明書検証（開発環境でのみ`false`可） |
| `FM_SESSION_TIMEOUT` | No | `840` | セッションタイムアウト（秒） |
| `LOG_LEVEL` | No | `warn` | ログレベル（debug, info, warn, error） |

---

## 開発

```bash
# 依存関係インストール
pnpm install

# 開発モード
pnpm run dev

# ビルド
pnpm run build

# テスト実行
pnpm test

# 型チェック
pnpm run typecheck

# リント
pnpm run lint
pnpm run lint:fix
```

---

## セキュリティ

本プロジェクトは以下のセキュリティ要件を実装しています:

- **SEC-001**: パスワードのログ出力マスキング
- **SEC-002**: 環境変数によるログレベル制御
- **SEC-003**: ファイルシステムへの書き込み禁止
- **SEC-005**: HTTPS通信の強制
- **SEC-006**: SSL検証無効化時の警告

詳細は [docs/SECURITY.md](docs/SECURITY.md) を参照してください。

---

## 制限事項

- FileMaker Data API の制約により、テーブル一覧やリレーション定義の直接取得は不可
- レイアウトに配置されたフィールドのみ操作可能
- `fm_infer_relationships` の結果は推測であり、実際のリレーション定義と異なる場合あり
- 読み取り専用（レコードの作成・更新・削除は非対応）

---

## 関連ドキュメント

- [設計書](../docs/JAOU_ENSATSU_KOKURYU_DESIGN.md)
- [実装計画](../docs/IMPLEMENTATION_PLAN.md)
- [セキュリティ](docs/SECURITY.md)

---

## ライセンス

MIT
