/**
 * Phase 3 ツール動作確認スクリプト
 *
 * 4つの分析ツールの動作を順次確認する
 *
 * 対象ツール（すべて読み取り専用）:
 * 1. fm_export_database_metadata - メタデータ集約
 * 2. fm_infer_relationships - リレーション推測
 * 3. fm_analyze_portal_data - ポータル分析
 * 4. fm_global_search_data - 横断検索
 *
 * ⚠️ 注意: ミューテーション操作は一切行いません
 */

// dotenvを最初に読み込み、他のimportより前にprocess.envを設定
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = resolve(__dirname, '..', '.env');

// dotenv設定を同期的に読み込み
const dotenvResult = config({ path: envPath });
if (dotenvResult.error) {
  console.error('Failed to load .env file:', dotenvResult.error);
  process.exit(1);
}

// 環境変数の確認（簡易）
console.log('環境変数: FM_SERVER=' + (process.env.FM_SERVER || 'NOT SET'));
console.log('');

// ツールの動的インポート（dotenv読み込み後に実行）
const authModule = await import('../src/tools/auth.ts');
const metadataModule = await import('../src/tools/metadata.ts');

// Phase 3 分析モジュール
const metadataAggregator = await import('../src/analyzers/metadata-aggregator.ts');
const relationshipInferrer = await import('../src/analyzers/relationship-inferrer.ts');
const portalAnalyzer = await import('../src/analyzers/portal-analyzer.ts');
const globalSearcher = await import('../src/analyzers/global-searcher.ts');

const { handleLogin, handleLogout } = authModule;
const { handleGetLayouts, handleGetLayoutMetadata } = metadataModule;
const { exportDatabaseMetadata } = metadataAggregator;
const { inferRelationships } = relationshipInferrer;
const { analyzePortalData } = portalAnalyzer;
const { globalSearchData } = globalSearcher;

// 色付き出力用
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

function log(message: string, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function logResult(name: string, success: boolean, details?: string) {
  const icon = success ? '✅' : '❌';
  const color = success ? colors.green : colors.red;
  log(`${icon} ${name}: ${success ? 'SUCCESS' : 'FAILED'}`, color);
  if (details) {
    log(`   ${details}`, colors.yellow);
  }
}

async function testPhase3Tools() {
  log('\n========================================', colors.cyan);
  log(' Phase 3 分析ツール動作確認', colors.cyan);
  log(' ⚠️ 読み取り専用テスト（ミューテーションなし）', colors.yellow);
  log('========================================\n', colors.cyan);

  const results: { name: string; success: boolean; details?: string }[] = [];
  let testLayout = '';
  let testLayoutWithPortal = '';

  // ------------------------------------------
  // 0. ログイン（前提条件）
  // ------------------------------------------
  log('0. fm_login（前提条件）...', colors.cyan);
  try {
    const loginResult = await handleLogin({});
    if (loginResult.success) {
      log('   ログイン成功', colors.green);
    } else {
      log('   ログイン失敗: ' + (loginResult as any).error?.message, colors.red);
      process.exit(1);
    }
  } catch (e) {
    log('   ログインエラー: ' + String(e), colors.red);
    process.exit(1);
  }

  // ------------------------------------------
  // テスト用レイアウトの取得
  // ------------------------------------------
  log('\nテスト用レイアウトを取得中...', colors.cyan);
  try {
    const layoutsResult = await handleGetLayouts();
    if (layoutsResult.success && 'layouts' in layoutsResult) {
      const layouts = layoutsResult.layouts.filter((l) => !l.isFolder);
      testLayout = layouts[0]?.name || '';
      log(`   使用レイアウト: ${testLayout}`, colors.yellow);

      // ポータルがあるレイアウトを探す
      for (const layout of layouts.slice(0, 10)) {
        const meta = await handleGetLayoutMetadata({ layout: layout.name });
        if (
          meta.success &&
          'portalMetaData' in meta &&
          meta.portalMetaData &&
          Object.keys(meta.portalMetaData).length > 0
        ) {
          testLayoutWithPortal = layout.name;
          log(`   ポータルありレイアウト: ${testLayoutWithPortal}`, colors.yellow);
          break;
        }
      }
    }
  } catch (e) {
    log('   レイアウト取得エラー: ' + String(e), colors.red);
  }

  if (!testLayout) {
    log('\nテスト用レイアウトが見つかりません。テストを中止します。', colors.red);
    await handleLogout();
    process.exit(1);
  }

  // ------------------------------------------
  // 1. fm_export_database_metadata
  // ------------------------------------------
  log('\n1. fm_export_database_metadata テスト...', colors.cyan);
  log('   （読み取り専用: レイアウト・スクリプト情報を集約）', colors.magenta);
  try {
    const metadataResult = await exportDatabaseMetadata({
      format: 'json',
      options: {
        includeLayouts: true,
        includeScripts: true,
        includeValueLists: true,
        maxLayouts: 5, // テスト用に制限
      },
    });

    if (metadataResult.success && 'data' in metadataResult) {
      const data = metadataResult.data;
      results.push({
        name: 'fm_export_database_metadata',
        success: true,
        details: `レイアウト: ${data.layouts?.length || 0}件, スクリプト: ${data.scripts?.length || 0}件`,
      });

      // 制限事項が含まれているか確認
      if ('limitations' in metadataResult && metadataResult.limitations) {
        log(`   制限事項: ${metadataResult.limitations.length}件記載あり`, colors.yellow);
      }
    } else {
      results.push({
        name: 'fm_export_database_metadata',
        success: false,
        details: (metadataResult as any).error?.message,
      });
    }
  } catch (e) {
    results.push({
      name: 'fm_export_database_metadata',
      success: false,
      details: String(e),
    });
  }

  // ------------------------------------------
  // 2. fm_infer_relationships
  // ------------------------------------------
  log('\n2. fm_infer_relationships テスト...', colors.cyan);
  log('   （読み取り専用: フィールド名パターンからリレーション推測）', colors.magenta);
  try {
    const inferResult = await inferRelationships({
      layout: testLayout,
      depth: 1,
    });

    if (inferResult.success && 'inferredRelationships' in inferResult) {
      results.push({
        name: 'fm_infer_relationships',
        success: true,
        details: `推測リレーション: ${inferResult.inferredRelationships?.length || 0}件, 外部キー: ${inferResult.inferredForeignKeys?.length || 0}件`,
      });

      // disclaimer が含まれているか確認
      if ('disclaimer' in inferResult && inferResult.disclaimer) {
        log(`   免責事項: 「${inferResult.disclaimer.substring(0, 50)}...」`, colors.yellow);
      }
    } else {
      results.push({
        name: 'fm_infer_relationships',
        success: false,
        details: (inferResult as any).error?.message,
      });
    }
  } catch (e) {
    results.push({
      name: 'fm_infer_relationships',
      success: false,
      details: String(e),
    });
  }

  // ------------------------------------------
  // 3. fm_analyze_portal_data
  // ------------------------------------------
  log('\n3. fm_analyze_portal_data テスト...', colors.cyan);
  log('   （読み取り専用: ポータル構造とサンプルデータ取得）', colors.magenta);

  const portalTestLayout = testLayoutWithPortal || testLayout;
  try {
    const portalResult = await analyzePortalData({
      layout: portalTestLayout,
      includeSampleData: true,
      sampleLimit: 3,
    });

    if (portalResult.success && 'portals' in portalResult) {
      const portalCount = portalResult.portals?.length || 0;
      results.push({
        name: 'fm_analyze_portal_data',
        success: true,
        details: `ポータル数: ${portalCount}件${portalCount > 0 ? ', 関連テーブル: ' + portalResult.summary?.relatedTables?.join(', ') : ''}`,
      });
    } else {
      results.push({
        name: 'fm_analyze_portal_data',
        success: false,
        details: (portalResult as any).error?.message,
      });
    }
  } catch (e) {
    results.push({
      name: 'fm_analyze_portal_data',
      success: false,
      details: String(e),
    });
  }

  // ------------------------------------------
  // 4. fm_global_search_data
  // ------------------------------------------
  log('\n4. fm_global_search_data テスト...', colors.cyan);
  log('   （読み取り専用: 複数レイアウト横断検索）', colors.magenta);
  try {
    // テスト用の検索文字列（一般的な文字で検索）
    const searchResult = await globalSearchData({
      searchText: 'test',
      layouts: [testLayout],
      options: {
        maxFieldsPerLayout: 5,
        maxRecordsPerLayout: 3,
        searchMode: 'contains',
      },
    });

    if (searchResult.success && 'results' in searchResult) {
      const totalRecords = searchResult.summary?.totalRecordsFound || 0;
      results.push({
        name: 'fm_global_search_data',
        success: true,
        details: `検索結果: ${totalRecords}件, 検索レイアウト: ${searchResult.summary?.searchedLayouts?.length || 0}件`,
      });

      // 制限事項と免責事項の確認
      if ('limitations' in searchResult && searchResult.limitations) {
        log(`   制限事項: ${searchResult.limitations.length}件記載あり`, colors.yellow);
      }
      if ('disclaimer' in searchResult && searchResult.disclaimer) {
        log(`   免責事項あり`, colors.yellow);
      }
    } else {
      results.push({
        name: 'fm_global_search_data',
        success: false,
        details: (searchResult as any).error?.message,
      });
    }
  } catch (e) {
    results.push({
      name: 'fm_global_search_data',
      success: false,
      details: String(e),
    });
  }

  // ------------------------------------------
  // ログアウト
  // ------------------------------------------
  log('\n5. fm_logout（クリーンアップ）...', colors.cyan);
  try {
    await handleLogout();
    log('   ログアウト成功', colors.green);
  } catch (e) {
    log('   ログアウトエラー: ' + String(e), colors.yellow);
  }

  // ------------------------------------------
  // サマリー出力
  // ------------------------------------------
  log('\n========================================', colors.cyan);
  log(' Phase 3 テスト結果サマリー', colors.cyan);
  log('========================================\n', colors.cyan);

  for (const r of results) {
    logResult(r.name, r.success, r.details);
  }

  const passed = results.filter((r) => r.success).length;
  const total = results.length;
  const allPassed = passed === total;

  log('\n----------------------------------------', colors.cyan);
  log(`結果: ${passed}/${total} 成功`, allPassed ? colors.green : colors.yellow);
  log('----------------------------------------', colors.cyan);

  if (allPassed) {
    log('\n✅ すべてのPhase 3ツールが正常に動作しています', colors.green);
    log('   （すべて読み取り専用操作でした）', colors.magenta);
  } else {
    log('\n⚠️ 一部のテストが失敗しました', colors.yellow);
  }

  log('\n', colors.reset);
  process.exit(allPassed ? 0 : 1);
}

// 実行
testPhase3Tools().catch((e) => {
  console.error('テスト実行エラー:', e);
  process.exit(1);
});
