/**
 * リレーションシップ推測エンジン
 *
 * fm_infer_relationships ツールのビジネスロジック実装
 * 設計書 3.2.4 セクション準拠
 *
 * 機能概要:
 * - ポータル名からリレーション先テーブルを推測
 * - フィールド命名パターンから外部キーを推測
 * - リレーションシップの種類（1:1, 1:N等）を推測
 *
 * 重要な制限事項:
 * - Data APIではリレーションシップ定義を直接取得できない
 * - すべての結果は「推測」であり、実際の定義と異なる可能性がある
 * - 信頼度（confidence）を必ず確認すること
 */

import { isErrorResponse } from '../api/client.js';
import { createErrorResponse } from '../api/error-mapper.js';
import { getSessionManager } from '../api/session.js';
import type { FMFieldMetaData, FMLayoutMetadataResponse } from '../types/filemaker.js';
import type {
  ConfidenceLevel,
  DetailedInferredRelationship,
  ErrorResponse,
  InferRelationshipsInput,
  InferRelationshipsOutput,
  InferredForeignKey,
} from '../types/tools.js';
import { loggers } from '../utils/logger.js';

const logger = loggers.tools;

// ============================================================================
// 定数定義
// ============================================================================

/**
 * 外部キー推測に使用するフィールド名パターン
 *
 * FileMaker開発者が一般的に使用する外部キー命名規則
 */
const FOREIGN_KEY_PATTERNS = [
  // サフィックスパターン: "TableName_ID", "TableName_id", "tableName_ID"
  { pattern: /^(.+)_[Ii][Dd]$/, extractTable: (match: RegExpMatchArray) => match[1] },
  // サフィックスパターン: "TableNameID", "tableNameId"
  {
    pattern: /^(.+?)([A-Z]?[Ii][Dd])$/,
    extractTable: (match: RegExpMatchArray) => match[1],
  },
  // プレフィックスパターン: "fk_TableName", "FK_TableName"
  { pattern: /^[Ff][Kk]_(.+)$/, extractTable: (match: RegExpMatchArray) => match[1] },
  // プレフィックスパターン: "id_TableName", "ID_TableName"
  { pattern: /^[Ii][Dd]_(.+)$/, extractTable: (match: RegExpMatchArray) => match[1] },
];

/**
 * 推測結果の免責事項
 */
const INFERENCE_DISCLAIMER =
  'この結果はフィールド名とポータル構造からの推測であり、' +
  '実際のFileMakerリレーションシップ定義とは異なる可能性があります。' +
  '正確な定義はFileMaker Proの管理画面で確認してください。';

// ============================================================================
// 内部ヘルパー関数
// ============================================================================

/**
 * フィールド名から外部キーを推測
 *
 * フィールド名のパターンマッチングにより、外部キーである可能性を判定。
 * 複数のパターンを試行し、最初にマッチしたパターンに基づいて
 * 参照先テーブルを推測する。
 *
 * @param field - フィールドメタデータ
 * @returns 外部キー推測結果、または null（推測できない場合）
 */
function inferForeignKeyFromField(field: FMFieldMetaData): InferredForeignKey | null {
  const fieldName = field.name;

  // 数値フィールドまたはテキストフィールドのみを対象（外部キーは通常これらの型）
  if (field.result !== 'number' && field.result !== 'text') {
    return null;
  }

  // 各パターンを試行
  for (const { pattern, extractTable } of FOREIGN_KEY_PATTERNS) {
    const match = fieldName.match(pattern);
    if (match) {
      const inferredTable = extractTable(match);

      // テーブル名が空でないことを確認
      if (inferredTable && inferredTable.length > 0) {
        // 信頼度の判定
        // - "_ID" サフィックスかつ数値型は高信頼度
        // - その他は中信頼度
        const confidence: ConfidenceLevel =
          fieldName.toLowerCase().endsWith('_id') && field.result === 'number' ? 'high' : 'medium';

        return {
          fieldName: fieldName,
          inferredReferencedTable: inferredTable,
          confidence,
          inferenceReason: `フィールド名「${fieldName}」が外部キーパターンに一致`,
        };
      }
    }
  }

  return null;
}

/**
 * ポータル名からリレーション先テーブルを推測
 *
 * @param portalName - ポータル名
 * @returns 推測されたテーブル名
 */
function inferTableFromPortalName(portalName: string): string {
  let tableName = portalName;

  // 一般的なプレフィックス/サフィックスを除去
  const prefixes = ['portal_', 'Portal_', 'PORTAL_', 'rel_', 'Rel_', 'REL_'];
  const suffixes = ['_portal', '_Portal', '_PORTAL', '_rel', '_Rel', '_REL'];

  for (const prefix of prefixes) {
    if (tableName.startsWith(prefix)) {
      tableName = tableName.substring(prefix.length);
      break;
    }
  }

  for (const suffix of suffixes) {
    if (tableName.endsWith(suffix)) {
      tableName = tableName.substring(0, tableName.length - suffix.length);
      break;
    }
  }

  return tableName || portalName;
}

/**
 * ポータルからリレーションシップを推測
 *
 * ポータル情報を分析し、詳細なリレーションシップ推測を生成。
 * ポータルは通常 1:N リレーションシップを表すため、
 * type は 'one-to-many' として推測する。
 *
 * @param sourceLayout - ソースレイアウト名
 * @param portalName - ポータル名
 * @param portalFields - ポータル内のフィールド一覧
 * @returns 推測されたリレーションシップ
 */
function inferRelationshipFromPortal(
  sourceLayout: string,
  portalName: string,
  portalFields: FMFieldMetaData[]
): DetailedInferredRelationship {
  const targetTable = inferTableFromPortalName(portalName);

  // ポータル内に外部キーらしきフィールドがあるか確認
  let sourceField: string | undefined;
  let targetField: string | undefined;

  for (const field of portalFields) {
    const fkInference = inferForeignKeyFromField(field);
    if (fkInference) {
      // 親テーブル（ソース）への参照の可能性
      targetField = fkInference.fieldName;
      break;
    }
  }

  // 信頼度の判定
  // - ポータル名がそのままテーブル名っぽければ高信頼度
  // - 加工が必要な名前は中信頼度
  const confidence: ConfidenceLevel =
    targetTable.toLowerCase() === portalName.toLowerCase() ? 'high' : 'medium';

  return {
    name: `${sourceLayout} -> ${targetTable}`,
    sourceTable: sourceLayout, // レイアウト名をテーブル名の代理として使用
    targetTable: targetTable,
    sourceField: sourceField,
    targetField: targetField,
    type: 'one-to-many', // ポータルは通常 1:N を表現
    confidence,
    inferenceMethod: 'ポータル名パターンマッチング',
  };
}

// ============================================================================
// メイン関数
// ============================================================================

/**
 * レイアウトのリレーションシップを推測
 *
 * 指定されたレイアウトのメタデータを分析し、
 * 以下の情報を推測して返す:
 * 1. ポータルから推測されるリレーションシップ
 * 2. フィールド名から推測される外部キー
 *
 * @param input - 分析対象レイアウト名と深度（オプション）
 * @returns 推測されたリレーションシップ情報
 */
export async function inferRelationships(
  input: InferRelationshipsInput
): Promise<InferRelationshipsOutput | ErrorResponse> {
  const sessionManager = getSessionManager();
  const depth = input.depth ?? 1;

  logger.info('Inferring relationships', { layout: input.layout, depth });

  // ============================================================================
  // 1. レイアウトメタデータの取得
  // ============================================================================

  const metadataResult = await sessionManager.withSession(async (client, token) => {
    return client.get<FMLayoutMetadataResponse>(
      `/layouts/${encodeURIComponent(input.layout)}`,
      token
    );
  });

  if (isErrorResponse(metadataResult)) {
    logger.error('Failed to get layout metadata', {
      layout: input.layout,
      error: metadataResult,
    });
    return metadataResult;
  }

  if (!('data' in metadataResult)) {
    return createErrorResponse(500, undefined, 'Unexpected response format');
  }

  const metadata = metadataResult.data;

  // ============================================================================
  // 2. リレーションシップの推測
  // ============================================================================

  const inferredRelationships: DetailedInferredRelationship[] = [];
  const inferredForeignKeys: InferredForeignKey[] = [];

  // 2.1. ポータルからリレーションシップを推測
  if (metadata.portalMetaData) {
    for (const [portalName, portalFields] of Object.entries(metadata.portalMetaData)) {
      const relationship = inferRelationshipFromPortal(input.layout, portalName, portalFields);
      inferredRelationships.push(relationship);
    }
  }

  // 2.2. フィールドから外部キーを推測
  for (const field of metadata.fieldMetaData) {
    const fkInference = inferForeignKeyFromField(field);
    if (fkInference) {
      inferredForeignKeys.push(fkInference);

      // 外部キーからもリレーションシップを推測（重複を避けるためチェック）
      const existingRelationship = inferredRelationships.find(
        (r) => r.targetTable.toLowerCase() === fkInference.inferredReferencedTable.toLowerCase()
      );

      if (!existingRelationship) {
        inferredRelationships.push({
          name: `${input.layout} -> ${fkInference.inferredReferencedTable}`,
          sourceTable: input.layout,
          targetTable: fkInference.inferredReferencedTable,
          sourceField: fkInference.fieldName,
          targetField: undefined,
          type: 'unknown', // フィールドからだけでは種類を判定できない
          confidence: fkInference.confidence,
          inferenceMethod: 'フィールド名パターンマッチング（外部キー推測）',
        });
      }
    }
  }

  // ============================================================================
  // 3. サマリーの構築
  // ============================================================================

  const confidenceBreakdown = {
    high: 0,
    medium: 0,
    low: 0,
  };

  for (const rel of inferredRelationships) {
    confidenceBreakdown[rel.confidence]++;
  }

  for (const fk of inferredForeignKeys) {
    confidenceBreakdown[fk.confidence]++;
  }

  logger.info('Relationship inference completed', {
    layout: input.layout,
    relationshipsFound: inferredRelationships.length,
    foreignKeysFound: inferredForeignKeys.length,
  });

  return {
    success: true,
    layout: input.layout,
    inferredRelationships,
    inferredForeignKeys,
    summary: {
      totalInferred: inferredRelationships.length + inferredForeignKeys.length,
      confidenceBreakdown,
    },
    disclaimer: INFERENCE_DISCLAIMER,
  };
}
