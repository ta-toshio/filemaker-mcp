# Jaou Ensatsu Kokuryu FileMaker MCP

FileMaker Data API を通じてデータベース分析・メタデータ抽出を行う MCP サーバーです。

## 特徴

- **読み取り専用**: データの安全性を確保（作成・更新・削除は非対応）
- **メタデータ集約**: レイアウト、フィールド、スクリプト情報を一括取得
- **リレーション推測**: フィールド名パターンから関係性を推測（disclaimer付き）
- **グローバル検索**: 複数レイアウトを横断したデータ検索
- **セキュリティ重視**: パスワードのログ出力禁止、/tmp 書き込み禁止

## 提供ツール（16ツール）

### 認証系
- `fm_login` - FileMaker サーバーへのログイン
- `fm_logout` - セッション終了
- `fm_validate_session` - セッション有効性確認

### メタデータ取得系
- `fm_get_layouts` - レイアウト一覧取得
- `fm_get_layout_metadata` - フィールド定義取得
- `fm_get_scripts` - スクリプト一覧取得
- `fm_list_value_lists` - 値一覧取得

### レコード操作系（読み取りのみ）
- `fm_get_records` - レコード取得（ページング対応）
- `fm_get_record_by_id` - ID指定でレコード取得
- `fm_find_records` - 検索クエリでレコード取得
- `fm_get_record_count` - レコード件数取得

### 分析系
- `fm_export_database_metadata` - メタデータ一括エクスポート
- `fm_infer_relationships` - リレーション推測
- `fm_analyze_portal_data` - ポータル構造分析
- `fm_global_search_data` - 複数レイアウト横断検索
- `fm_global_search_fields` - フィールド名検索

## インストール

```bash
npm install
npm run build
```

## 設定

### 環境変数

```bash
cp .env.example .env
# .env を編集して接続情報を設定
```

| 変数名 | 必須 | デフォルト | 説明 |
|--------|------|-----------|------|
| `FM_SERVER` | Yes | - | FileMaker サーバー URL（HTTPS） |
| `FM_DATABASE` | Yes | - | データベース名 |
| `FM_USERNAME` | Yes | - | ユーザー名 |
| `FM_PASSWORD` | Yes | - | パスワード |
| `FM_API_VERSION` | No | `vLatest` | Data API バージョン |
| `FM_SSL_VERIFY` | No | `true` | SSL 証明書検証 |
| `FM_SESSION_TIMEOUT` | No | `840` | セッションタイムアウト（秒） |
| `LOG_LEVEL` | No | `WARN` | ログレベル |

### MCP 設定（Claude Desktop）

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

## 開発

```bash
# 開発モード
npm run dev

# テスト
npm test

# ビルド
npm run build
```

## 制限事項

- FileMaker Data API の制約により、テーブル一覧やリレーション定義の直接取得は不可
- レイアウトに配置されたフィールドのみ操作可能
- `fm_infer_relationships` の結果は推測であり、実際のリレーション定義と異なる場合あり

## ライセンス

MIT
