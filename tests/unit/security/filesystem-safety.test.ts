/**
 * ファイルシステム安全性テスト
 *
 * テスト対象: SEC-003 ローカルファイルシステムへの書き込み禁止
 *
 * このテストは、ソースコードに危険なファイルシステム操作が
 * 含まれていないことを静的に検証します。
 *
 * 設計書 2.2 セキュリティ要件 SEC-003 準拠
 *
 * 注意: このテストは実際のファイル操作を行わず、
 * ソースコードのパターン検査のみを行います。
 */

import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

// ============================================================================
// 定数
// ============================================================================

/**
 * プロジェクトのソースディレクトリパス
 */
const SRC_DIR = path.resolve(__dirname, '../../../src');

/**
 * 危険なファイルシステム操作パターン
 *
 * これらのパターンがソースコードに存在する場合、
 * セキュリティリスクとして報告される
 */
const DANGEROUS_PATTERNS = {
  // Node.js fs モジュールの書き込み操作
  fsWriteFile: /fs\.writeFile|fs\.writeFileSync/,
  fsAppendFile: /fs\.appendFile|fs\.appendFileSync/,
  fsUnlink: /fs\.unlink|fs\.unlinkSync/,
  fsMkdir: /fs\.mkdir|fs\.mkdirSync/,
  fsRmdir: /fs\.rmdir|fs\.rmdirSync/,
  fsRm: /fs\.rm|fs\.rmSync/,
  fsCopyFile: /fs\.copyFile|fs\.copyFileSync/,
  fsRename: /fs\.rename|fs\.renameSync/,

  // fsPromises の書き込み操作
  fsPromisesWrite: /fsPromises\.writeFile|fsPromises\.appendFile/,
  fsPromisesUnlink: /fsPromises\.unlink|fsPromises\.rm/,

  // fs/promises インポート
  importFsPromises: /from\s+['"]fs\/promises['"]/,

  // console.log（デバッグ出力の残存）
  consoleLog: /console\.log\s*\(/,

  // eval（コードインジェクションリスク）
  evalUsage: /\beval\s*\(/,

  // child_process のexec（コマンドインジェクションリスク）
  execUsage: /child_process.*exec|execSync/,
};

/**
 * importパターン（Node.js fs読み込みで検証するため別定義）
 */
const IMPORT_PATTERNS = {
  // 'fs' または 'node:fs' のインポート
  fsImport: /from\s+['"](?:node:)?fs['"]/,
  // 'fs/promises' インポート
  fsPromisesImport: /from\s+['"](?:node:)?fs\/promises['"]/,
  // 'child_process' インポート
  childProcessImport: /from\s+['"](?:node:)?child_process['"]/,
};

// ============================================================================
// ヘルパー関数
// ============================================================================

/**
 * 指定ディレクトリ内のTypeScriptファイルを再帰的に取得
 */
function getTypeScriptFiles(dir: string): string[] {
  try {
    const result = execSync(`find "${dir}" -name "*.ts" -type f`, {
      encoding: 'utf-8',
    });
    return result.trim().split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * ファイル内で指定パターンを検索（Node.js fs使用）
 *
 * @returns マッチした行番号と内容の配列
 */
function searchPatternInFile(
  filePath: string,
  pattern: RegExp
): Array<{ line: number; content: string }> {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const matches: Array<{ line: number; content: string }> = [];

    for (let i = 0; i < lines.length; i++) {
      if (pattern.test(lines[i]!)) {
        matches.push({
          line: i + 1,
          content: lines[i]!.trim(),
        });
      }
    }

    return matches;
  } catch {
    return [];
  }
}

// ============================================================================
// SEC-003: ファイルシステム安全性テスト
// ============================================================================

describe('SEC-003: ローカルファイルシステムへの書き込み禁止', () => {
  const srcFiles = getTypeScriptFiles(SRC_DIR);

  beforeAll(() => {
    // ソースファイルが存在することを確認
    expect(srcFiles.length).toBeGreaterThan(0);
  });

  describe('fs モジュールの書き込み操作が存在しないこと', () => {
    /**
     * 前提条件: ソースコード内を検索
     * 検証項目: fs.writeFile, fs.appendFile などが存在しない
     */
    it('fs.writeFile / fs.writeFileSync が存在しない', () => {
      const violations: Array<{ file: string; line: number; content: string }> = [];

      for (const file of srcFiles) {
        const matches = searchPatternInFile(file, DANGEROUS_PATTERNS.fsWriteFile);
        for (const match of matches) {
          violations.push({ file, ...match });
        }
      }

      expect(violations).toHaveLength(0);
    });

    it('fs.appendFile / fs.appendFileSync が存在しない', () => {
      const violations: Array<{ file: string; line: number; content: string }> = [];

      for (const file of srcFiles) {
        const matches = searchPatternInFile(file, DANGEROUS_PATTERNS.fsAppendFile);
        for (const match of matches) {
          violations.push({ file, ...match });
        }
      }

      expect(violations).toHaveLength(0);
    });

    it('fs.unlink / fs.unlinkSync が存在しない', () => {
      const violations: Array<{ file: string; line: number; content: string }> = [];

      for (const file of srcFiles) {
        const matches = searchPatternInFile(file, DANGEROUS_PATTERNS.fsUnlink);
        for (const match of matches) {
          violations.push({ file, ...match });
        }
      }

      expect(violations).toHaveLength(0);
    });

    it('fs.rm / fs.rmSync が存在しない', () => {
      const violations: Array<{ file: string; line: number; content: string }> = [];

      for (const file of srcFiles) {
        const matches = searchPatternInFile(file, DANGEROUS_PATTERNS.fsRm);
        for (const match of matches) {
          violations.push({ file, ...match });
        }
      }

      expect(violations).toHaveLength(0);
    });
  });

  describe('デバッグ出力が残存していないこと', () => {
    /**
     * 前提条件: ソースコード内を検索
     * 検証項目: console.log が存在しない（ロガーを使用すべき）
     */
    it('console.log が存在しない', () => {
      const violations: Array<{ file: string; line: number; content: string }> = [];

      for (const file of srcFiles) {
        const matches = searchPatternInFile(file, DANGEROUS_PATTERNS.consoleLog);
        for (const match of matches) {
          violations.push({ file, ...match });
        }
      }

      // 検出された場合は詳細を出力
      if (violations.length > 0) {
        console.error('console.log が検出されました:');
        for (const v of violations) {
          console.error(`  ${v.file}:${v.line}: ${v.content}`);
        }
      }

      expect(violations).toHaveLength(0);
    });
  });

  describe('危険なコード実行パターンが存在しないこと', () => {
    /**
     * 前提条件: ソースコード内を検索
     * 検証項目: eval() や child_process が存在しない
     */
    it('eval() が存在しない', () => {
      const violations: Array<{ file: string; line: number; content: string }> = [];

      for (const file of srcFiles) {
        const matches = searchPatternInFile(file, DANGEROUS_PATTERNS.evalUsage);
        for (const match of matches) {
          violations.push({ file, ...match });
        }
      }

      expect(violations).toHaveLength(0);
    });

    it('child_process の exec が存在しない', () => {
      const violations: Array<{ file: string; line: number; content: string }> = [];

      for (const file of srcFiles) {
        const matches = searchPatternInFile(file, DANGEROUS_PATTERNS.execUsage);
        for (const match of matches) {
          violations.push({ file, ...match });
        }
      }

      expect(violations).toHaveLength(0);
    });
  });
});

// ============================================================================
// ロガー使用の検証
// ============================================================================

describe('ロガー使用の検証', () => {
  const srcFiles = getTypeScriptFiles(SRC_DIR);

  describe('ロガーが適切にインポートされていること', () => {
    /**
     * 前提条件: ソースファイルでログ出力が必要な場合
     * 検証項目: loggers がインポートされている
     */
    it('主要ソースファイルでロガーがインポートされている', () => {
      // ロガーを使用すべきファイルをリストアップ
      const filesRequiringLogger = srcFiles.filter((f) => {
        // ロガー自身とインデックスファイルは除外
        const filename = path.basename(f);
        return !filename.includes('logger') && filename !== 'index.ts';
      });

      // 少なくとも1つのファイルでロガーが使用されていることを確認
      let loggerUsageCount = 0;

      for (const file of filesRequiringLogger) {
        try {
          const result = execSync(`grep -l "loggers" "${file}" 2>/dev/null || true`, {
            encoding: 'utf-8',
          });
          if (result.trim()) {
            loggerUsageCount++;
          }
        } catch {
          // ignore
        }
      }

      // プロジェクトでロガーが使用されていることを確認
      expect(loggerUsageCount).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// import 文の安全性検証
// ============================================================================

describe('import 文の安全性検証', () => {
  const srcFiles = getTypeScriptFiles(SRC_DIR);

  describe('危険なモジュールがインポートされていないこと', () => {
    /**
     * 前提条件: ソースコード内のimport文を検索
     * 検証項目: 危険なモジュールがインポートされていない
     */
    it("'fs' モジュールがインポートされていない", () => {
      const violations: Array<{ file: string; line: number; content: string }> = [];

      for (const file of srcFiles) {
        const matches = searchPatternInFile(file, IMPORT_PATTERNS.fsImport);
        for (const match of matches) {
          violations.push({ file, ...match });
        }
      }

      expect(violations).toHaveLength(0);
    });

    it("'fs/promises' モジュールがインポートされていない", () => {
      const violations: Array<{ file: string; line: number; content: string }> = [];

      for (const file of srcFiles) {
        const matches = searchPatternInFile(file, IMPORT_PATTERNS.fsPromisesImport);
        for (const match of matches) {
          violations.push({ file, ...match });
        }
      }

      expect(violations).toHaveLength(0);
    });

    it("'child_process' モジュールがインポートされていない", () => {
      const violations: Array<{ file: string; line: number; content: string }> = [];

      for (const file of srcFiles) {
        const matches = searchPatternInFile(file, IMPORT_PATTERNS.childProcessImport);
        for (const match of matches) {
          violations.push({ file, ...match });
        }
      }

      expect(violations).toHaveLength(0);
    });
  });
});

// ============================================================================
// 全体的なコードセキュリティサマリー
// ============================================================================

describe('コードセキュリティサマリー', () => {
  it('SEC-003 要件を満たしていること', () => {
    // このテストは他のテストが全て通過した場合にのみ成功
    // 統合的なセキュリティチェックとして機能

    const srcFiles = getTypeScriptFiles(SRC_DIR);
    let totalViolations = 0;

    // すべての危険パターンをチェック
    for (const [_patternName, pattern] of Object.entries(DANGEROUS_PATTERNS)) {
      for (const file of srcFiles) {
        const matches = searchPatternInFile(file, pattern);
        totalViolations += matches.length;
      }
    }

    // SEC-003 遵守: ファイルシステム操作なし
    expect(totalViolations).toBe(0);
  });
});
