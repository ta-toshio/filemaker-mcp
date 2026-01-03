/**
 * セキュアロガー
 *
 * 設計書 6.1, 6.2 セクション準拠
 * - SEC-001: パスワードをログに記録しない
 * - SEC-002: デバッグログは環境変数で制御
 * - SEC-003: /tmp等への書き込み禁止（標準エラー出力のみ）
 * - SEC-004: エラーメッセージのサニタイズ
 */

// ============================================================================
// ログレベル定義
// ============================================================================

/**
 * ログレベル
 *
 * | レベル | 値 | 用途 |
 * |--------|-----|------|
 * | TRACE | 0 | 詳細なデバッグ情報 |
 * | DEBUG | 1 | デバッグ情報 |
 * | INFO | 2 | 一般的な情報 |
 * | WARN | 3 | 警告 |
 * | ERROR | 4 | エラー |
 * | NONE | 5 | ログなし |
 */
export enum LogLevel {
  TRACE = 0,
  DEBUG = 1,
  INFO = 2,
  WARN = 3,
  ERROR = 4,
  NONE = 5,
}

/**
 * ログレベル名のマッピング
 */
const LOG_LEVEL_NAMES: Record<LogLevel, string> = {
  [LogLevel.TRACE]: 'TRACE',
  [LogLevel.DEBUG]: 'DEBUG',
  [LogLevel.INFO]: 'INFO',
  [LogLevel.WARN]: 'WARN',
  [LogLevel.ERROR]: 'ERROR',
  [LogLevel.NONE]: 'NONE',
};

/**
 * 文字列からログレベルを解決
 */
function parseLogLevel(levelStr: string | undefined): LogLevel {
  if (!levelStr) {
    return LogLevel.WARN; // デフォルト: WARN
  }

  const normalized = levelStr.toUpperCase().trim();

  switch (normalized) {
    case 'TRACE':
      return LogLevel.TRACE;
    case 'DEBUG':
      return LogLevel.DEBUG;
    case 'INFO':
      return LogLevel.INFO;
    case 'WARN':
    case 'WARNING':
      return LogLevel.WARN;
    case 'ERROR':
      return LogLevel.ERROR;
    case 'NONE':
    case 'OFF':
    case 'SILENT':
      return LogLevel.NONE;
    default:
      return LogLevel.WARN;
  }
}

// ============================================================================
// センシティブ情報のマスキング
// ============================================================================

/**
 * マスキング対象のキー（大文字小文字無視）
 */
const SENSITIVE_KEYS = [
  'password',
  'passwd',
  'secret',
  'token',
  'apikey',
  'api_key',
  'authorization',
  'auth',
  'credential',
  'credentials',
];

/**
 * センシティブなキーかどうかを判定
 */
function isSensitiveKey(key: string): boolean {
  const lowerKey = key.toLowerCase();
  return SENSITIVE_KEYS.some((sensitive) => lowerKey.includes(sensitive));
}

/**
 * オブジェクトからセンシティブ情報をマスキング
 *
 * SEC-001準拠: パスワード等をログに記録しない
 */
export function maskSensitiveData(data: unknown): unknown {
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data === 'string') {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => maskSensitiveData(item));
  }

  if (typeof data === 'object') {
    const masked: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (isSensitiveKey(key)) {
        masked[key] = '***MASKED***';
      } else if (typeof value === 'object' && value !== null) {
        masked[key] = maskSensitiveData(value);
      } else {
        masked[key] = value;
      }
    }
    return masked;
  }

  return data;
}

// ============================================================================
// ロガークラス
// ============================================================================

/**
 * セキュアロガー
 *
 * 特徴:
 * - 標準エラー出力のみ使用（SEC-003準拠）
 * - センシティブ情報の自動マスキング（SEC-001準拠）
 * - 環境変数によるログレベル制御（SEC-002準拠）
 */
export class Logger {
  private level: LogLevel;
  private namespace: string;

  constructor(namespace: string, level?: LogLevel) {
    this.namespace = namespace;
    this.level = level ?? parseLogLevel(process.env.LOG_LEVEL);
  }

  /**
   * 現在のログレベルを取得
   */
  getLevel(): LogLevel {
    return this.level;
  }

  /**
   * ログレベルを設定
   */
  setLevel(level: LogLevel): void {
    this.level = level;
  }

  /**
   * 指定されたレベルでログを出力可能かどうか
   */
  isEnabled(level: LogLevel): boolean {
    return level >= this.level;
  }

  /**
   * タイムスタンプを生成
   */
  private getTimestamp(): string {
    return new Date().toISOString();
  }

  /**
   * ログメッセージをフォーマット
   */
  private format(level: LogLevel, message: string, data?: unknown): string {
    const timestamp = this.getTimestamp();
    const levelName = LOG_LEVEL_NAMES[level];

    let output = `[${timestamp}] [${levelName}] [${this.namespace}] ${message}`;

    if (data !== undefined) {
      const masked = maskSensitiveData(data);
      try {
        output += ` ${JSON.stringify(masked)}`;
      } catch {
        output += ' [Unserializable data]';
      }
    }

    return output;
  }

  /**
   * ログ出力（標準エラー出力のみ）
   *
   * SEC-003準拠: ファイルシステムへの書き込みなし
   */
  private output(level: LogLevel, message: string, data?: unknown): void {
    if (!this.isEnabled(level)) {
      return;
    }

    const formatted = this.format(level, message, data);

    // 標準エラー出力のみ使用（MCP仕様：stdoutはJSON-RPCで使用）
    console.error(formatted);
  }

  /**
   * TRACEレベルログ
   */
  trace(message: string, data?: unknown): void {
    this.output(LogLevel.TRACE, message, data);
  }

  /**
   * DEBUGレベルログ
   */
  debug(message: string, data?: unknown): void {
    this.output(LogLevel.DEBUG, message, data);
  }

  /**
   * INFOレベルログ
   */
  info(message: string, data?: unknown): void {
    this.output(LogLevel.INFO, message, data);
  }

  /**
   * WARNレベルログ
   */
  warn(message: string, data?: unknown): void {
    this.output(LogLevel.WARN, message, data);
  }

  /**
   * ERRORレベルログ
   */
  error(message: string, data?: unknown): void {
    this.output(LogLevel.ERROR, message, data);
  }

  /**
   * 子ロガーを作成
   */
  child(childNamespace: string): Logger {
    return new Logger(`${this.namespace}:${childNamespace}`, this.level);
  }
}

// ============================================================================
// デフォルトロガーインスタンス
// ============================================================================

/**
 * ルートロガー
 */
export const rootLogger = new Logger('jaou-fm');

/**
 * モジュール別ロガー
 */
export const loggers = {
  /** APIクライアント用 */
  client: rootLogger.child('client'),
  /** セッション管理用 */
  session: rootLogger.child('session'),
  /** ツール実行用 */
  tools: rootLogger.child('tools'),
  /** 設定管理用 */
  config: rootLogger.child('config'),
  /** 分析機能用 */
  analysis: rootLogger.child('analysis'),
};

// ============================================================================
// ユーティリティ関数
// ============================================================================

/**
 * ロガーを作成
 *
 * @param namespace - ロガーの名前空間
 * @returns Logger インスタンス
 */
export function createLogger(namespace: string): Logger {
  return rootLogger.child(namespace);
}

/**
 * 実行時間を計測してログ出力
 *
 * @param logger - 使用するロガー
 * @param operation - 操作名
 * @returns 完了時に呼び出す関数
 */
export function createTimedLogger(logger: Logger, operation: string): () => void {
  const startTime = Date.now();

  return () => {
    const duration = Date.now() - startTime;
    logger.debug(`${operation} completed in ${duration}ms`);
  };
}

/**
 * エラーをログ出力
 *
 * SEC-004準拠: 認証情報を含まないエラーメッセージ
 *
 * @param logger - 使用するロガー
 * @param operation - 操作名
 * @param error - エラーオブジェクト
 */
export function logError(logger: Logger, operation: string, error: unknown): void {
  const errorInfo: Record<string, unknown> = {
    operation,
  };

  if (error instanceof Error) {
    errorInfo.message = error.message;
    errorInfo.name = error.name;

    // スタックトレースはDEBUGレベル以下でのみ出力
    if (logger.isEnabled(LogLevel.DEBUG) && error.stack) {
      errorInfo.stack = error.stack;
    }
  } else if (typeof error === 'object' && error !== null) {
    // Axiosエラー等のオブジェクト型エラー
    const errObj = error as Record<string, unknown>;

    if ('message' in errObj) {
      errorInfo.message = errObj.message;
    }

    if ('response' in errObj) {
      const response = errObj.response as Record<string, unknown> | undefined;
      if (response) {
        errorInfo.status = response.status;
        // レスポンスデータからもセンシティブ情報をマスク
        if (response.data) {
          errorInfo.responseData = maskSensitiveData(response.data);
        }
      }
    }
  } else {
    errorInfo.message = String(error);
  }

  logger.error(`Error in ${operation}`, errorInfo);
}
