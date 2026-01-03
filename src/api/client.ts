/**
 * FileMaker Data API HTTPクライアント
 *
 * Node.js 24+ のネイティブ fetch を使用
 * 設計書 4.2, 6.1 セクション準拠
 */

import type { FileMakerConfig } from '../config.js';
import type { FMMessage, FMResponse } from '../types/filemaker.js';
import { createTimedLogger, logError, loggers } from '../utils/logger.js';
import { type ErrorResponse, createErrorResponse, extractFMErrorCode } from './error-mapper.js';

const logger = loggers.client;

// ============================================================================
// 型定義
// ============================================================================

/**
 * HTTPメソッド
 */
export type HttpMethod = 'GET' | 'POST' | 'DELETE' | 'PATCH' | 'PUT';

/**
 * リクエストオプション
 */
export interface RequestOptions {
  /** 追加ヘッダー */
  headers?: Record<string, string>;
  /** リクエストボディ */
  body?: unknown;
  /** タイムアウト（ミリ秒） */
  timeout?: number;
}

/**
 * APIレスポンス
 */
export interface ApiResponse<T> {
  /** HTTPステータスコード */
  status: number;
  /** レスポンスデータ */
  data: T;
  /** FileMakerメッセージ */
  messages?: FMMessage[];
}

// ============================================================================
// 定数
// ============================================================================

/**
 * デフォルトタイムアウト（ミリ秒）
 */
const DEFAULT_TIMEOUT = 30000;

/**
 * Data APIのベースパス
 */
const DATA_API_BASE = '/fmi/data';

// ============================================================================
// HTTPクライアントクラス
// ============================================================================

/**
 * FileMaker Data API HTTPクライアント
 *
 * 特徴:
 * - Node.js 24+ ネイティブ fetch 使用
 * - HTTPS必須（SEC-005準拠）
 * - SSL検証オプション（SEC-006準拠）
 */
export class FileMakerHttpClient {
  private baseUrl: string;
  private apiVersion: string;
  private database: string;
  private sslVerify: boolean;

  constructor(config: FileMakerConfig) {
    this.baseUrl = config.server;
    this.apiVersion = config.apiVersion;
    this.database = config.database;
    this.sslVerify = config.sslVerify;

    // SSL検証無効化時の警告
    // Note: ネイティブfetchではhttps.Agentが使えないため、
    // NODE_TLS_REJECT_UNAUTHORIZED環境変数で制御する必要がある
    if (!this.sslVerify) {
      logger.warn(
        'SEC-006: SSL certificate verification is disabled. ' +
          'Set NODE_TLS_REJECT_UNAUTHORIZED=0 environment variable if needed.'
      );
    }

    logger.debug('HTTP client initialized', {
      server: this.baseUrl,
      apiVersion: this.apiVersion,
      database: this.database,
      sslVerify: this.sslVerify,
    });
  }

  /**
   * APIエンドポイントURLを構築
   *
   * @param path - エンドポイントパス（例: /layouts）
   * @returns 完全なURL
   */
  buildUrl(path: string): string {
    // パスの先頭スラッシュを正規化
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return `${this.baseUrl}${DATA_API_BASE}/${this.apiVersion}/databases/${this.database}${normalizedPath}`;
  }

  /**
   * HTTPリクエストを実行
   *
   * @param method - HTTPメソッド
   * @param path - エンドポイントパス
   * @param token - 認証トークン（オプション）
   * @param options - リクエストオプション
   * @returns APIレスポンスまたはエラー
   */
  async request<T>(
    method: HttpMethod,
    path: string,
    token?: string,
    options: RequestOptions = {}
  ): Promise<ApiResponse<T> | ErrorResponse> {
    const url = this.buildUrl(path);
    const logComplete = createTimedLogger(logger, `${method} ${path}`);

    logger.debug(`${method} ${url}`);

    // ヘッダー構築
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    // リクエストオプション構築
    const fetchOptions: RequestInit = {
      method,
      headers,
    };

    if (options.body !== undefined) {
      fetchOptions.body = JSON.stringify(options.body);
      logger.trace('Request body', options.body);
    }

    // タイムアウト設定
    const timeout = options.timeout ?? DEFAULT_TIMEOUT;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    fetchOptions.signal = controller.signal;

    // Note: SSL検証無効化はprocess.env.NODE_TLS_REJECT_UNAUTHORIZEDで制御
    // httpsAgentはネイティブfetchでは直接使用できないため、
    // SSL検証無効化が必要な場合は環境変数で設定する

    try {
      const response = await fetch(url, fetchOptions);
      clearTimeout(timeoutId);

      const status = response.status;

      // レスポンスボディを取得
      let data: unknown;
      const contentType = response.headers.get('content-type');

      if (contentType?.includes('application/json')) {
        data = await response.json();
      } else {
        data = await response.text();
      }

      logger.debug(`Response: ${status}`, { url });

      // エラーレスポンスの処理
      if (!response.ok) {
        const fmErrorCode = extractFMErrorCode(data);
        logger.warn(`API error: ${status}`, { url, fmErrorCode });
        logComplete();
        return createErrorResponse(status, fmErrorCode, `${method} ${path}`);
      }

      // 成功レスポンス
      const fmResponse = data as FMResponse<T>;
      logComplete();

      return {
        status,
        data: fmResponse.response,
        messages: fmResponse.messages,
      };
    } catch (error) {
      clearTimeout(timeoutId);

      // AbortError（タイムアウト）の処理
      if (error instanceof Error && error.name === 'AbortError') {
        logger.error(`Request timeout: ${url}`);
        logComplete();
        return createErrorResponse(504, undefined, `Timeout: ${method} ${path}`);
      }

      // ネットワークエラー等
      logError(logger, `${method} ${path}`, error);
      logComplete();

      // fetch のエラーはネットワークエラーとして扱う
      return {
        success: false,
        error: {
          code: 1002, // AUTH_SERVER_UNAVAILABLE
          message: error instanceof Error ? error.message : 'Network error',
          details: `${method} ${path}`,
          retryable: true,
        },
      };
    }
  }

  /**
   * GETリクエスト
   */
  async get<T>(
    path: string,
    token?: string,
    options?: RequestOptions
  ): Promise<ApiResponse<T> | ErrorResponse> {
    return this.request<T>('GET', path, token, options);
  }

  /**
   * POSTリクエスト
   */
  async post<T>(
    path: string,
    token?: string,
    body?: unknown,
    options?: RequestOptions
  ): Promise<ApiResponse<T> | ErrorResponse> {
    return this.request<T>('POST', path, token, { ...options, body });
  }

  /**
   * DELETEリクエスト
   */
  async delete<T>(
    path: string,
    token?: string,
    options?: RequestOptions
  ): Promise<ApiResponse<T> | ErrorResponse> {
    return this.request<T>('DELETE', path, token, options);
  }

  /**
   * Basic認証でリクエスト（ログイン用）
   *
   * @param username - ユーザー名
   * @param password - パスワード
   * @param body - リクエストボディ（オプション）
   * @returns APIレスポンスまたはエラー
   */
  async loginRequest<T>(
    username: string,
    password: string,
    body?: unknown
  ): Promise<ApiResponse<T> | ErrorResponse> {
    const url = this.buildUrl('/sessions');
    const logComplete = createTimedLogger(logger, 'POST /sessions (login)');

    logger.info(`Login attempt for database: ${this.database}`);

    // Basic認証ヘッダー
    const credentials = Buffer.from(`${username}:${password}`).toString('base64');
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Basic ${credentials}`,
    };

    const fetchOptions: RequestInit = {
      method: 'POST',
      headers,
    };

    if (body !== undefined) {
      fetchOptions.body = JSON.stringify(body);
    }

    // タイムアウト設定
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);
    fetchOptions.signal = controller.signal;

    try {
      const response = await fetch(url, fetchOptions);
      clearTimeout(timeoutId);

      const status = response.status;
      let data: unknown;

      const contentType = response.headers.get('content-type');
      if (contentType?.includes('application/json')) {
        data = await response.json();
      } else {
        data = await response.text();
      }

      if (!response.ok) {
        const fmErrorCode = extractFMErrorCode(data);
        logger.warn(`Login failed: ${status}`, { fmErrorCode });
        logComplete();
        return createErrorResponse(status, fmErrorCode, 'Login failed');
      }

      const fmResponse = data as FMResponse<T>;
      logger.info('Login successful');
      logComplete();

      return {
        status,
        data: fmResponse.response,
        messages: fmResponse.messages,
      };
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        logger.error('Login timeout');
        logComplete();
        return createErrorResponse(504, undefined, 'Login timeout');
      }

      logError(logger, 'login', error);
      logComplete();

      return {
        success: false,
        error: {
          code: 1002,
          message: error instanceof Error ? error.message : 'Network error',
          details: 'Login failed',
          retryable: true,
        },
      };
    }
  }
}

// ============================================================================
// ユーティリティ関数
// ============================================================================

/**
 * レスポンスがエラーかどうかを判定（型ガード）
 */
export function isErrorResponse(
  response: ApiResponse<unknown> | ErrorResponse
): response is ErrorResponse {
  return 'success' in response && response.success === false;
}

/**
 * レスポンスが成功かどうかを判定（型ガード）
 */
export function isSuccessResponse<T>(
  response: ApiResponse<T> | ErrorResponse
): response is ApiResponse<T> {
  return !isErrorResponse(response);
}
