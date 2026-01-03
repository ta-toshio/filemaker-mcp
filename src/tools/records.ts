/**
 * レコード操作関連ツールハンドラ
 *
 * FileMaker Data API のレコード取得機能を提供するツール群
 * - fm_get_records: レコード一覧取得（ページング対応）
 * - fm_get_record_by_id: 単一レコード取得
 * - fm_find_records: 検索条件によるレコード検索
 *
 * 設計書 3.2.4 セクション準拠
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { isErrorResponse } from '../api/client.js';
import { createErrorResponse } from '../api/error-mapper.js';
import { getSessionManager } from '../api/session.js';
import type { FMRecordResponse } from '../types/filemaker.js';
import type {
  ErrorResponse,
  FindRecordsInput,
  FindRecordsOutput,
  GetRecordByIdInput,
  GetRecordByIdOutput,
  GetRecordCountInput,
  GetRecordCountOutput,
  GetRecordsInput,
  GetRecordsOutput,
} from '../types/tools.js';

// ============================================================================
// ツール定義
// ============================================================================

/**
 * レコード操作関連ツール定義
 */
export const RECORDS_TOOLS: Tool[] = [
  {
    name: 'fm_get_records',
    description: '指定されたレイアウトからレコードを取得します（ページング対応）。',
    inputSchema: {
      type: 'object',
      properties: {
        layout: {
          type: 'string',
          description: 'レイアウト名',
        },
        offset: {
          type: 'number',
          description: '開始レコード位置（デフォルト: 1）',
        },
        limit: {
          type: 'number',
          description: '取得レコード数（デフォルト: 20）',
        },
      },
      required: ['layout'],
    },
  },
  {
    name: 'fm_get_record_by_id',
    description: '指定されたレコードIDのレコードを取得します。',
    inputSchema: {
      type: 'object',
      properties: {
        layout: {
          type: 'string',
          description: 'レイアウト名',
        },
        recordId: {
          type: ['string', 'number'],
          description: 'FileMakerレコードID',
        },
      },
      required: ['layout', 'recordId'],
    },
  },
  {
    name: 'fm_find_records',
    description: '検索条件に一致するレコードを検索します。',
    inputSchema: {
      type: 'object',
      properties: {
        layout: {
          type: 'string',
          description: 'レイアウト名',
        },
        query: {
          type: 'array',
          description: '検索クエリ配列（例: [{"FirstName": "John"}, {"LastName": "Doe"}]）',
          items: {
            type: 'object',
          },
        },
        sort: {
          type: 'array',
          description: 'ソート順序（例: [{"fieldName": "LastName", "sortOrder": "ascend"}]）',
          items: {
            type: 'object',
            properties: {
              fieldName: { type: 'string' },
              sortOrder: { type: 'string', enum: ['ascend', 'descend'] },
            },
            required: ['fieldName', 'sortOrder'],
          },
        },
        offset: {
          type: 'number',
          description: '開始レコード位置',
        },
        limit: {
          type: 'number',
          description: '取得レコード数',
        },
      },
      required: ['layout', 'query'],
    },
  },
  {
    name: 'fm_get_record_count',
    description:
      '指定されたレイアウトの総レコード数を取得します。レコードデータは取得せず、カウントのみを効率的に返します。',
    inputSchema: {
      type: 'object',
      properties: {
        layout: {
          type: 'string',
          description: 'レイアウト名',
        },
      },
      required: ['layout'],
    },
  },
];

// ============================================================================
// ツールハンドラ
// ============================================================================

/**
 * fm_get_records ハンドラ
 *
 * 指定されたレイアウトからレコードを取得する。
 * ページング対応（offset, limit）。
 *
 * @param args - レイアウト名、offset、limit を含む引数
 * @returns レコード一覧と dataInfo（totalRecordCount, foundCount, returnedCount）
 */
export async function handleGetRecords(
  args: GetRecordsInput
): Promise<GetRecordsOutput | ErrorResponse> {
  const sessionManager = getSessionManager();

  // デフォルト値を設定
  const offset = args.offset ?? 1;
  const limit = args.limit ?? 20;

  const result = await sessionManager.withSession(async (client, token) => {
    return client.get<FMRecordResponse>(
      `/layouts/${encodeURIComponent(args.layout)}/records?_offset=${offset}&_limit=${limit}`,
      token
    );
  });

  // エラーレスポンスの場合はそのまま返す
  if (isErrorResponse(result)) {
    return result;
  }

  // 型ガードでAPIレスポンスを確認
  if ('data' in result) {
    return {
      success: true,
      layout: args.layout,
      records: result.data.data,
      dataInfo: {
        totalRecordCount: result.data.dataInfo.totalRecordCount,
        foundCount: result.data.dataInfo.foundCount,
        returnedCount: result.data.dataInfo.returnedCount,
      },
    };
  }

  return createErrorResponse(500, undefined, 'Unexpected response format');
}

/**
 * fm_get_record_by_id ハンドラ
 *
 * 指定されたレコードIDのレコードを取得する。
 *
 * @param args - レイアウト名とレコードID を含む引数
 * @returns 単一レコード
 */
export async function handleGetRecordById(
  args: GetRecordByIdInput
): Promise<GetRecordByIdOutput | ErrorResponse> {
  const sessionManager = getSessionManager();

  const result = await sessionManager.withSession(async (client, token) => {
    return client.get<FMRecordResponse>(
      `/layouts/${encodeURIComponent(args.layout)}/records/${args.recordId}`,
      token
    );
  });

  // エラーレスポンスの場合はそのまま返す
  if (isErrorResponse(result)) {
    return result;
  }

  // 型ガードでAPIレスポンスを確認
  if ('data' in result) {
    const record = result.data.data[0];
    if (!record) {
      return createErrorResponse(404, 101, 'Record not found');
    }
    return {
      success: true,
      layout: args.layout,
      record,
    };
  }

  return createErrorResponse(500, undefined, 'Unexpected response format');
}

/**
 * fm_find_records ハンドラ
 *
 * 検索条件に一致するレコードを検索する。
 * クエリはOR検索（配列内の各オブジェクトがOR条件）。
 *
 * @param args - レイアウト名、検索クエリ、ソート、offset、limit を含む引数
 * @returns 検索結果レコード一覧と dataInfo
 */
export async function handleFindRecords(
  args: FindRecordsInput
): Promise<FindRecordsOutput | ErrorResponse> {
  const sessionManager = getSessionManager();

  // リクエストボディを構築
  const body: Record<string, unknown> = {
    query: args.query,
  };

  // オプションパラメータを追加
  if (args.sort) {
    body.sort = args.sort;
  }
  if (args.offset !== undefined) {
    body.offset = args.offset;
  }
  if (args.limit !== undefined) {
    body.limit = args.limit;
  }

  const result = await sessionManager.withSession(async (client, token) => {
    return client.post<FMRecordResponse>(
      `/layouts/${encodeURIComponent(args.layout)}/_find`,
      token,
      body
    );
  });

  // エラーレスポンスの場合はそのまま返す
  if (isErrorResponse(result)) {
    return result;
  }

  // 型ガードでAPIレスポンスを確認
  if ('data' in result) {
    return {
      success: true,
      layout: args.layout,
      records: result.data.data,
      dataInfo: {
        totalRecordCount: result.data.dataInfo.totalRecordCount,
        foundCount: result.data.dataInfo.foundCount,
        returnedCount: result.data.dataInfo.returnedCount,
      },
    };
  }

  return createErrorResponse(500, undefined, 'Unexpected response format');
}

/**
 * fm_get_record_count ハンドラ
 *
 * 指定されたレイアウトの総レコード数を効率的に取得する。
 * 設計書 3.2.8 準拠: GET /layouts/{layout}/records?_limit=1 を使用し、
 * dataInfo.totalRecordCount から総レコード数を取得。
 *
 * 実装ポイント:
 * - _limit=1 で最小限のデータ転送
 * - レコードデータ自体は返さず、カウント情報のみ返却
 *
 * @param args - レイアウト名を含む引数
 * @returns 総レコード数と検出レコード数
 */
export async function handleGetRecordCount(
  args: GetRecordCountInput
): Promise<GetRecordCountOutput | ErrorResponse> {
  const sessionManager = getSessionManager();

  // _limit=1 で最小限のデータ転送（設計書 3.2.8 準拠）
  const result = await sessionManager.withSession(async (client, token) => {
    return client.get<FMRecordResponse>(
      `/layouts/${encodeURIComponent(args.layout)}/records?_limit=1`,
      token
    );
  });

  // エラーレスポンスの場合はそのまま返す
  if (isErrorResponse(result)) {
    return result;
  }

  // 型ガードでAPIレスポンスを確認
  if ('data' in result) {
    return {
      success: true,
      layout: args.layout,
      totalRecordCount: result.data.dataInfo.totalRecordCount,
      foundCount: result.data.dataInfo.foundCount,
    };
  }

  return createErrorResponse(500, undefined, 'Unexpected response format');
}
