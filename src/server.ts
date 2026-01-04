/**
 * MCP サーバー
 *
 * FileMaker Data API MCP サーバーの実装
 * 設計書 3.1 セクション準拠
 *
 * このファイルは MCP サーバーの初期化とリクエストハンドリングを担当する。
 * 個々のツール実装は src/tools/ ディレクトリに分割されている。
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { ErrorCodes } from './api/error-mapper.js';
import { createTimedLogger, logError, loggers, rootLogger } from './utils/logger.js';

// ツールハンドラをインポート
import {
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
 * ツールハンドラのラッパー
 * ログ出力とエラーハンドリングを共通化
 *
 * @param name - ツール名
 * @param handler - ツールハンドラ関数
 * @returns ラップされたハンドラ
 */
async function wrapToolHandler<T>(
  name: string,
  handler: () => Promise<T>
): Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }> {
  const logComplete = createTimedLogger(logger, `Tool: ${name}`);
  logger.info(`Tool called: ${name}`);

  try {
    const result = await handler();
    logComplete();

    // エラーレスポンスの場合
    if (result && typeof result === 'object' && 'success' in result) {
      const typedResult = result as { success: boolean };
      if (!typedResult.success) {
        return formatToolResult(result, true);
      }
    }

    return formatToolResult(result);
  } catch (error) {
    logError(logger, `Tool: ${name}`, error);
    logComplete();

    return formatToolResult(
      {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_UNKNOWN,
          message: error instanceof Error ? error.message : 'Unknown error',
          retryable: false,
        },
      },
      true
    );
  }
}

// ============================================================================
// サーバー作成
// ============================================================================

/**
 * MCPサーバーを作成
 *
 * McpServer を使用してサーバーインスタンスを生成し、
 * registerTool API でツールを登録する。
 *
 * Phase 1: 認証・基本機能（9ツール）
 * Phase 2: 高度な分析機能（4ツール）
 * Phase 3: 補助ツール（3ツール）
 * 合計: 16ツール
 *
 * @returns 設定済みの McpServer インスタンス
 */
export function createServer(): McpServer {
  const server = new McpServer({
    name: 'jaou-ensatsu-kokuryu-filemaker-mcp',
    version: '1.0.0',
  });

  // ============================================================================
  // 認証ツール（3ツール）
  // ============================================================================

  server.registerTool(
    'fm_login',
    {
      description:
        'FileMakerサーバーにログインしてセッションを確立します。環境変数から認証情報を読み込む場合はパラメータを省略できます。',
      inputSchema: {
        server: z.string().optional().describe('FileMakerサーバーURL(省略時は環境変数FM_SERVER)'),
        database: z.string().optional().describe('データベース名(省略時は環境変数FM_DATABASE)'),
        username: z.string().optional().describe('ユーザー名(省略時は環境変数FM_USERNAME)'),
        password: z.string().optional().describe('パスワード(省略時は環境変数FM_PASSWORD)'),
      },
    },
    async (args) => wrapToolHandler('fm_login', () => handleLogin(args))
  );

  server.registerTool(
    'fm_logout',
    {
      description: '現在のセッションを終了します。',
      inputSchema: {},
    },
    async () => wrapToolHandler('fm_logout', handleLogout)
  );

  server.registerTool(
    'fm_validate_session',
    {
      description: 'セッションが有効かどうかを確認します。',
      inputSchema: {},
    },
    async () => wrapToolHandler('fm_validate_session', handleValidateSession)
  );

  // ============================================================================
  // メタデータツール（4ツール）
  // ============================================================================

  server.registerTool(
    'fm_get_layouts',
    {
      description: 'データベース内のすべてのレイアウト一覧を取得します。',
      inputSchema: {},
    },
    async () => wrapToolHandler('fm_get_layouts', handleGetLayouts)
  );

  server.registerTool(
    'fm_get_layout_metadata',
    {
      description: '指定されたレイアウトのフィールド定義、ポータル情報、値一覧を取得します。',
      inputSchema: {
        layout: z.string().describe('レイアウト名'),
      },
    },
    async (args) => wrapToolHandler('fm_get_layout_metadata', () => handleGetLayoutMetadata(args))
  );

  server.registerTool(
    'fm_get_scripts',
    {
      description: 'データベース内のすべてのスクリプト一覧を取得します。',
      inputSchema: {},
    },
    async () => wrapToolHandler('fm_get_scripts', handleGetScripts)
  );

  server.registerTool(
    'fm_list_value_lists',
    {
      description:
        '指定されたレイアウトで利用可能な値一覧(Value Lists)を取得します。フィールドに設定されたドロップダウン選択肢などを確認できます。',
      inputSchema: {
        layout: z.string().describe('レイアウト名'),
      },
    },
    async (args) => wrapToolHandler('fm_list_value_lists', () => handleListValueLists(args))
  );

  // ============================================================================
  // レコード操作ツール（4ツール）
  // ============================================================================

  server.registerTool(
    'fm_get_records',
    {
      description: '指定されたレイアウトからレコードを取得します(ページング対応)。',
      inputSchema: {
        layout: z.string().describe('レイアウト名'),
        limit: z.number().optional().describe('取得レコード数(デフォルト: 20)'),
        offset: z.number().optional().describe('開始レコード位置(デフォルト: 1)'),
      },
    },
    async (args) => wrapToolHandler('fm_get_records', () => handleGetRecords(args))
  );

  server.registerTool(
    'fm_get_record_by_id',
    {
      description: '指定されたレコードIDのレコードを取得します。',
      inputSchema: {
        layout: z.string().describe('レイアウト名'),
        recordId: z.union([z.string(), z.number()]).describe('FileMakerレコードID'),
      },
    },
    async (args) => wrapToolHandler('fm_get_record_by_id', () => handleGetRecordById(args))
  );

  server.registerTool(
    'fm_find_records',
    {
      description: '検索条件に一致するレコードを検索します。',
      inputSchema: {
        layout: z.string().describe('レイアウト名'),
        query: z
          .array(z.record(z.string(), z.unknown()))
          .describe('検索クエリ配列(例: [{"FirstName": "John"}, {"LastName": "Doe"}])'),
        sort: z
          .array(
            z.object({
              fieldName: z.string(),
              sortOrder: z.enum(['ascend', 'descend']),
            })
          )
          .optional()
          .describe('ソート順序'),
        limit: z.number().optional().describe('取得レコード数'),
        offset: z.number().optional().describe('開始レコード位置'),
      },
    },
    async (args) =>
      wrapToolHandler('fm_find_records', () =>
        handleFindRecords(args as Parameters<typeof handleFindRecords>[0])
      )
  );

  server.registerTool(
    'fm_get_record_count',
    {
      description:
        '指定されたレイアウトの総レコード数を取得します。レコードデータは取得せず、カウントのみを効率的に返します。',
      inputSchema: {
        layout: z.string().describe('レイアウト名'),
      },
    },
    async (args) => wrapToolHandler('fm_get_record_count', () => handleGetRecordCount(args))
  );

  // ============================================================================
  // 分析ツール（5ツール）
  // ============================================================================

  server.registerTool(
    'fm_export_database_metadata',
    {
      description:
        'データベースの構造情報(レイアウト、フィールド、スクリプト、値一覧)を集約してエクスポートします。注意: FileMaker Data APIの制約により、真のDDR(Database Design Report)ではありません。リレーションシップ定義、計算式、スクリプト内容は取得できません。',
      inputSchema: {
        format: z.enum(['json', 'xml', 'html']).describe('出力フォーマット(json推奨)'),
        options: z
          .object({
            includeLayouts: z
              .boolean()
              .optional()
              .describe('レイアウト情報を含める(デフォルト: true)'),
            includeScripts: z
              .boolean()
              .optional()
              .describe('スクリプト一覧を含める(デフォルト: true)'),
            includeValueLists: z.boolean().optional().describe('値一覧を含める(デフォルト: true)'),
            includePortalAnalysis: z
              .boolean()
              .optional()
              .describe('ポータル分析・リレーション推測を含める(デフォルト: true)'),
          })
          .optional()
          .describe('エクスポートオプション'),
      },
    },
    async (args) =>
      wrapToolHandler('fm_export_database_metadata', () => handleExportDatabaseMetadata(args))
  );

  server.registerTool(
    'fm_infer_relationships',
    {
      description:
        '指定されたレイアウトのポータルとフィールド名パターンからリレーションシップを推測します。重要: すべての結果は「推測」であり、実際のFileMakerリレーションシップ定義とは異なる可能性があります。信頼度(confidence)を必ず確認してください。',
      inputSchema: {
        layout: z.string().describe('分析対象のレイアウト名'),
        depth: z.number().optional().describe('分析の深度(将来拡張用、現在は1固定)'),
      },
    },
    async (args) => wrapToolHandler('fm_infer_relationships', () => handleInferRelationships(args))
  );

  server.registerTool(
    'fm_analyze_portal_data',
    {
      description:
        '指定されたレイアウト内のポータル構造を詳細に分析します。各ポータルのフィールド定義、推測される関連テーブル名、サンプルデータ(オプション)を取得できます。この機能はData APIで完全にサポートされています。',
      inputSchema: {
        layout: z.string().describe('分析対象のレイアウト名'),
        includeSampleData: z
          .boolean()
          .optional()
          .describe('サンプルデータを含める(デフォルト: false)'),
        sampleLimit: z
          .number()
          .optional()
          .describe('サンプルデータの最大レコード数(デフォルト: 5、最大: 100)'),
      },
    },
    async (args) => wrapToolHandler('fm_analyze_portal_data', () => handleAnalyzePortalData(args))
  );

  server.registerTool(
    'fm_global_search_data',
    {
      description:
        '複数のレイアウトを横断してデータを検索します。各レイアウトのテキストフィールドに対してOR検索を実行し、結果を集約します。注意: 大量のレイアウトを指定するとパフォーマンスに影響します。',
      inputSchema: {
        searchText: z.string().describe('検索するテキスト'),
        layouts: z.array(z.string()).describe('検索対象のレイアウト名配列'),
        options: z
          .object({
            maxRecordsPerLayout: z
              .number()
              .optional()
              .describe('レイアウトあたりの最大結果レコード数(デフォルト: 100、最大: 1000)'),
            maxFieldsPerLayout: z
              .number()
              .optional()
              .describe('レイアウトあたりの最大検索フィールド数(デフォルト: 50)'),
            searchMode: z
              .enum(['contains', 'exact', 'startsWith'])
              .optional()
              .describe('検索モード(デフォルト: contains)'),
            includeCalculations: z
              .boolean()
              .optional()
              .describe('計算フィールドも検索対象に含める(デフォルト: false)'),
          })
          .optional()
          .describe('検索オプション'),
      },
    },
    async (args) => wrapToolHandler('fm_global_search_data', () => handleGlobalSearchData(args))
  );

  server.registerTool(
    'fm_global_search_fields',
    {
      description:
        '全レイアウトを横断してフィールドを検索します。フィールド名のパターンやフィールドタイプでフィルタリングできます。データベース構造の調査やフィールド命名規則の確認に便利です。',
      inputSchema: {
        fieldName: z
          .string()
          .optional()
          .describe('フィールド名のパターン(部分一致検索)。省略時は全フィールドを対象'),
        fieldType: z
          .enum(['text', 'number', 'date', 'time', 'timestamp', 'container'])
          .optional()
          .describe('フィールドタイプでフィルタ。省略時は全タイプを対象'),
        options: z
          .object({
            maxLayouts: z
              .number()
              .optional()
              .describe('検索対象の最大レイアウト数(デフォルト: 50)'),
            maxResults: z.number().optional().describe('返却する最大結果数(デフォルト: 500)'),
          })
          .optional()
          .describe('検索オプション'),
      },
    },
    async (args) => wrapToolHandler('fm_global_search_fields', () => handleGlobalSearchFields(args))
  );

  return server;
}

/**
 * サーバーを起動
 *
 * McpServer を作成し、stdio トランスポートで接続する。
 */
export async function startServer(): Promise<void> {
  rootLogger.info('Starting Jaou Ensatsu Kokuryu FileMaker MCP Server');

  const server = createServer();
  const transport = new StdioServerTransport();

  await server.connect(transport);

  rootLogger.info('Server started on stdio transport');
  console.error('Jaou Ensatsu Kokuryu FileMaker MCP Server running on stdio');
}
