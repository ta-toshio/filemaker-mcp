/**
 * error-mapper.ts 単体テスト
 *
 * テスト対象: エラーマッピング機能
 * - resolveError: HTTPステータス/FileMakerエラーコードからエラー情報への変換
 * - extractFMErrorCode: FileMakerレスポンスからエラーコード抽出
 * - createErrorResponse: エラーレスポンス生成
 * - createErrorResponseFromException: 例外からエラーレスポンス生成
 * - isRetryableError: リトライ可能判定
 *
 * 設計書 5.1, 5.2, 5.3 準拠
 */

import {
  createErrorResponse,
  createErrorResponseFromException,
  ErrorCodes,
  extractFMErrorCode,
  FM_ERROR_MAP,
  HTTP_ERROR_MAP,
  isRetryableError,
  resolveError,
} from '../../../src/api/error-mapper.js';

// ============================================================================
// resolveError のテスト
// ============================================================================

describe('resolveError', () => {
  describe('FileMakerエラーコード優先の検証', () => {
    /**
     * 前提条件: FileMakerエラーコードが指定されている
     * 検証項目: HTTPステータスよりFileMakerエラーコードが優先される
     */
    it('FileMakerエラーコード401（レコード該当なし）はHTTP401（認証エラー）より優先される', () => {
      // FileMaker 401 = "No records match the request"（検索結果なし）
      // HTTP 401 = "Session expired"（セッション切れ）
      // → FileMakerコードが優先されるべき
      const result = resolveError(401, 401);

      expect(result.code).toBe(ErrorCodes.API_RECORD_NOT_FOUND);
      expect(result.message).toBe('No records match the request');
      expect(result.retryable).toBe(false);
    });

    it('FileMakerエラーコード212（認証失敗）が正しくマッピングされる', () => {
      const result = resolveError(401, 212);

      expect(result.code).toBe(ErrorCodes.AUTH_INVALID_CREDENTIALS);
      expect(result.message).toBe('Invalid username or password');
      expect(result.retryable).toBe(false);
    });

    it('FileMakerエラーコード105（レイアウト不在）が正しくマッピングされる', () => {
      const result = resolveError(404, 105);

      expect(result.code).toBe(ErrorCodes.API_LAYOUT_NOT_FOUND);
      expect(result.message).toBe('Layout is missing');
      expect(result.retryable).toBe(false);
    });
  });

  describe('HTTPステータスコードのマッピング', () => {
    /**
     * 前提条件: FileMakerエラーコードが指定されていない
     * 検証項目: HTTPステータスに基づいてエラー情報が返される
     */
    it('HTTP 400 は API_INVALID_QUERY にマッピングされる', () => {
      const result = resolveError(400);

      expect(result.code).toBe(ErrorCodes.API_INVALID_QUERY);
      expect(result.retryable).toBe(false);
    });

    it('HTTP 401 は SESSION_EXPIRED にマッピングされ、retryable: true', () => {
      const result = resolveError(401);

      expect(result.code).toBe(ErrorCodes.SESSION_EXPIRED);
      expect(result.retryable).toBe(true); // 再ログインで復旧可能
    });

    it('HTTP 403 は AUTH_INSUFFICIENT_PRIVILEGES にマッピングされる', () => {
      const result = resolveError(403);

      expect(result.code).toBe(ErrorCodes.AUTH_INSUFFICIENT_PRIVILEGES);
      expect(result.retryable).toBe(false);
    });

    it('HTTP 404 は API_LAYOUT_NOT_FOUND にマッピングされる', () => {
      const result = resolveError(404);

      expect(result.code).toBe(ErrorCodes.API_LAYOUT_NOT_FOUND);
      expect(result.retryable).toBe(false);
    });

    it('HTTP 429 は API_RATE_LIMITED にマッピングされ、retryable: true', () => {
      const result = resolveError(429);

      expect(result.code).toBe(ErrorCodes.API_RATE_LIMITED);
      expect(result.retryable).toBe(true); // 待機で復旧可能
    });

    it('HTTP 500 は INTERNAL_UNKNOWN にマッピングされ、retryable: true', () => {
      const result = resolveError(500);

      expect(result.code).toBe(ErrorCodes.INTERNAL_UNKNOWN);
      expect(result.retryable).toBe(true); // 一時的障害の可能性
    });

    it('HTTP 503 は AUTH_SERVER_UNAVAILABLE にマッピングされ、retryable: true', () => {
      const result = resolveError(503);

      expect(result.code).toBe(ErrorCodes.AUTH_SERVER_UNAVAILABLE);
      expect(result.retryable).toBe(true);
    });
  });

  describe('不明なエラーの処理', () => {
    /**
     * 前提条件: マッピングに存在しないHTTPステータス
     * 検証項目: デフォルトのエラー情報が返される
     */
    it('未定義のHTTPステータスは INTERNAL_UNKNOWN にマッピングされる', () => {
      const result = resolveError(418); // I'm a teapot

      expect(result.code).toBe(ErrorCodes.INTERNAL_UNKNOWN);
      expect(result.message).toBe('Unknown error');
      expect(result.retryable).toBe(false);
    });

    it('未定義のFileMakerエラーコードはHTTPステータスにフォールバック', () => {
      const result = resolveError(400, 9999); // 存在しないFMコード

      expect(result.code).toBe(ErrorCodes.API_INVALID_QUERY);
      expect(result.message).toBe('Bad request');
    });
  });
});

// ============================================================================
// extractFMErrorCode のテスト
// ============================================================================

describe('extractFMErrorCode', () => {
  describe('正常なレスポンスからの抽出', () => {
    /**
     * 前提条件: FileMaker API標準形式のレスポンス
     * 検証項目: messages[0].code からエラーコードが抽出される
     */
    it('messages[0].code からエラーコードを抽出できる', () => {
      const responseData = {
        messages: [{ code: '401', message: 'No records match the request' }],
      };

      const result = extractFMErrorCode(responseData);

      expect(result).toBe(401);
    });

    it('文字列のエラーコードを数値に変換する', () => {
      const responseData = {
        messages: [{ code: '105' }],
      };

      const result = extractFMErrorCode(responseData);

      expect(result).toBe(105);
    });

    it('数値のエラーコードをそのまま返す', () => {
      const responseData = {
        messages: [{ code: 212 }],
      };

      const result = extractFMErrorCode(responseData);

      expect(result).toBe(212);
    });
  });

  describe('エラーコードなしの処理', () => {
    /**
     * 前提条件: エラーコードが含まれていないレスポンス
     * 検証項目: undefined が返される
     */
    it('code: 0 の場合は undefined を返す', () => {
      const responseData = {
        messages: [{ code: '0', message: 'OK' }],
      };

      const result = extractFMErrorCode(responseData);

      expect(result).toBeUndefined();
    });

    it('messages が空配列の場合は undefined を返す', () => {
      const responseData = {
        messages: [],
      };

      const result = extractFMErrorCode(responseData);

      expect(result).toBeUndefined();
    });

    it('messages がない場合は undefined を返す', () => {
      const responseData = {
        data: {},
      };

      const result = extractFMErrorCode(responseData);

      expect(result).toBeUndefined();
    });

    it('null の場合は undefined を返す', () => {
      const result = extractFMErrorCode(null);

      expect(result).toBeUndefined();
    });

    it('undefined の場合は undefined を返す', () => {
      const result = extractFMErrorCode(undefined);

      expect(result).toBeUndefined();
    });

    it('オブジェクト以外の場合は undefined を返す', () => {
      expect(extractFMErrorCode('string')).toBeUndefined();
      expect(extractFMErrorCode(123)).toBeUndefined();
      expect(extractFMErrorCode(true)).toBeUndefined();
    });
  });
});

// ============================================================================
// createErrorResponse のテスト
// ============================================================================

describe('createErrorResponse', () => {
  describe('エラーレスポンス構造', () => {
    /**
     * 前提条件: HTTPステータスとオプションパラメータ
     * 検証項目: ErrorResponse形式のオブジェクトが生成される
     */
    it('基本的なエラーレスポンスを生成できる', () => {
      const result = createErrorResponse(401);

      expect(result).toEqual({
        success: false,
        error: {
          code: ErrorCodes.SESSION_EXPIRED,
          message: 'Session expired',
          details: undefined,
          fmErrorCode: undefined,
          retryable: true,
        },
      });
    });

    it('FileMakerエラーコードを含むエラーレスポンスを生成できる', () => {
      const result = createErrorResponse(400, 401);

      expect(result.error.fmErrorCode).toBe(401);
      expect(result.error.code).toBe(ErrorCodes.API_RECORD_NOT_FOUND);
    });

    it('コンテキスト情報を含むエラーレスポンスを生成できる', () => {
      const result = createErrorResponse(404, undefined, 'TestLayout not found');

      expect(result.error.details).toBe('TestLayout not found');
    });
  });
});

// ============================================================================
// createErrorResponseFromException のテスト
// ============================================================================

describe('createErrorResponseFromException', () => {
  describe('Axios風エラーの処理', () => {
    /**
     * 前提条件: Axios形式のエラーオブジェクト
     * 検証項目: レスポンス情報からエラーレスポンスが生成される
     */
    it('response.statusからエラーレスポンスを生成できる', () => {
      const axiosError = {
        response: {
          status: 403,
          data: {},
        },
      };

      const result = createErrorResponseFromException(axiosError);

      expect(result.error.code).toBe(ErrorCodes.AUTH_INSUFFICIENT_PRIVILEGES);
      expect(result.success).toBe(false);
    });

    it('response.dataからFileMakerエラーコードを抽出できる', () => {
      const axiosError = {
        response: {
          status: 400,
          data: {
            messages: [{ code: '401' }],
          },
        },
      };

      const result = createErrorResponseFromException(axiosError);

      expect(result.error.fmErrorCode).toBe(401);
      expect(result.error.code).toBe(ErrorCodes.API_RECORD_NOT_FOUND);
    });
  });

  describe('ネットワークエラーの処理', () => {
    /**
     * 前提条件: responseがないエラー（ネットワーク接続失敗等）
     * 検証項目: AUTH_SERVER_UNAVAILABLEエラーが生成される
     */
    it('messageのみのエラーオブジェクトからエラーレスポンスを生成できる', () => {
      const networkError = {
        message: 'Network connection failed',
      };

      const result = createErrorResponseFromException(networkError);

      expect(result.error.code).toBe(ErrorCodes.AUTH_SERVER_UNAVAILABLE);
      expect(result.error.message).toBe('Network connection failed');
      expect(result.error.retryable).toBe(true);
    });
  });

  describe('標準Errorオブジェクトの処理', () => {
    /**
     * 前提条件: JavaScriptの標準Error
     * 検証項目: messageプロパティがあるため、AUTH_SERVER_UNAVAILABLEエラーが生成される
     *
     * 注意: 実装では、Errorオブジェクトは typeof error === 'object' を通過し、
     * message プロパティがあるため AUTH_SERVER_UNAVAILABLE として処理される。
     * これはネットワークエラー等の処理パスを共有している。
     */
    it('Errorオブジェクトからエラーレスポンスを生成できる', () => {
      const error = new Error('Something went wrong');

      const result = createErrorResponseFromException(error);

      // Errorはobject型であり、messageプロパティを持つため
      // AUTH_SERVER_UNAVAILABLE (retryable: true) として処理される
      expect(result.error.code).toBe(ErrorCodes.AUTH_SERVER_UNAVAILABLE);
      expect(result.error.message).toBe('Something went wrong');
      expect(result.error.retryable).toBe(true);
    });
  });

  describe('不明なエラーの処理', () => {
    /**
     * 前提条件: 認識できないエラー形式
     * 検証項目: デフォルトのエラーレスポンスが生成される
     */
    it('文字列エラーからエラーレスポンスを生成できる', () => {
      const result = createErrorResponseFromException('Unknown error occurred');

      expect(result.error.code).toBe(ErrorCodes.INTERNAL_UNKNOWN);
      expect(result.error.message).toBe('An unknown error occurred');
    });

    it('nullからエラーレスポンスを生成できる', () => {
      const result = createErrorResponseFromException(null);

      expect(result.error.code).toBe(ErrorCodes.INTERNAL_UNKNOWN);
    });
  });
});

// ============================================================================
// isRetryableError のテスト
// ============================================================================

describe('isRetryableError', () => {
  describe('リトライ可能なエラー', () => {
    /**
     * 前提条件: 一時的な障害を示すエラーコード
     * 検証項目: trueが返される
     */
    it('SESSION_EXPIRED はリトライ可能', () => {
      expect(isRetryableError(ErrorCodes.SESSION_EXPIRED)).toBe(true);
    });

    it('API_RATE_LIMITED はリトライ可能', () => {
      expect(isRetryableError(ErrorCodes.API_RATE_LIMITED)).toBe(true);
    });

    it('AUTH_SERVER_UNAVAILABLE はリトライ可能', () => {
      expect(isRetryableError(ErrorCodes.AUTH_SERVER_UNAVAILABLE)).toBe(true);
    });
  });

  describe('リトライ不可能なエラー', () => {
    /**
     * 前提条件: 永続的な問題を示すエラーコード
     * 検証項目: falseが返される
     */
    it('AUTH_INVALID_CREDENTIALS はリトライ不可能', () => {
      expect(isRetryableError(ErrorCodes.AUTH_INVALID_CREDENTIALS)).toBe(false);
    });

    it('API_RECORD_NOT_FOUND はリトライ不可能', () => {
      expect(isRetryableError(ErrorCodes.API_RECORD_NOT_FOUND)).toBe(false);
    });

    it('未定義のエラーコードはリトライ不可能', () => {
      expect(isRetryableError(9999)).toBe(false);
    });
  });
});

// ============================================================================
// エラーマップの整合性テスト
// ============================================================================

describe('エラーマップの整合性', () => {
  describe('HTTP_ERROR_MAP', () => {
    it('すべてのエントリがErrorInfo形式を持つ', () => {
      for (const [_status, info] of Object.entries(HTTP_ERROR_MAP)) {
        expect(typeof info.code).toBe('number');
        expect(typeof info.message).toBe('string');
        expect(typeof info.retryable).toBe('boolean');
      }
    });
  });

  describe('FM_ERROR_MAP', () => {
    it('すべてのエントリがErrorInfo形式を持つ', () => {
      for (const [_fmCode, info] of Object.entries(FM_ERROR_MAP)) {
        expect(typeof info.code).toBe('number');
        expect(typeof info.message).toBe('string');
        expect(typeof info.retryable).toBe('boolean');
      }
    });

    it('FileMaker 401とHTTP 401の区別が正しい', () => {
      // FileMaker 401 = レコード該当なし（検索の正常結果）
      const fm401 = FM_ERROR_MAP[401];
      expect(fm401).toBeDefined();
      expect(fm401!.code).toBe(ErrorCodes.API_RECORD_NOT_FOUND);
      expect(fm401!.message).toBe('No records match the request');

      // HTTP 401 = セッション期限切れ（認証エラー）
      const http401 = HTTP_ERROR_MAP[401];
      expect(http401).toBeDefined();
      expect(http401!.code).toBe(ErrorCodes.SESSION_EXPIRED);
      expect(http401!.message).toBe('Session expired');
    });
  });
});
