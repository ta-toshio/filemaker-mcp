#!/usr/bin/env node
/**
 * Jaou Ensatsu Kokuryu FileMaker MCP Server
 *
 * FileMaker Data API を通じてFileMakerデータベースの
 * 読み取りと高度な分析を行うMCPサーバー
 */

import { startServer } from './server.js';
import { rootLogger } from './utils/logger.js';

// メイン関数
async function main(): Promise<void> {
  try {
    await startServer();
  } catch (error) {
    rootLogger.error('Fatal error during server startup', error);
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

// エントリーポイント
main();
