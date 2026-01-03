# セキュリティドキュメント

本ドキュメントは、jaou-ensatsu-kokuryu-filemaker-mcp（邪王炎殺黒龍波 FileMaker MCP）のセキュリティ要件と実装状況を記述します。

## セキュリティ要件一覧

設計書 2.2 セクションに基づくセキュリティ要件の実装状況です。

| 要件ID | 要件名 | 実装状況 | 検証方法 |
|--------|--------|----------|----------|
| SEC-001 | パスワードマスキング | ✅ 実装済み | 単体テスト |
| SEC-002 | ログレベル制御 | ✅ 実装済み | 単体テスト |
| SEC-003 | ファイルシステム安全性 | ✅ 実装済み | 静的解析テスト |
| SEC-004 | 入力検証 | ✅ 実装済み | 単体テスト |
| SEC-005 | HTTPS通信強制 | ✅ 実装済み | 単体テスト |
| SEC-006 | SSL検証警告 | ✅ 実装済み | 単体テスト |

## 各セキュリティ要件の詳細

### SEC-001: パスワードマスキング

**目的**: 認証情報がログ出力に含まれることを防止する。

**実装箇所**:
- `src/utils/logger.ts`: `maskSensitiveData()` 関数
- `src/config.ts`: `formatConfigForLog()` 関数

**検証**:
- `tests/unit/utils/logger.test.ts`: マスキング機能のテスト
- `tests/unit/security/config-security.test.ts`: 設定出力のマスキングテスト

**マスキング対象キー**:
- `password`, `pass`, `pwd`
- `token`, `accessToken`, `refreshToken`
- `secret`, `apiKey`, `apiSecret`
- `auth`, `authorization`
- `credential`, `credentials`

### SEC-002: ログレベル制御

**目的**: 環境に応じた適切なログ出力レベルを設定可能にする。

**実装箇所**:
- `src/utils/logger.ts`: `LogLevel` enum、`shouldLog()` 関数

**環境変数**:
- `LOG_LEVEL`: ログレベル設定（debug, info, warn, error）

**検証**:
- `tests/unit/utils/logger.test.ts`: ログレベル制御のテスト

### SEC-003: ファイルシステム安全性

**目的**: MCPサーバーがローカルファイルシステムへの書き込みを行わないことを保証する。

**実装方針**:
- `fs.writeFile`, `fs.appendFile`, `fs.unlink` 等の書き込み操作を使用しない
- `fs` モジュール自体をソースコードにインポートしない
- `console.log` ではなく専用ロガーを使用する

**検証**:
- `tests/unit/security/filesystem-safety.test.ts`: 静的コード解析テスト
  - 危険なファイルシステム操作パターンの検出
  - `fs` モジュールのインポート検出
  - `console.log` の残存検出
  - `eval()` の使用検出

### SEC-004: 入力検証

**目的**: ユーザー入力の検証を行い、不正なデータを拒否する。

**実装箇所**:
- `src/config.ts`: `validateConfig()` 関数
- 各ツールのパラメータ検証

**検証**:
- `tests/unit/security/config-security.test.ts`: 設定検証テスト

### SEC-005: HTTPS通信強制

**目的**: FileMaker Server との通信を常にHTTPSで行うことを強制する。

**実装箇所**:
- `src/config.ts`: `validateConfig()` 関数（179-182行）

**動作**:
- `http://` で始まるサーバーURLはエラーとして拒否される
- プロトコルなしのURLには自動的に `https://` が付与される

**検証**:
- `tests/unit/security/config-security.test.ts`: HTTPS強制テスト

**エラーメッセージ**:
```
FM_SERVER must use HTTPS (SEC-005)
```

### SEC-006: SSL証明書検証警告

**目的**: SSL証明書検証が無効化されている場合に警告を出力する。

**実装箇所**:
- `src/config.ts`: `validateConfig()` 関数（199-204行）

**動作**:
- `FM_SSL_VERIFY=false` の場合、警告メッセージが出力される
- 設定自体は有効として処理されるが、開発環境のみでの使用を推奨

**警告メッセージ**:
```
SEC-006: SSL certificate verification is disabled. This is insecure and should only be used in development.
```

**検証**:
- `tests/unit/security/config-security.test.ts`: SSL検証警告テスト

## セキュリティテストの実行

セキュリティ関連のテストを実行するには:

```bash
# セキュリティテストのみ実行
pnpm test -- tests/unit/security/

# 全テスト実行（セキュリティテスト含む）
pnpm test
```

## 環境変数のセキュリティ

### 推奨設定（本番環境）

```bash
# 必須
FM_SERVER=https://your-filemaker-server.com
FM_DATABASE=YourDatabase
FM_USERNAME=api_user
FM_PASSWORD=<secure-password>

# セキュリティ設定（デフォルト推奨）
FM_SSL_VERIFY=true    # SSL証明書検証を有効化
LOG_LEVEL=warn        # 本番環境では warn 以上を推奨
```

### 開発環境設定

```bash
# 開発時のみ許可される設定
FM_SSL_VERIFY=false   # 自己署名証明書使用時のみ
LOG_LEVEL=debug       # デバッグ情報を出力
```

## セキュリティに関する報告

セキュリティ上の問題を発見した場合は、以下の手順で報告してください:

1. 公開リポジトリのIssueには**投稿しないでください**
2. 詳細な再現手順と影響範囲を記載してください
3. 可能であれば、修正案も併せて提案してください

## 変更履歴

| 日付 | バージョン | 変更内容 |
|------|------------|----------|
| 2026-01-03 | 1.0.0 | 初版作成（P5-2 セキュリティ検証完了） |
