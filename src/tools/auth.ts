/**
 * 認証関連ツールハンドラ
 *
 * FileMaker Data API の認証機能を提供するツール群
 * - fm_login: セッション確立
 * - fm_logout: セッション終了
 * - fm_validate_session: セッション有効性確認
 *
 * 設計書 3.2.1 セクション準拠
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { ErrorCodes } from '../api/error-mapper.js';
import { getSessionManager } from '../api/session.js';
import { formatConfigForLog, getConfig, isValidConfig } from '../config.js';
import { loggers } from '../utils/logger.js';

import type {
  ErrorResponse,
  LoginInput,
  LoginOutput,
  LogoutOutput,
  ValidateSessionOutput,
} from '../types/tools.js';

const logger = loggers.tools;

// ============================================================================
// ツール定義
// ============================================================================

/**
 * 認証関連ツール定義
 */
export const AUTH_TOOLS: Tool[] = [
  {
    name: 'fm_login',
    description:
      'FileMakerサーバーにログインしてセッションを確立します。環境変数から認証情報を読み込む場合はパラメータを省略できます。',
    inputSchema: {
      type: 'object',
      properties: {
        server: {
          type: 'string',
          description: 'FileMakerサーバーURL（省略時は環境変数FM_SERVER）',
        },
        database: {
          type: 'string',
          description: 'データベース名（省略時は環境変数FM_DATABASE）',
        },
        username: {
          type: 'string',
          description: 'ユーザー名（省略時は環境変数FM_USERNAME）',
        },
        password: {
          type: 'string',
          description: 'パスワード（省略時は環境変数FM_PASSWORD）',
        },
      },
      required: [],
    },
  },
  {
    name: 'fm_logout',
    description: '現在のセッションを終了します。',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'fm_validate_session',
    description: 'セッションが有効かどうかを確認します。',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
];

// ============================================================================
// ツールハンドラ
// ============================================================================

/**
 * fm_login ハンドラ
 *
 * FileMaker Data API にログインしてセッションを確立する。
 * 認証情報は引数または環境変数から取得する。
 *
 * @param args - ログイン引数（server, database, username, password）
 * @returns ログイン結果（success: true の場合は sessionInfo を含む）
 */
export async function handleLogin(args: LoginInput): Promise<LoginOutput | ErrorResponse> {
  const sessionManager = getSessionManager();

  // 設定を構築（引数優先、なければ環境変数）
  const config = getConfig({
    server: args.server,
    database: args.database,
    username: args.username,
    password: args.password,
  });

  // 設定バリデーション
  if (!isValidConfig(config)) {
    return {
      success: false,
      error: {
        code: ErrorCodes.INTERNAL_CONFIG_ERROR,
        message: 'Invalid configuration',
        details: config.errors.join(', '),
        retryable: false,
      },
    };
  }

  logger.debug('Login config', formatConfigForLog(config));

  // ログイン実行
  const result = await sessionManager.login(config);

  if (!result.success) {
    return result as ErrorResponse;
  }

  return {
    success: true,
    message: 'Login successful',
    sessionInfo: result.sessionInfo,
  };
}

/**
 * fm_logout ハンドラ
 *
 * 現在のセッションを終了し、トークンを無効化する。
 *
 * @returns ログアウト結果
 */
export async function handleLogout(): Promise<LogoutOutput | ErrorResponse> {
  const sessionManager = getSessionManager();
  const result = await sessionManager.logout();

  if (!result.success) {
    return result as ErrorResponse;
  }

  return {
    success: true,
    message: result.message,
  };
}

/**
 * fm_validate_session ハンドラ
 *
 * セッションが有効かどうかを確認する。
 * 実際のAPI呼び出しは行わず、内部状態を確認する。
 *
 * @returns セッション有効性情報
 */
export async function handleValidateSession(): Promise<ValidateSessionOutput> {
  const sessionManager = getSessionManager();
  return sessionManager.validateSession();
}
