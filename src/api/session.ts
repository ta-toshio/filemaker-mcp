/**
 * セッション管理
 *
 * FileMaker Data APIセッションの管理
 * 設計書 3.2.1, 3.2.2 セクション準拠
 */

import type { FileMakerConfig } from '../config.js';
import type { FMLoginResponse } from '../types/filemaker.js';
import type { ErrorResponse } from '../types/tools.js';
import { createTimedLogger, loggers } from '../utils/logger.js';
import { FileMakerHttpClient, isErrorResponse } from './client.js';
import { ErrorCodes } from './error-mapper.js';

const logger = loggers.session;

// ============================================================================
// 型定義
// ============================================================================

/**
 * セッション情報
 */
export interface SessionInfo {
  /** データベース名 */
  database: string;
  /** サーバーURL */
  server: string;
  /** セッション作成時刻 */
  createdAt: number;
}

/**
 * セッション状態
 */
export interface SessionState {
  /** セッショントークン（内部保持） */
  token: string;
  /** セッション情報 */
  info: SessionInfo;
  /** 設定 */
  config: FileMakerConfig;
}

// ============================================================================
// セッションマネージャークラス
// ============================================================================

/**
 * セッションマネージャー
 *
 * 特徴:
 * - シングルセッション管理（同時に1つのセッションのみ）
 * - セッションタイムアウト追跡
 * - 安全なログアウト処理
 */
export class SessionManager {
  private httpClient: FileMakerHttpClient | null = null;
  private state: SessionState | null = null;

  /**
   * 現在のHTTPクライアントを取得
   */
  getHttpClient(): FileMakerHttpClient | null {
    return this.httpClient;
  }

  /**
   * 現在のセッショントークンを取得
   */
  getToken(): string | null {
    return this.state?.token ?? null;
  }

  /**
   * 現在のセッション情報を取得
   */
  getSessionInfo(): SessionInfo | null {
    return this.state?.info ?? null;
  }

  /**
   * 現在の設定を取得
   */
  getConfig(): FileMakerConfig | null {
    return this.state?.config ?? null;
  }

  /**
   * セッションが有効かどうか
   */
  hasActiveSession(): boolean {
    return this.state !== null && this.state.token !== '';
  }

  /**
   * セッション経過時間（秒）を取得
   */
  getSessionAge(): number | undefined {
    if (!this.state) {
      return undefined;
    }
    return Math.floor((Date.now() - this.state.info.createdAt) / 1000);
  }

  /**
   * セッションがタイムアウト近いかどうか
   *
   * @param bufferSeconds - バッファ秒数（デフォルト: 60秒）
   * @returns タイムアウト近い場合true
   */
  isSessionExpiringSoon(bufferSeconds = 60): boolean {
    if (!this.state) {
      return false;
    }

    const age = this.getSessionAge();
    if (age === undefined) {
      return false;
    }

    const timeout = this.state.config.sessionTimeout;
    return age >= timeout - bufferSeconds;
  }

  /**
   * ログイン
   *
   * @param config - FileMaker設定
   * @returns 成功時はセッション情報、失敗時はエラー
   */
  async login(
    config: FileMakerConfig
  ): Promise<{ success: true; sessionInfo: SessionInfo } | ErrorResponse> {
    const logComplete = createTimedLogger(logger, 'login');

    // 既存セッションがあれば先にログアウト
    if (this.hasActiveSession()) {
      logger.info('Existing session found, logging out first');
      await this.logout();
    }

    // HTTPクライアント作成
    this.httpClient = new FileMakerHttpClient(config);

    logger.info(`Logging in to ${config.database}@${config.server}`);

    // ログインリクエスト
    const response = await this.httpClient.loginRequest<FMLoginResponse>(
      config.username,
      config.password
    );

    if (isErrorResponse(response)) {
      logger.warn('Login failed');
      logComplete();
      this.httpClient = null;
      return response;
    }

    // セッション状態を保存
    const sessionInfo: SessionInfo = {
      database: config.database,
      server: config.server,
      createdAt: Date.now(),
    };

    this.state = {
      token: response.data.token,
      info: sessionInfo,
      config,
    };

    logger.info(`Login successful to ${config.database}`);
    logComplete();

    return {
      success: true,
      sessionInfo,
    };
  }

  /**
   * ログアウト
   *
   * @returns 成功時はtrue、失敗時はエラー
   */
  async logout(): Promise<{ success: true; message: string } | ErrorResponse> {
    const logComplete = createTimedLogger(logger, 'logout');

    if (!this.hasActiveSession() || !this.httpClient || !this.state) {
      logger.warn('No active session to logout');
      logComplete();
      return {
        success: false,
        error: {
          code: ErrorCodes.SESSION_INVALID,
          message: 'No active session',
          retryable: false,
        },
      };
    }

    const token = this.state.token;
    const database = this.state.info.database;

    logger.info(`Logging out from ${database}`);

    // ログアウトリクエスト
    const response = await this.httpClient.delete<Record<string, never>>(
      `/sessions/${token}`,
      token
    );

    // セッション状態をクリア（エラーでもクリア）
    this.clearSession();

    if (isErrorResponse(response)) {
      // 401エラーは既にセッションが無効なのでエラーにしない
      if (response.error.code === ErrorCodes.SESSION_EXPIRED) {
        logger.info('Session already expired');
        logComplete();
        return {
          success: true,
          message: 'Session already expired',
        };
      }

      logger.warn('Logout failed', { error: response.error });
      logComplete();
      return response;
    }

    logger.info('Logout successful');
    logComplete();

    return {
      success: true,
      message: 'Logged out successfully',
    };
  }

  /**
   * セッション有効性確認
   *
   * 設計書 3.2.2 準拠:
   * Data APIにはセッション検証専用エンドポイントがないため、
   * 認証済みエンドポイント（GET /layouts）を呼び出して検証
   *
   * @returns セッション有効性
   */
  async validateSession(): Promise<{
    valid: boolean;
    message: string;
    sessionAge?: number;
  }> {
    const logComplete = createTimedLogger(logger, 'validateSession');

    if (!this.hasActiveSession() || !this.httpClient || !this.state) {
      logComplete();
      return {
        valid: false,
        message: 'No active session',
      };
    }

    logger.debug('Validating session');

    // GET /layouts でセッション検証
    const response = await this.httpClient.get<{ layouts: unknown[] }>(
      '/layouts',
      this.state.token
    );

    if (isErrorResponse(response)) {
      // 401はセッション期限切れ
      if (response.error.code === ErrorCodes.SESSION_EXPIRED) {
        logger.info('Session expired');
        this.clearSession();
        logComplete();
        return {
          valid: false,
          message: 'Session expired or invalid',
        };
      }

      // その他のエラーは検証失敗だがセッションは維持
      logger.warn('Session validation failed with error', { error: response.error });
      logComplete();
      return {
        valid: false,
        message: response.error.message,
      };
    }

    const sessionAge = this.getSessionAge();
    logger.debug('Session is valid', { sessionAge });
    logComplete();

    return {
      valid: true,
      message: 'Session is valid',
      sessionAge,
    };
  }

  /**
   * 認証済みリクエストを実行
   *
   * @param requestFn - リクエスト実行関数
   * @returns レスポンス
   */
  async withSession<T>(
    requestFn: (client: FileMakerHttpClient, token: string) => Promise<T>
  ): Promise<T | ErrorResponse> {
    if (!this.hasActiveSession() || !this.httpClient || !this.state) {
      // SESSION_INVALID: セッション未確立は retryable: false
      // （SESSION_EXPIRED とは異なり、先にログインが必要）
      return {
        success: false,
        error: {
          code: ErrorCodes.SESSION_INVALID,
          message: 'No active session. Please login first.',
          details: 'withSession called without active session',
          retryable: false,
        },
      };
    }

    return requestFn(this.httpClient, this.state.token);
  }

  /**
   * セッション状態をクリア
   */
  private clearSession(): void {
    this.state = null;
    this.httpClient = null;
    logger.debug('Session cleared');
  }
}

// ============================================================================
// シングルトンインスタンス
// ============================================================================

/**
 * グローバルセッションマネージャー
 */
let globalSessionManager: SessionManager | null = null;

/**
 * セッションマネージャーを取得
 */
export function getSessionManager(): SessionManager {
  if (!globalSessionManager) {
    globalSessionManager = new SessionManager();
  }
  return globalSessionManager;
}

/**
 * セッションマネージャーをリセット（テスト用）
 */
export function resetSessionManager(): void {
  globalSessionManager = null;
}
