/**
 * メタデータ関連ツールハンドラ
 *
 * FileMaker Data API のメタデータ取得機能を提供するツール群
 * - fm_get_layouts: レイアウト一覧取得
 * - fm_get_layout_metadata: レイアウトのフィールド/ポータル情報取得
 * - fm_get_scripts: スクリプト一覧取得
 *
 * 設計書 3.2.2 セクション準拠
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { isErrorResponse } from '../api/client.js';
import { createErrorResponse } from '../api/error-mapper.js';
import { getSessionManager } from '../api/session.js';
import type {
  FMLayoutMetadataResponse,
  FMLayoutsResponse,
  FMScriptsResponse,
} from '../types/filemaker.js';
import type {
  ErrorResponse,
  GetLayoutMetadataInput,
  GetLayoutMetadataOutput,
  GetLayoutsOutput,
  GetScriptsOutput,
  ListValueListsInput,
  ListValueListsOutput,
} from '../types/tools.js';

// ============================================================================
// ツール定義
// ============================================================================

/**
 * メタデータ関連ツール定義
 */
export const METADATA_TOOLS: Tool[] = [
  {
    name: 'fm_get_layouts',
    description: 'データベース内のすべてのレイアウト一覧を取得します。',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'fm_get_layout_metadata',
    description: '指定されたレイアウトのフィールド定義、ポータル情報、値一覧を取得します。',
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
  {
    name: 'fm_get_scripts',
    description: 'データベース内のすべてのスクリプト一覧を取得します。',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'fm_list_value_lists',
    description:
      '指定されたレイアウトで利用可能な値一覧（Value Lists）を取得します。フィールドに設定されたドロップダウン選択肢などを確認できます。',
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
 * fm_get_layouts ハンドラ
 *
 * データベース内のすべてのレイアウト一覧を取得する。
 * レイアウト名とフォルダかどうかの情報を返す。
 *
 * @returns レイアウト一覧（name, isFolder を含む配列）
 */
export async function handleGetLayouts(): Promise<GetLayoutsOutput | ErrorResponse> {
  const sessionManager = getSessionManager();

  const result = await sessionManager.withSession(async (client, token) => {
    return client.get<FMLayoutsResponse>('/layouts', token);
  });

  // エラーレスポンスの場合はそのまま返す
  if (isErrorResponse(result)) {
    return result;
  }

  // 型ガードでAPIレスポンスを確認
  if ('data' in result) {
    return {
      success: true,
      layouts: result.data.layouts.map((layout: { name: string; isFolder?: boolean }) => ({
        name: layout.name,
        isFolder: layout.isFolder,
      })),
    };
  }

  return createErrorResponse(500, undefined, 'Unexpected response format');
}

/**
 * fm_get_layout_metadata ハンドラ
 *
 * 指定されたレイアウトのフィールド定義、ポータル情報、値一覧を取得する。
 *
 * @param args - レイアウト名を含む引数
 * @returns レイアウトメタデータ（fieldMetaData, portalMetaData, valueLists）
 */
export async function handleGetLayoutMetadata(
  args: GetLayoutMetadataInput
): Promise<GetLayoutMetadataOutput | ErrorResponse> {
  const sessionManager = getSessionManager();

  const result = await sessionManager.withSession(async (client, token) => {
    return client.get<FMLayoutMetadataResponse>(
      `/layouts/${encodeURIComponent(args.layout)}`,
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
      fieldMetaData: result.data.fieldMetaData,
      portalMetaData: result.data.portalMetaData,
      valueLists: result.data.valueLists,
    };
  }

  return createErrorResponse(500, undefined, 'Unexpected response format');
}

/**
 * fm_get_scripts ハンドラ
 *
 * データベース内のすべてのスクリプト一覧を取得する。
 * スクリプト名とフォルダかどうかの情報を返す。
 *
 * @returns スクリプト一覧（name, isFolder を含む配列）
 */
export async function handleGetScripts(): Promise<GetScriptsOutput | ErrorResponse> {
  const sessionManager = getSessionManager();

  const result = await sessionManager.withSession(async (client, token) => {
    return client.get<FMScriptsResponse>('/scripts', token);
  });

  // エラーレスポンスの場合はそのまま返す
  if (isErrorResponse(result)) {
    return result;
  }

  // 型ガードでAPIレスポンスを確認
  if ('data' in result) {
    return {
      success: true,
      scripts: result.data.scripts.map((script: { name: string; isFolder?: boolean }) => ({
        name: script.name,
        isFolder: script.isFolder,
      })),
    };
  }

  return createErrorResponse(500, undefined, 'Unexpected response format');
}

/**
 * fm_list_value_lists ハンドラ
 *
 * 指定されたレイアウトで利用可能な値一覧（Value Lists）を取得する。
 * レイアウトメタデータ API を使用して valueLists 部分のみを抽出して返す。
 *
 * 用途:
 * - フィールドに設定されたドロップダウン選択肢の確認
 * - 入力補完やバリデーションのための選択肢取得
 *
 * @param args - レイアウト名を含む引数
 * @returns 値一覧のマップ（値一覧名 → 値の配列）
 */
export async function handleListValueLists(
  args: ListValueListsInput
): Promise<ListValueListsOutput | ErrorResponse> {
  const sessionManager = getSessionManager();

  // レイアウトメタデータAPIを使用して値一覧を取得
  const result = await sessionManager.withSession(async (client, token) => {
    return client.get<FMLayoutMetadataResponse>(
      `/layouts/${encodeURIComponent(args.layout)}`,
      token
    );
  });

  // エラーレスポンスの場合はそのまま返す
  if (isErrorResponse(result)) {
    return result;
  }

  // 型ガードでAPIレスポンスを確認
  if ('data' in result) {
    // valueLists はすでに Record<string, string[]> 形式
    // そのまま返却する（データがない場合は空オブジェクト）
    const valueLists = result.data.valueLists ?? {};

    return {
      success: true,
      layout: args.layout,
      valueLists,
    };
  }

  return createErrorResponse(500, undefined, 'Unexpected response format');
}
