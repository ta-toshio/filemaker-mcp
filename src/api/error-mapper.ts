/**
 * エラーマッピング
 *
 * HTTPステータスとFileMakerエラーコードを内部エラーコードに変換
 * 設計書 5.1, 5.2, 5.3 セクション準拠
 */

import type { ErrorResponse } from '../types/tools.js';

// ErrorResponseを再エクスポート
export type { ErrorResponse };

// ============================================================================
// エラー情報型
// ============================================================================

/**
 * エラー情報
 */
export interface ErrorInfo {
  code: number;
  message: string;
  retryable: boolean;
}

// ============================================================================
// エラーコード定義
// ============================================================================

/**
 * 内部エラーコード範囲
 *
 * | コード範囲 | カテゴリ |
 * |-----------|---------|
 * | 1000-1099 | 認証エラー |
 * | 2000-2099 | セッションエラー |
 * | 3000-3099 | APIエラー |
 * | 4000-4099 | 分析エラー |
 * | 5000-5099 | 内部エラー |
 */
export const ErrorCodes = {
  // 認証エラー (1000-1099)
  AUTH_INVALID_CREDENTIALS: 1001,
  AUTH_SERVER_UNAVAILABLE: 1002,
  AUTH_DATABASE_NOT_FOUND: 1003,
  AUTH_INSUFFICIENT_PRIVILEGES: 1004,
  AUTH_ACCOUNT_LOCKED: 1005,

  // セッションエラー (2000-2099)
  SESSION_EXPIRED: 2001,
  SESSION_INVALID: 2002,
  SESSION_MAX_CONNECTIONS: 2003,

  // APIエラー (3000-3099)
  API_LAYOUT_NOT_FOUND: 3001,
  API_RECORD_NOT_FOUND: 3002,
  API_FIELD_NOT_FOUND: 3003,
  API_INVALID_QUERY: 3004,
  API_INSUFFICIENT_PRIVILEGES: 3005,
  API_RATE_LIMITED: 3006,

  // 分析エラー (4000-4099)
  ANALYSIS_METADATA_FAILED: 4001,
  ANALYSIS_PORTAL_FAILED: 4002,
  ANALYSIS_TIMEOUT: 4003,

  // 内部エラー (5000-5099)
  INTERNAL_UNKNOWN: 5001,
  INTERNAL_CONFIG_ERROR: 5002,
  INTERNAL_MEMORY_ERROR: 5003,
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

// ============================================================================
// HTTPエラーマッピング
// ============================================================================

/**
 * HTTPステータス → 内部エラー
 *
 * 設計書 5.2 準拠:
 * - 401: セッション期限切れ（retryable: true - 再ログインで復旧可能）
 * - 429/5xx: サーバー一時障害（retryable: true - 待機で復旧可能）
 * - 400/403/404: リクエスト問題（retryable: false - 再試行しても同じ結果）
 */
export const HTTP_ERROR_MAP: Record<number, ErrorInfo> = {
  400: {
    code: ErrorCodes.API_INVALID_QUERY,
    message: 'Bad request',
    retryable: false,
  },
  401: {
    code: ErrorCodes.SESSION_EXPIRED,
    message: 'Session expired',
    retryable: true, // 再ログインで復旧可能
  },
  403: {
    code: ErrorCodes.AUTH_INSUFFICIENT_PRIVILEGES,
    message: 'Insufficient privileges',
    retryable: false,
  },
  404: {
    code: ErrorCodes.API_LAYOUT_NOT_FOUND,
    message: 'Resource not found',
    retryable: false,
  },
  409: {
    code: ErrorCodes.API_INVALID_QUERY,
    message: 'Conflict',
    retryable: false,
  },
  413: {
    code: ErrorCodes.API_INVALID_QUERY,
    message: 'Payload too large',
    retryable: false,
  },
  429: {
    code: ErrorCodes.API_RATE_LIMITED,
    message: 'Rate limited - too many requests',
    retryable: true, // 待機で復旧可能
  },
  500: {
    code: ErrorCodes.INTERNAL_UNKNOWN,
    message: 'FileMaker server error',
    retryable: true, // 一時的な障害の可能性
  },
  502: {
    code: ErrorCodes.AUTH_SERVER_UNAVAILABLE,
    message: 'Bad gateway',
    retryable: true,
  },
  503: {
    code: ErrorCodes.AUTH_SERVER_UNAVAILABLE,
    message: 'FileMaker server unavailable',
    retryable: true,
  },
  504: {
    code: ErrorCodes.AUTH_SERVER_UNAVAILABLE,
    message: 'Gateway timeout',
    retryable: true,
  },
};

// ============================================================================
// FileMakerエラーマッピング
// ============================================================================

/**
 * FileMakerエラーコード → 内部エラー
 *
 * 設計書 5.2 準拠:
 * - FM 401 は「レコード該当なし」（HTTP 401 とは意味が異なる）
 * - FM コードを優先して解決
 */
export const FM_ERROR_MAP: Record<number, ErrorInfo> = {
  // ファイル・レコード関連
  100: {
    code: ErrorCodes.API_RECORD_NOT_FOUND,
    message: 'File is missing',
    retryable: false,
  },
  101: {
    code: ErrorCodes.API_RECORD_NOT_FOUND,
    message: 'Record is missing',
    retryable: false,
  },
  102: {
    code: ErrorCodes.API_FIELD_NOT_FOUND,
    message: 'Field is missing',
    retryable: false,
  },
  105: {
    code: ErrorCodes.API_LAYOUT_NOT_FOUND,
    message: 'Layout is missing',
    retryable: false,
  },

  // 認証関連
  212: {
    code: ErrorCodes.AUTH_INVALID_CREDENTIALS,
    message: 'Invalid username or password',
    retryable: false,
  },
  214: {
    code: ErrorCodes.AUTH_ACCOUNT_LOCKED,
    message: 'Account is locked out',
    retryable: false,
  },

  // 検索関連
  400: {
    code: ErrorCodes.API_INVALID_QUERY,
    message: 'Find criteria are empty',
    retryable: false,
  },
  401: {
    code: ErrorCodes.API_RECORD_NOT_FOUND,
    message: 'No records match the request',
    retryable: false, // これはHTTP 401とは異なる - 検索結果なし
  },

  // サーバー関連
  802: {
    code: ErrorCodes.AUTH_SERVER_UNAVAILABLE,
    message: 'Unable to open file',
    retryable: true,
  },

  // 権限関連
  952: {
    code: ErrorCodes.AUTH_INSUFFICIENT_PRIVILEGES,
    message: 'Insufficient access privileges',
    retryable: false,
  },
};

// ============================================================================
// エラー解決関数
// ============================================================================

/**
 * エラーを解決
 *
 * 適用順序:
 * 1. FileMakerエラーコード（レスポンス内）が存在すれば FM_ERROR_MAP を優先
 * 2. FMエラーコードがなければ HTTP ステータスで判定
 * 3. 両方不明なら 5001 / Unknown error
 *
 * @param httpStatus - HTTPステータスコード
 * @param fmErrorCode - FileMakerエラーコード（オプション）
 * @returns エラー情報
 */
export function resolveError(httpStatus: number, fmErrorCode?: number): ErrorInfo {
  // 1. FileMakerエラーコードが存在すれば優先
  if (fmErrorCode !== undefined && FM_ERROR_MAP[fmErrorCode]) {
    return FM_ERROR_MAP[fmErrorCode];
  }

  // 2. HTTPステータスで判定
  if (HTTP_ERROR_MAP[httpStatus]) {
    return HTTP_ERROR_MAP[httpStatus];
  }

  // 3. 不明なエラー
  return {
    code: ErrorCodes.INTERNAL_UNKNOWN,
    message: 'Unknown error',
    retryable: false,
  };
}

/**
 * FileMakerレスポンスからエラーコードを抽出
 *
 * @param responseData - FileMaker APIレスポンスデータ
 * @returns FileMakerエラーコード（存在する場合）
 */
export function extractFMErrorCode(responseData: unknown): number | undefined {
  if (!responseData || typeof responseData !== 'object') {
    return undefined;
  }

  const data = responseData as Record<string, unknown>;

  // messages[0].code パターン
  if (Array.isArray(data.messages) && data.messages.length > 0) {
    const code = Number(data.messages[0]?.code);
    if (!Number.isNaN(code) && code !== 0) {
      return code;
    }
  }

  return undefined;
}

// ============================================================================
// エラーレスポンス生成
// ============================================================================

/**
 * エラーレスポンスを生成
 *
 * @param httpStatus - HTTPステータスコード
 * @param fmErrorCode - FileMakerエラーコード（オプション）
 * @param context - 追加のコンテキスト情報（オプション）
 * @returns ErrorResponse
 */
export function createErrorResponse(
  httpStatus: number,
  fmErrorCode?: number,
  context?: string
): ErrorResponse {
  const errorInfo = resolveError(httpStatus, fmErrorCode);

  return {
    success: false,
    error: {
      code: errorInfo.code,
      message: errorInfo.message,
      details: context,
      fmErrorCode: fmErrorCode,
      retryable: errorInfo.retryable,
    },
  };
}

/**
 * 例外からエラーレスポンスを生成
 *
 * @param error - キャッチした例外
 * @param context - 追加のコンテキスト情報（オプション）
 * @returns ErrorResponse
 */
export function createErrorResponseFromException(error: unknown, context?: string): ErrorResponse {
  // Axiosエラー形式をチェック
  if (error && typeof error === 'object') {
    const axiosError = error as {
      response?: {
        status?: number;
        data?: unknown;
      };
      message?: string;
    };

    if (axiosError.response) {
      const httpStatus = axiosError.response.status ?? 500;
      const fmErrorCode = extractFMErrorCode(axiosError.response.data);
      return createErrorResponse(httpStatus, fmErrorCode, context);
    }

    // ネットワークエラー等
    if (axiosError.message) {
      return {
        success: false,
        error: {
          code: ErrorCodes.AUTH_SERVER_UNAVAILABLE,
          message: axiosError.message,
          details: context,
          retryable: true,
        },
      };
    }
  }

  // 通常のError
  if (error instanceof Error) {
    return {
      success: false,
      error: {
        code: ErrorCodes.INTERNAL_UNKNOWN,
        message: error.message,
        details: context,
        retryable: false,
      },
    };
  }

  // 不明なエラー
  return {
    success: false,
    error: {
      code: ErrorCodes.INTERNAL_UNKNOWN,
      message: 'An unknown error occurred',
      details: context,
      retryable: false,
    },
  };
}

/**
 * エラーがリトライ可能かどうかを判定
 *
 * @param errorCode - 内部エラーコード
 * @returns リトライ可能な場合true
 */
export function isRetryableError(errorCode: number): boolean {
  // HTTP_ERROR_MAP から retryable を検索
  for (const info of Object.values(HTTP_ERROR_MAP)) {
    if (info.code === errorCode) {
      return info.retryable;
    }
  }

  // FM_ERROR_MAP から retryable を検索
  for (const info of Object.values(FM_ERROR_MAP)) {
    if (info.code === errorCode) {
      return info.retryable;
    }
  }

  return false;
}
