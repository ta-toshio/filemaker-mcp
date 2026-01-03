/**
 * MCP サーバー
 *
 * FileMaker Data API MCP サーバーの実装
 * 設計書 3.1 セクション準拠
 *
 * このファイルは MCP サーバーの初期化とリクエストハンドリングを担当する。
 * 個々のツール実装は src/tools/ ディレクトリに分割されている。
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';

import { ErrorCodes } from './api/error-mapper.js';
import { createTimedLogger, logError, loggers, rootLogger } from './utils/logger.js';

// ツール定義とハンドラをインポート
import {
  // Phase 2: 高度な分析機能
  ANALYSIS_TOOLS,
  // Phase 1: 認証・基本機能
  AUTH_TOOLS,
  type AnalyzePortalDataInput,
  type ErrorResponse,
  type ExportDatabaseMetadataInput,
  type FindRecordsInput,
  type GetLayoutMetadataInput,
  type GetRecordByIdInput,
  type GetRecordCountInput,
  type GetRecordsInput,
  type GlobalSearchDataInput,
  type GlobalSearchFieldsInput,
  type InferRelationshipsInput,
  type ListValueListsInput,
  // 型定義
  type LoginInput,
  METADATA_TOOLS,
  RECORDS_TOOLS,
  handleAnalyzePortalData,
  handleExportDatabaseMetadata,
  handleFindRecords,
  handleGetLayoutMetadata,
  handleGetLayouts,
  handleGetRecordById,
  handleGetRecordCount,
  handleGetRecords,
  handleGetScripts,
  handleGlobalSearchData,
  handleGlobalSearchFields,
  handleInferRelationships,
  handleListValueLists,
  handleLogin,
  handleLogout,
  handleValidateSession,
} from './tools/index.js';

const logger = loggers.tools;

// ============================================================================
// ツール定義（各モジュールから集約）
// ============================================================================

/**
 * 全ツール定義（各カテゴリから結合）
 *
 * Phase 1: 認証・基本機能（9ツール）
 * Phase 2: 高度な分析機能（4ツール）
 * Phase 3: 補助ツール（3ツール）
 *   - fm_get_record_count（RECORDS_TOOLS）
 *   - fm_list_value_lists（METADATA_TOOLS）
 *   - fm_global_search_fields（ANALYSIS_TOOLS）
 * 合計: 16ツール
 */
const TOOLS: Tool[] = [...AUTH_TOOLS, ...METADATA_TOOLS, ...RECORDS_TOOLS, ...ANALYSIS_TOOLS];

// ============================================================================
// レスポンスフォーマット
// ============================================================================

/**
 * ツールの結果をMCPレスポンス形式に変換
 *
 * @param result - ツール実行結果
 * @param isError - エラーかどうか
 * @returns MCP レスポンス形式のオブジェクト
 */
function formatToolResult(
  result: unknown,
  isError = false
): {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
} {
  const text = JSON.stringify(result, null, 2);
  const response: {
    content: Array<{ type: 'text'; text: string }>;
    isError?: boolean;
  } = {
    content: [{ type: 'text', text }],
  };

  if (isError) {
    response.isError = true;
  }

  return response;
}

/**
 * エラーレスポンスをMCPレスポンス形式に変換
 *
 * @param error - エラーレスポンス
 * @returns MCP レスポンス形式のエラーオブジェクト
 */
function formatErrorResult(error: ErrorResponse): {
  content: Array<{ type: 'text'; text: string }>;
  isError: boolean;
} {
  return formatToolResult(error, true) as {
    content: Array<{ type: 'text'; text: string }>;
    isError: boolean;
  };
}

// ============================================================================
// サーバー作成
// ============================================================================

/**
 * MCPサーバーを作成
 *
 * サーバーインスタンスを生成し、ツール一覧とツール実行のハンドラを登録する。
 *
 * @returns 設定済みの MCP Server インスタンス
 */
export function createServer(): Server {
  const server = new Server(
    {
      name: 'jaou-ensatsu-kokuryu-filemaker-mcp',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // ツール一覧ハンドラー
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    logger.debug('ListTools requested');
    return { tools: TOOLS };
  });

  // ツール実行ハンドラー
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const logComplete = createTimedLogger(logger, `Tool: ${name}`);

    logger.info(`Tool called: ${name}`);
    logger.trace('Tool arguments', args);

    try {
      let result: unknown;

      // ツール名に応じて適切なハンドラを呼び出し
      switch (name) {
        // 認証ツール
        case 'fm_login':
          result = await handleLogin((args ?? {}) as LoginInput);
          break;

        case 'fm_logout':
          result = await handleLogout();
          break;

        case 'fm_validate_session':
          result = await handleValidateSession();
          break;

        // メタデータツール
        case 'fm_get_layouts':
          result = await handleGetLayouts();
          break;

        case 'fm_get_layout_metadata':
          result = await handleGetLayoutMetadata(args as unknown as GetLayoutMetadataInput);
          break;

        case 'fm_get_scripts':
          result = await handleGetScripts();
          break;

        // レコード操作ツール
        case 'fm_get_records':
          result = await handleGetRecords(args as unknown as GetRecordsInput);
          break;

        case 'fm_get_record_by_id':
          result = await handleGetRecordById(args as unknown as GetRecordByIdInput);
          break;

        case 'fm_find_records':
          result = await handleFindRecords(args as unknown as FindRecordsInput);
          break;

        // 分析ツール（Phase 2）
        case 'fm_export_database_metadata':
          result = await handleExportDatabaseMetadata(
            args as unknown as ExportDatabaseMetadataInput
          );
          break;

        case 'fm_infer_relationships':
          result = await handleInferRelationships(args as unknown as InferRelationshipsInput);
          break;

        case 'fm_analyze_portal_data':
          result = await handleAnalyzePortalData(args as unknown as AnalyzePortalDataInput);
          break;

        case 'fm_global_search_data':
          result = await handleGlobalSearchData(args as unknown as GlobalSearchDataInput);
          break;

        // 補助ツール（Phase 3）
        case 'fm_get_record_count':
          result = await handleGetRecordCount(args as unknown as GetRecordCountInput);
          break;

        case 'fm_list_value_lists':
          result = await handleListValueLists(args as unknown as ListValueListsInput);
          break;

        case 'fm_global_search_fields':
          result = await handleGlobalSearchFields(args as unknown as GlobalSearchFieldsInput);
          break;

        default:
          logger.warn(`Unknown tool: ${name}`);
          logComplete();
          return formatErrorResult({
            success: false,
            error: {
              code: ErrorCodes.INTERNAL_UNKNOWN,
              message: `Unknown tool: ${name}`,
              retryable: false,
            },
          });
      }

      logComplete();

      // エラーレスポンスの場合
      if (result && typeof result === 'object' && 'success' in result) {
        const typedResult = result as { success: boolean };
        if (!typedResult.success) {
          return formatErrorResult(result as ErrorResponse);
        }
      }

      return formatToolResult(result);
    } catch (error) {
      logError(logger, `Tool: ${name}`, error);
      logComplete();

      return formatErrorResult({
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_UNKNOWN,
          message: error instanceof Error ? error.message : 'Unknown error',
          retryable: false,
        },
      });
    }
  });

  return server;
}

/**
 * サーバーを起動
 *
 * MCP サーバーを作成し、stdio トランスポートで接続する。
 */
export async function startServer(): Promise<void> {
  rootLogger.info('Starting Jaou Ensatsu Kokuryu FileMaker MCP Server');

  const server = createServer();
  const transport = new StdioServerTransport();

  await server.connect(transport);

  rootLogger.info('Server started on stdio transport');
  console.error('Jaou Ensatsu Kokuryu FileMaker MCP Server running on stdio');
}
