/**
 * 設定管理
 *
 * 環境変数からFileMaker接続設定を読み込み
 * 設計書 8.2 セクション準拠
 */

import { loggers } from './utils/logger.js';

const logger = loggers.config;

// ============================================================================
// 型定義
// ============================================================================

/**
 * FileMaker接続設定
 */
export interface FileMakerConfig {
  /** FileMakerサーバーURL（https://必須） */
  server: string;
  /** データベース名 */
  database: string;
  /** ユーザー名 */
  username: string;
  /** パスワード */
  password: string;
  /** Data APIバージョン（デフォルト: vLatest） */
  apiVersion: string;
  /** SSL証明書検証（デフォルト: true） */
  sslVerify: boolean;
  /** セッションタイムアウト秒数（デフォルト: 840秒 = 14分） */
  sessionTimeout: number;
}

/**
 * 設定検証結果
 */
export interface ConfigValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ============================================================================
// 定数
// ============================================================================

/**
 * デフォルト設定値
 */
export const CONFIG_DEFAULTS = {
  apiVersion: 'vLatest',
  sslVerify: true,
  sessionTimeout: 840, // 14分（FileMakerデフォルトの15分より短く設定）
} as const;

/**
 * 環境変数名
 */
export const ENV_VARS = {
  server: 'FM_SERVER',
  database: 'FM_DATABASE',
  username: 'FM_USERNAME',
  password: 'FM_PASSWORD',
  apiVersion: 'FM_API_VERSION',
  sslVerify: 'FM_SSL_VERIFY',
  sessionTimeout: 'FM_SESSION_TIMEOUT',
} as const;

// ============================================================================
// 設定読み込み関数
// ============================================================================

/**
 * 環境変数からブール値を読み込み
 */
function parseBooleanEnv(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value === '') {
    return defaultValue;
  }

  const normalized = value.toLowerCase().trim();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
}

/**
 * 環境変数から数値を読み込み
 */
function parseIntEnv(value: string | undefined, defaultValue: number): number {
  if (value === undefined || value === '') {
    return defaultValue;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

/**
 * サーバーURLを正規化
 *
 * - プロトコルなしの場合はhttps://を追加
 * - 末尾スラッシュを除去
 */
function normalizeServerUrl(url: string | undefined): string | undefined {
  if (!url) {
    return undefined;
  }

  let normalized = url.trim();

  // プロトコルなしの場合はhttpsを追加
  if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
    normalized = `https://${normalized}`;
  }

  // 末尾スラッシュを除去
  while (normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }

  return normalized;
}

/**
 * 環境変数から設定を読み込み
 *
 * @returns FileMaker設定（部分的な場合あり）
 */
export function loadConfigFromEnv(): Partial<FileMakerConfig> {
  const config: Partial<FileMakerConfig> = {};

  // 必須設定
  const server = normalizeServerUrl(process.env[ENV_VARS.server]);
  if (server) {
    config.server = server;
  }

  const database = process.env[ENV_VARS.database];
  if (database) {
    config.database = database;
  }

  const username = process.env[ENV_VARS.username];
  if (username) {
    config.username = username;
  }

  const password = process.env[ENV_VARS.password];
  if (password) {
    config.password = password;
  }

  // オプション設定
  config.apiVersion = process.env[ENV_VARS.apiVersion] || CONFIG_DEFAULTS.apiVersion;
  config.sslVerify = parseBooleanEnv(process.env[ENV_VARS.sslVerify], CONFIG_DEFAULTS.sslVerify);
  config.sessionTimeout = parseIntEnv(
    process.env[ENV_VARS.sessionTimeout],
    CONFIG_DEFAULTS.sessionTimeout
  );

  return config;
}

/**
 * 設定を検証
 *
 * @param config - 検証する設定
 * @returns 検証結果
 */
export function validateConfig(config: Partial<FileMakerConfig>): ConfigValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 必須項目チェック
  if (!config.server) {
    errors.push(`${ENV_VARS.server} is required`);
  } else {
    // SEC-005: HTTPS必須
    if (config.server.startsWith('http://')) {
      errors.push(`${ENV_VARS.server} must use HTTPS (SEC-005)`);
    }
  }

  if (!config.database) {
    errors.push(`${ENV_VARS.database} is required`);
  }

  if (!config.username) {
    errors.push(`${ENV_VARS.username} is required`);
  }

  if (!config.password) {
    errors.push(`${ENV_VARS.password} is required`);
  }

  // 警告チェック
  // SEC-006: SSL検証無効化時の警告
  if (config.sslVerify === false) {
    warnings.push(
      'SEC-006: SSL certificate verification is disabled. ' +
        'This is insecure and should only be used in development.'
    );
  }

  // セッションタイムアウトの検証
  if (config.sessionTimeout !== undefined) {
    if (config.sessionTimeout < 60) {
      warnings.push(
        `${ENV_VARS.sessionTimeout} is very short (${config.sessionTimeout}s). Consider using at least 60 seconds.`
      );
    }
    if (config.sessionTimeout > 900) {
      warnings.push(
        `${ENV_VARS.sessionTimeout} (${config.sessionTimeout}s) exceeds FileMaker's default timeout (900s). Session may expire unexpectedly.`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * 完全な設定を読み込み（検証済み）
 *
 * 環境変数から設定を読み込み、オプション引数でオーバーライド可能
 *
 * @param overrides - 設定のオーバーライド（fm_login引数など）
 * @returns 完全な設定またはエラー
 */
export function getConfig(
  overrides?: Partial<FileMakerConfig>
): FileMakerConfig | ConfigValidationResult {
  // 環境変数から読み込み
  const envConfig = loadConfigFromEnv();

  // オーバーライドから undefined の値を除去してマージ
  // これにより、args.server が undefined の場合に envConfig.server を上書きしない
  const cleanedOverrides: Partial<FileMakerConfig> = {};
  if (overrides) {
    for (const [key, value] of Object.entries(overrides)) {
      if (value !== undefined) {
        cleanedOverrides[key as keyof FileMakerConfig] = value as never;
      }
    }
  }

  // オーバーライドをマージ
  const merged: Partial<FileMakerConfig> = {
    ...envConfig,
    ...cleanedOverrides,
  };

  // サーバーURLの再正規化（オーバーライドされた場合）
  if (overrides?.server) {
    merged.server = normalizeServerUrl(overrides.server);
  }

  // 検証
  const validation = validateConfig(merged);

  // 警告をログ出力
  for (const warning of validation.warnings) {
    logger.warn(warning);
  }

  if (!validation.valid) {
    // エラーをログ出力
    for (const error of validation.errors) {
      logger.error(`Configuration error: ${error}`);
    }
    return validation;
  }

  // 検証済み設定を返却
  return merged as FileMakerConfig;
}

/**
 * 設定が有効かどうかを判定（型ガード）
 */
export function isValidConfig(
  result: FileMakerConfig | ConfigValidationResult
): result is FileMakerConfig {
  return !('valid' in result);
}

// ============================================================================
// 設定表示（デバッグ用）
// ============================================================================

/**
 * 設定を安全に表示（パスワードはマスク）
 */
export function formatConfigForLog(config: Partial<FileMakerConfig>): Record<string, unknown> {
  return {
    server: config.server,
    database: config.database,
    username: config.username,
    password: config.password ? '***MASKED***' : undefined,
    apiVersion: config.apiVersion,
    sslVerify: config.sslVerify,
    sessionTimeout: config.sessionTimeout,
  };
}
