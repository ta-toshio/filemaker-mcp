/**
 * 分析系ツールハンドラ
 *
 * FileMaker Data API の高度な分析機能を提供するツール群
 * 設計書 Phase 2 (3.2.3〜3.2.6 セクション) 準拠
 *
 * 提供ツール:
 * - fm_export_database_metadata: データベースメタデータエクスポート
 * - fm_infer_relationships: リレーションシップ推測
 * - fm_analyze_portal_data: ポータルデータ分析
 * - fm_global_search_data: グローバルデータ検索
 *
 * 重要な注意事項:
 * このフェーズのツールは FileMaker Data API の制約により、
 * 一部機能が「推測」ベースとなっている。
 * 結果には必ず limitations / disclaimer フィールドが含まれる。
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { globalSearchData } from '../analyzers/global-searcher.js';
import { exportDatabaseMetadata } from '../analyzers/metadata-aggregator.js';
import { analyzePortalData } from '../analyzers/portal-analyzer.js';
import { inferRelationships } from '../analyzers/relationship-inferrer.js';
import { isErrorResponse } from '../api/client.js';
import { createErrorResponse } from '../api/error-mapper.js';
import { getSessionManager } from '../api/session.js';
import type { FMLayoutMetadataResponse, FMLayoutsResponse } from '../types/filemaker.js';
import type {
  AnalyzePortalDataInput,
  AnalyzePortalDataOutput,
  ErrorResponse,
  ExportDatabaseMetadataInput,
  ExportDatabaseMetadataOutput,
  FieldSearchResult,
  GlobalSearchDataInput,
  GlobalSearchDataOutput,
  GlobalSearchFieldsInput,
  GlobalSearchFieldsOutput,
  InferRelationshipsInput,
  InferRelationshipsOutput,
} from '../types/tools.js';

// ============================================================================
// ツール定義
// ============================================================================

/**
 * 分析系ツール定義
 *
 * 設計書 3.2.3〜3.2.6 準拠の inputSchema を定義
 */
export const ANALYSIS_TOOLS: Tool[] = [
  {
    name: 'fm_export_database_metadata',
    description:
      'データベースの構造情報（レイアウト、フィールド、スクリプト、値一覧）を集約してエクスポートします。' +
      '注意: FileMaker Data APIの制約により、真のDDR（Database Design Report）ではありません。' +
      'リレーションシップ定義、計算式、スクリプト内容は取得できません。',
    inputSchema: {
      type: 'object',
      properties: {
        format: {
          type: 'string',
          enum: ['json', 'xml', 'html'],
          description: '出力フォーマット（json推奨）',
        },
        options: {
          type: 'object',
          description: 'エクスポートオプション',
          properties: {
            includeLayouts: {
              type: 'boolean',
              description: 'レイアウト情報を含める（デフォルト: true）',
            },
            includeScripts: {
              type: 'boolean',
              description: 'スクリプト一覧を含める（デフォルト: true）',
            },
            includeValueLists: {
              type: 'boolean',
              description: '値一覧を含める（デフォルト: true）',
            },
            includePortalAnalysis: {
              type: 'boolean',
              description: 'ポータル分析・リレーション推測を含める（デフォルト: true）',
            },
          },
        },
      },
      required: ['format'],
    },
  },
  {
    name: 'fm_infer_relationships',
    description:
      '指定されたレイアウトのポータルとフィールド名パターンからリレーションシップを推測します。' +
      '重要: すべての結果は「推測」であり、実際のFileMakerリレーションシップ定義とは異なる可能性があります。' +
      '信頼度（confidence）を必ず確認してください。',
    inputSchema: {
      type: 'object',
      properties: {
        layout: {
          type: 'string',
          description: '分析対象のレイアウト名',
        },
        depth: {
          type: 'number',
          description: '分析の深度（将来拡張用、現在は1固定）',
        },
      },
      required: ['layout'],
    },
  },
  {
    name: 'fm_analyze_portal_data',
    description:
      '指定されたレイアウト内のポータル構造を詳細に分析します。' +
      '各ポータルのフィールド定義、推測される関連テーブル名、サンプルデータ（オプション）を取得できます。' +
      'この機能はData APIで完全にサポートされています。',
    inputSchema: {
      type: 'object',
      properties: {
        layout: {
          type: 'string',
          description: '分析対象のレイアウト名',
        },
        includeSampleData: {
          type: 'boolean',
          description: 'サンプルデータを含める（デフォルト: false）',
        },
        sampleLimit: {
          type: 'number',
          description: 'サンプルデータの最大レコード数（デフォルト: 5、最大: 100）',
        },
      },
      required: ['layout'],
    },
  },
  {
    name: 'fm_global_search_data',
    description:
      '複数のレイアウトを横断してデータを検索します。' +
      '各レイアウトのテキストフィールドに対してOR検索を実行し、結果を集約します。' +
      '注意: 大量のレイアウトを指定するとパフォーマンスに影響します。',
    inputSchema: {
      type: 'object',
      properties: {
        searchText: {
          type: 'string',
          description: '検索するテキスト',
        },
        layouts: {
          type: 'array',
          items: { type: 'string' },
          description: '検索対象のレイアウト名配列',
        },
        options: {
          type: 'object',
          description: '検索オプション',
          properties: {
            maxFieldsPerLayout: {
              type: 'number',
              description: 'レイアウトあたりの最大検索フィールド数（デフォルト: 50）',
            },
            maxRecordsPerLayout: {
              type: 'number',
              description: 'レイアウトあたりの最大結果レコード数（デフォルト: 100、最大: 1000）',
            },
            includeCalculations: {
              type: 'boolean',
              description: '計算フィールドも検索対象に含める（デフォルト: false）',
            },
            searchMode: {
              type: 'string',
              enum: ['contains', 'exact', 'startsWith'],
              description: '検索モード（デフォルト: contains）',
            },
          },
        },
      },
      required: ['searchText', 'layouts'],
    },
  },
  {
    name: 'fm_global_search_fields',
    description:
      '全レイアウトを横断してフィールドを検索します。' +
      'フィールド名のパターンやフィールドタイプでフィルタリングできます。' +
      'データベース構造の調査やフィールド命名規則の確認に便利です。',
    inputSchema: {
      type: 'object',
      properties: {
        fieldName: {
          type: 'string',
          description: 'フィールド名のパターン（部分一致検索）。省略時は全フィールドを対象',
        },
        fieldType: {
          type: 'string',
          enum: ['text', 'number', 'date', 'time', 'timestamp', 'container'],
          description: 'フィールドタイプでフィルタ。省略時は全タイプを対象',
        },
        options: {
          type: 'object',
          description: '検索オプション',
          properties: {
            maxLayouts: {
              type: 'number',
              description: '検索対象の最大レイアウト数（デフォルト: 50）',
            },
            maxResults: {
              type: 'number',
              description: '返却する最大結果数（デフォルト: 500）',
            },
          },
        },
      },
      required: [],
    },
  },
];

// ============================================================================
// ツールハンドラ
// ============================================================================

/**
 * fm_export_database_metadata ハンドラ
 *
 * データベースのメタデータを集約してエクスポートする。
 *
 * @param args - format と options を含む引数
 * @returns データベースメタデータまたはエラーレスポンス
 */
export async function handleExportDatabaseMetadata(
  args: ExportDatabaseMetadataInput
): Promise<ExportDatabaseMetadataOutput | ErrorResponse> {
  return exportDatabaseMetadata(args);
}

/**
 * fm_infer_relationships ハンドラ
 *
 * レイアウトのリレーションシップを推測する。
 *
 * @param args - layout と depth（オプション）を含む引数
 * @returns 推測されたリレーションシップまたはエラーレスポンス
 */
export async function handleInferRelationships(
  args: InferRelationshipsInput
): Promise<InferRelationshipsOutput | ErrorResponse> {
  return inferRelationships(args);
}

/**
 * fm_analyze_portal_data ハンドラ
 *
 * レイアウト内のポータルを分析する。
 *
 * @param args - layout と includeSampleData/sampleLimit（オプション）を含む引数
 * @returns ポータル分析結果またはエラーレスポンス
 */
export async function handleAnalyzePortalData(
  args: AnalyzePortalDataInput
): Promise<AnalyzePortalDataOutput | ErrorResponse> {
  return analyzePortalData(args);
}

/**
 * fm_global_search_data ハンドラ
 *
 * 複数レイアウトを横断してデータを検索する。
 *
 * @param args - searchText, layouts, options を含む引数
 * @returns グローバル検索結果またはエラーレスポンス
 */
export async function handleGlobalSearchData(
  args: GlobalSearchDataInput
): Promise<GlobalSearchDataOutput | ErrorResponse> {
  return globalSearchData(args);
}

/**
 * fm_global_search_fields ハンドラ
 *
 * 全レイアウトを横断してフィールドを検索する。
 * 設計書 3.2.7 準拠:
 * - フィールド名パターンによる部分一致検索
 * - フィールドタイプによるフィルタリング
 * - レイアウト数と結果数の制限オプション
 *
 * 実装ポイント:
 * - GET /layouts で全レイアウト取得
 * - 各レイアウトのメタデータからフィールド情報を収集
 * - 検索条件に基づいてフィルタリング
 *
 * @param args - fieldName, fieldType, options を含む引数
 * @returns 検索にマッチしたフィールド一覧と要約情報
 */
export async function handleGlobalSearchFields(
  args: GlobalSearchFieldsInput
): Promise<GlobalSearchFieldsOutput | ErrorResponse> {
  const sessionManager = getSessionManager();

  // デフォルト値を設定
  const maxLayouts = args.options?.maxLayouts ?? 50;
  const maxResults = args.options?.maxResults ?? 500;

  // 1. 全レイアウト一覧を取得
  const layoutsResult = await sessionManager.withSession(async (client, token) => {
    return client.get<FMLayoutsResponse>('/layouts', token);
  });

  if (isErrorResponse(layoutsResult)) {
    return layoutsResult;
  }

  if (!('data' in layoutsResult)) {
    return createErrorResponse(500, undefined, 'Unexpected response format when fetching layouts');
  }

  // フォルダを除外し、maxLayouts に制限
  const layouts = layoutsResult.data.layouts
    .filter((l: { name: string; isFolder?: boolean }) => !l.isFolder)
    .slice(0, maxLayouts);

  // 2. 各レイアウトからフィールド情報を収集
  const results: FieldSearchResult[] = [];
  let totalLayoutsSearched = 0;

  for (const layout of layouts) {
    // maxResults に達したら終了
    if (results.length >= maxResults) {
      break;
    }

    const metadataResult = await sessionManager.withSession(async (client, token) => {
      return client.get<FMLayoutMetadataResponse>(
        `/layouts/${encodeURIComponent(layout.name)}`,
        token
      );
    });

    // 個別レイアウトのエラーはスキップ（ログはしない、続行）
    if (isErrorResponse(metadataResult) || !('data' in metadataResult)) {
      continue;
    }

    totalLayoutsSearched++;

    const fieldMetaData = metadataResult.data.fieldMetaData || [];

    for (const field of fieldMetaData) {
      // maxResults チェック
      if (results.length >= maxResults) {
        break;
      }

      // フィールド名パターンでフィルタ（部分一致、大文字小文字を区別しない）
      if (args.fieldName) {
        const pattern = args.fieldName.toLowerCase();
        if (!field.name.toLowerCase().includes(pattern)) {
          continue;
        }
      }

      // フィールドタイプでフィルタ
      if (args.fieldType) {
        if (field.result !== args.fieldType) {
          continue;
        }
      }

      results.push({
        layout: layout.name,
        field: field.name,
        result: field.result || 'unknown',
        displayType: field.displayType || 'unknown',
        type: field.type || 'normal',
      });
    }
  }

  // 3. 結果を返却
  return {
    success: true,
    results,
    summary: {
      totalLayoutsSearched,
      totalFieldsFound: results.length,
      searchCriteria: {
        fieldName: args.fieldName,
        fieldType: args.fieldType,
      },
    },
    limitations: [
      `最大${maxLayouts}レイアウトを検索対象としました`,
      `最大${maxResults}件の結果を返却します`,
      'フォルダタイプのレイアウトは検索対象外です',
      'フィールド名の検索は部分一致（大文字小文字を区別しない）です',
    ],
  };
}
