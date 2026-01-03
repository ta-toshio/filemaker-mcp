/**
 * 設定セキュリティテスト
 *
 * テスト対象: セキュリティ要件の検証
 * - SEC-005: HTTPS通信強制
 * - SEC-006: SSL証明書検証警告
 * - パスワードマスキング（ログ出力時の安全性）
 *
 * 設計書 8.2 セクション準拠
 */

import {
  CONFIG_DEFAULTS,
  ENV_VARS,
  formatConfigForLog,
  getConfig,
  loadConfigFromEnv,
  validateConfig,
  type FileMakerConfig,
} from '../../../src/config.js';

// ============================================================================
// SEC-005: HTTPS通信強制のテスト
// ============================================================================

describe('SEC-005: HTTPS通信強制', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // テストごとに環境変数をリセット
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('HTTPプロトコルの拒否', () => {
    /**
     * 前提条件: http://で始まるサーバーURLが設定されている
     * 検証項目: 設定検証でエラーが返される
     */
    it('http://で始まるURLはエラーとして拒否される', () => {
      const config: Partial<FileMakerConfig> = {
        server: 'http://insecure-server.example.com',
        database: 'TestDB',
        username: 'user',
        password: 'pass',
      };

      const result = validateConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(`${ENV_VARS.server} must use HTTPS (SEC-005)`);
    });

    it('http://localhost もエラーとして拒否される', () => {
      const config: Partial<FileMakerConfig> = {
        server: 'http://localhost',
        database: 'TestDB',
        username: 'user',
        password: 'pass',
      };

      const result = validateConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('SEC-005'))).toBe(true);
    });

    it('http://127.0.0.1 もエラーとして拒否される', () => {
      const config: Partial<FileMakerConfig> = {
        server: 'http://127.0.0.1',
        database: 'TestDB',
        username: 'user',
        password: 'pass',
      };

      const result = validateConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('SEC-005'))).toBe(true);
    });
  });

  describe('HTTPSプロトコルの受け入れ', () => {
    /**
     * 前提条件: https://で始まるサーバーURLが設定されている
     * 検証項目: 設定検証が成功する
     */
    it('https://で始まるURLは受け入れられる', () => {
      const config: Partial<FileMakerConfig> = {
        server: 'https://secure-server.example.com',
        database: 'TestDB',
        username: 'user',
        password: 'pass',
      };

      const result = validateConfig(config);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('https://localhost は受け入れられる', () => {
      const config: Partial<FileMakerConfig> = {
        server: 'https://localhost',
        database: 'TestDB',
        username: 'user',
        password: 'pass',
      };

      const result = validateConfig(config);

      expect(result.valid).toBe(true);
    });
  });

  describe('URL正規化とHTTPS強制の連携', () => {
    /**
     * 前提条件: プロトコルなしのURLが環境変数に設定されている
     * 検証項目: 自動的にhttps://が付与される
     */
    it('プロトコルなしのURLにはhttps://が自動付与される', () => {
      process.env[ENV_VARS.server] = 'server.example.com';
      process.env[ENV_VARS.database] = 'TestDB';
      process.env[ENV_VARS.username] = 'user';
      process.env[ENV_VARS.password] = 'pass';

      const config = loadConfigFromEnv();

      expect(config.server).toBe('https://server.example.com');
    });

    it('末尾スラッシュは除去される', () => {
      process.env[ENV_VARS.server] = 'https://server.example.com///';
      process.env[ENV_VARS.database] = 'TestDB';
      process.env[ENV_VARS.username] = 'user';
      process.env[ENV_VARS.password] = 'pass';

      const config = loadConfigFromEnv();

      expect(config.server).toBe('https://server.example.com');
    });
  });
});

// ============================================================================
// SEC-006: SSL証明書検証警告のテスト
// ============================================================================

describe('SEC-006: SSL証明書検証警告', () => {
  describe('SSL検証無効化時の警告', () => {
    /**
     * 前提条件: sslVerify が false に設定されている
     * 検証項目: 警告メッセージが出力される
     */
    it('sslVerify=false の場合、警告が出力される', () => {
      const config: Partial<FileMakerConfig> = {
        server: 'https://server.example.com',
        database: 'TestDB',
        username: 'user',
        password: 'pass',
        sslVerify: false,
      };

      const result = validateConfig(config);

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some((w) => w.includes('SEC-006'))).toBe(true);
      expect(result.warnings.some((w) => w.includes('SSL certificate verification is disabled'))).toBe(true);
    });

    it('警告にもかかわらず設定自体は有効', () => {
      const config: Partial<FileMakerConfig> = {
        server: 'https://server.example.com',
        database: 'TestDB',
        username: 'user',
        password: 'pass',
        sslVerify: false,
      };

      const result = validateConfig(config);

      // 警告はあるが、エラーではないので valid: true
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('SSL検証有効時の正常動作', () => {
    /**
     * 前提条件: sslVerify が true（デフォルト）に設定されている
     * 検証項目: SEC-006警告は出力されない
     */
    it('sslVerify=true の場合、SEC-006警告は出力されない', () => {
      const config: Partial<FileMakerConfig> = {
        server: 'https://server.example.com',
        database: 'TestDB',
        username: 'user',
        password: 'pass',
        sslVerify: true,
      };

      const result = validateConfig(config);

      expect(result.warnings.some((w) => w.includes('SEC-006'))).toBe(false);
    });

    it('デフォルト値 sslVerify=true が使用される', () => {
      expect(CONFIG_DEFAULTS.sslVerify).toBe(true);
    });
  });
});

// ============================================================================
// パスワードマスキングのテスト
// ============================================================================

describe('パスワードマスキング', () => {
  describe('formatConfigForLog', () => {
    /**
     * 前提条件: パスワードを含む設定オブジェクト
     * 検証項目: パスワードがマスキングされる
     */
    it('パスワードは ***MASKED*** にマスキングされる', () => {
      const config: Partial<FileMakerConfig> = {
        server: 'https://server.example.com',
        database: 'TestDB',
        username: 'admin',
        password: 'SuperSecretPassword123!',
      };

      const formatted = formatConfigForLog(config);

      expect(formatted.password).toBe('***MASKED***');
      // 他のフィールドは保持される
      expect(formatted.server).toBe('https://server.example.com');
      expect(formatted.database).toBe('TestDB');
      expect(formatted.username).toBe('admin');
    });

    it('パスワードがundefinedの場合はundefinedのまま', () => {
      const config: Partial<FileMakerConfig> = {
        server: 'https://server.example.com',
        database: 'TestDB',
        username: 'admin',
        // password は undefined
      };

      const formatted = formatConfigForLog(config);

      expect(formatted.password).toBeUndefined();
    });

    it('空文字のパスワードはマスキングされない（falsyなため）', () => {
      const config: Partial<FileMakerConfig> = {
        server: 'https://server.example.com',
        database: 'TestDB',
        username: 'admin',
        password: '',
      };

      const formatted = formatConfigForLog(config);

      // 空文字は falsy なので undefined が返される
      expect(formatted.password).toBeUndefined();
    });
  });
});

// ============================================================================
// 環境変数のセキュリティテスト
// ============================================================================

describe('環境変数からの設定読み込みセキュリティ', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('FM_SSL_VERIFY の解析', () => {
    /**
     * 前提条件: 様々な値でFM_SSL_VERIFYが設定されている
     * 検証項目: 正しく解析される
     */
    it('true と評価される値: "true", "1", "yes"', () => {
      const trueValues = ['true', 'TRUE', 'True', '1', 'yes', 'YES', 'Yes'];

      for (const value of trueValues) {
        process.env[ENV_VARS.sslVerify] = value;
        const config = loadConfigFromEnv();
        expect(config.sslVerify).toBe(true);
      }
    });

    it('false と評価される値: "false", "0", "no", その他', () => {
      const falseValues = ['false', 'FALSE', '0', 'no', 'NO', 'other', 'invalid'];

      for (const value of falseValues) {
        process.env[ENV_VARS.sslVerify] = value;
        const config = loadConfigFromEnv();
        expect(config.sslVerify).toBe(false);
      }
    });

    it('未設定の場合はデフォルト（true）が使用される', () => {
      delete process.env[ENV_VARS.sslVerify];
      const config = loadConfigFromEnv();
      expect(config.sslVerify).toBe(true);
    });
  });
});

// ============================================================================
// getConfig のセキュリティ統合テスト
// ============================================================================

describe('getConfig セキュリティ統合テスト', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    // 必須環境変数を設定
    process.env[ENV_VARS.server] = 'https://secure-server.example.com';
    process.env[ENV_VARS.database] = 'TestDB';
    process.env[ENV_VARS.username] = 'user';
    process.env[ENV_VARS.password] = 'password';
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('SEC-005 エラー時の動作', () => {
    it('HTTPサーバーが指定された場合、getConfigはエラーを返す', () => {
      process.env[ENV_VARS.server] = 'http://insecure-server.example.com';

      const result = getConfig();

      expect('valid' in result).toBe(true);
      if ('valid' in result) {
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('SEC-005'))).toBe(true);
      }
    });
  });

  describe('オーバーライドのセキュリティ', () => {
    it('オーバーライドでHTTPを指定してもエラーになる', () => {
      const result = getConfig({
        server: 'http://override-insecure.example.com',
      });

      expect('valid' in result).toBe(true);
      if ('valid' in result) {
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('SEC-005'))).toBe(true);
      }
    });

    it('オーバーライドでプロトコルなしURLを指定するとHTTPSに正規化される', () => {
      const result = getConfig({
        server: 'override-server.example.com',
      });

      // 正規化後はhttps://が付与されるので有効になる
      expect('valid' in result).toBe(false);
      if (!('valid' in result)) {
        expect(result.server).toBe('https://override-server.example.com');
      }
    });
  });
});

// ============================================================================
// セッションタイムアウトのセキュリティテスト
// ============================================================================

describe('セッションタイムアウトのセキュリティ', () => {
  describe('タイムアウト値の検証', () => {
    /**
     * 前提条件: 極端に短いまたは長いタイムアウト値
     * 検証項目: 適切な警告が出力される
     */
    it('60秒未満のタイムアウトには警告が出力される', () => {
      const config: Partial<FileMakerConfig> = {
        server: 'https://server.example.com',
        database: 'TestDB',
        username: 'user',
        password: 'pass',
        sessionTimeout: 30,
      };

      const result = validateConfig(config);

      expect(result.warnings.some((w) => w.includes('very short'))).toBe(true);
    });

    it('900秒超のタイムアウトには警告が出力される', () => {
      const config: Partial<FileMakerConfig> = {
        server: 'https://server.example.com',
        database: 'TestDB',
        username: 'user',
        password: 'pass',
        sessionTimeout: 1800,
      };

      const result = validateConfig(config);

      expect(result.warnings.some((w) => w.includes('exceeds FileMaker'))).toBe(true);
    });

    it('デフォルトタイムアウト（840秒）は警告なし', () => {
      const config: Partial<FileMakerConfig> = {
        server: 'https://server.example.com',
        database: 'TestDB',
        username: 'user',
        password: 'pass',
        sessionTimeout: CONFIG_DEFAULTS.sessionTimeout,
      };

      const result = validateConfig(config);

      // タイムアウト関連の警告がない
      expect(result.warnings.some((w) => w.includes('short') || w.includes('exceeds'))).toBe(false);
    });
  });
});
