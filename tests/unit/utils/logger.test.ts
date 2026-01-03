/**
 * logger.ts 単体テスト
 *
 * テスト対象: セキュアロガー
 * - maskSensitiveData: センシティブ情報のマスキング（SEC-001準拠）
 * - Logger クラス: ログレベル制御（SEC-002準拠）
 * - parseLogLevel: ログレベル文字列のパース
 *
 * 設計書 6.1, 6.2 セクション準拠
 *
 * 重要なセキュリティ検証項目:
 * - パスワードがログに記録されないこと
 * - 認証情報が漏洩しないこと
 */

import { Logger, LogLevel, maskSensitiveData, createLogger, createTimedLogger, logError } from '../../../src/utils/logger.js';

// ============================================================================
// maskSensitiveData のテスト（SEC-001準拠）
// ============================================================================

describe('maskSensitiveData', () => {
  describe('基本的なマスキング', () => {
    /**
     * 前提条件: password, secret, token などのキーを含むオブジェクト
     * 検証項目: 該当キーの値が '***MASKED***' に置換される
     */
    it('password キーをマスキングする', () => {
      const data = {
        username: 'testuser',
        password: 'secret123',
      };

      const masked = maskSensitiveData(data) as Record<string, unknown>;

      expect(masked.username).toBe('testuser');
      expect(masked.password).toBe('***MASKED***');
    });

    it('PASSWORD（大文字）キーをマスキングする', () => {
      const data = {
        USER: 'testuser',
        PASSWORD: 'secret123',
      };

      const masked = maskSensitiveData(data) as Record<string, unknown>;

      expect(masked.USER).toBe('testuser');
      expect(masked.PASSWORD).toBe('***MASKED***');
    });

    it('secret キーをマスキングする', () => {
      const data = {
        apiSecret: 'my-secret-key',
        publicKey: 'public-value',
      };

      const masked = maskSensitiveData(data) as Record<string, unknown>;

      expect(masked.apiSecret).toBe('***MASKED***');
      expect(masked.publicKey).toBe('public-value');
    });

    it('token キーをマスキングする', () => {
      const data = {
        accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        refreshToken: 'refresh-token-xyz',
      };

      const masked = maskSensitiveData(data) as Record<string, unknown>;

      expect(masked.accessToken).toBe('***MASKED***');
      expect(masked.refreshToken).toBe('***MASKED***');
    });

    it('tokenを含まないキーはマスキングしない', () => {
      const data = {
        type: 'Bearer',
        endpoint: 'https://api.example.com',
      };

      const masked = maskSensitiveData(data) as Record<string, unknown>;

      expect(masked.type).toBe('Bearer');
      expect(masked.endpoint).toBe('https://api.example.com');
    });

    it('api_key キーをマスキングする', () => {
      const data = {
        api_key: 'sk-1234567890',
        endpoint: 'https://api.example.com',
      };

      const masked = maskSensitiveData(data) as Record<string, unknown>;

      expect(masked.api_key).toBe('***MASKED***');
      expect(masked.endpoint).toBe('https://api.example.com');
    });

    it('authorization キーをマスキングする', () => {
      const data = {
        authorization: 'Basic dXNlcjpwYXNz',
        contentType: 'application/json',
      };

      const masked = maskSensitiveData(data) as Record<string, unknown>;

      expect(masked.authorization).toBe('***MASKED***');
      expect(masked.contentType).toBe('application/json');
    });

    it('credential キーをマスキングする', () => {
      const data = {
        userCredential: 'private-credential',
        credentials: { user: 'test', pass: 'secret' },
      };

      const masked = maskSensitiveData(data) as Record<string, unknown>;

      expect(masked.userCredential).toBe('***MASKED***');
      expect(masked.credentials).toBe('***MASKED***');
    });
  });

  describe('ネストしたオブジェクトのマスキング', () => {
    /**
     * 前提条件: 深くネストしたオブジェクト
     * 検証項目: 再帰的にマスキングが適用される
     */
    it('ネストしたオブジェクト内のパスワードをマスキングする', () => {
      const data = {
        user: {
          name: 'testuser',
          login: {
            password: 'nested-secret',
            lastLogin: '2024-01-01',
          },
        },
      };

      const masked = maskSensitiveData(data) as Record<string, unknown>;
      const user = masked.user as Record<string, unknown>;
      const login = user.login as Record<string, unknown>;

      expect(login.password).toBe('***MASKED***');
      expect(login.lastLogin).toBe('2024-01-01');
    });

    it('authキー自体がセンシティブとしてマスキングされる', () => {
      // 注意: 'auth'はSENSITIVE_KEYSに含まれるため、auth全体がマスキングされる
      const data = {
        user: {
          name: 'testuser',
          auth: {
            password: 'nested-secret',
            lastLogin: '2024-01-01',
          },
        },
      };

      const masked = maskSensitiveData(data) as Record<string, unknown>;
      const user = masked.user as Record<string, unknown>;

      // 'auth'キーを含むため、全体がマスキングされる
      expect(user.auth).toBe('***MASKED***');
    });

    it('3階層以上のネストでもマスキングが機能する', () => {
      const data = {
        level1: {
          level2: {
            level3: {
              secretKey: 'deep-secret',
              normalValue: 'visible',
            },
          },
        },
      };

      const masked = maskSensitiveData(data) as Record<string, unknown>;
      const level1 = masked.level1 as Record<string, unknown>;
      const level2 = level1.level2 as Record<string, unknown>;
      const level3 = level2.level3 as Record<string, unknown>;

      expect(level3.secretKey).toBe('***MASKED***');
      expect(level3.normalValue).toBe('visible');
    });
  });

  describe('配列のマスキング', () => {
    /**
     * 前提条件: 配列を含むデータ
     * 検証項目: 配列内の各要素に対してマスキングが適用される
     */
    it('オブジェクトの配列内のパスワードをマスキングする', () => {
      const data = {
        users: [
          { name: 'user1', password: 'pass1' },
          { name: 'user2', password: 'pass2' },
        ],
      };

      const masked = maskSensitiveData(data) as Record<string, unknown>;
      const users = masked.users as Array<Record<string, unknown>>;

      expect(users).toHaveLength(2);
      const user0 = users[0]!;
      const user1 = users[1]!;
      expect(user0.name).toBe('user1');
      expect(user0.password).toBe('***MASKED***');
      expect(user1.name).toBe('user2');
      expect(user1.password).toBe('***MASKED***');
    });

    it('プリミティブ値の配列はそのまま返す', () => {
      const data = ['item1', 'item2', 'item3'];

      const masked = maskSensitiveData(data);

      expect(masked).toEqual(['item1', 'item2', 'item3']);
    });
  });

  describe('プリミティブ値の処理', () => {
    /**
     * 前提条件: オブジェクト以外の値
     * 検証項目: そのまま返される
     */
    it('null はそのまま返される', () => {
      expect(maskSensitiveData(null)).toBeNull();
    });

    it('undefined はそのまま返される', () => {
      expect(maskSensitiveData(undefined)).toBeUndefined();
    });

    it('文字列はそのまま返される', () => {
      expect(maskSensitiveData('test string')).toBe('test string');
    });

    it('数値はそのまま返される', () => {
      expect(maskSensitiveData(12345)).toBe(12345);
    });

    it('真偽値はそのまま返される', () => {
      expect(maskSensitiveData(true)).toBe(true);
      expect(maskSensitiveData(false)).toBe(false);
    });
  });

  describe('FileMaker MCP固有のテストケース', () => {
    /**
     * 前提条件: FileMaker認証で使用されるデータ構造
     * 検証項目: 実際の認証フローで使用されるパスワードがマスキングされる
     */
    it('FileMaker認証リクエストのパスワードをマスキングする', () => {
      const loginRequest = {
        server: 'https://filemaker.example.com',
        database: 'TestDatabase',
        username: 'api_user',
        password: 'fm_api_password_123',
      };

      const masked = maskSensitiveData(loginRequest) as Record<string, unknown>;

      expect(masked.server).toBe('https://filemaker.example.com');
      expect(masked.database).toBe('TestDatabase');
      expect(masked.username).toBe('api_user');
      expect(masked.password).toBe('***MASKED***');
    });

    it('セッショントークンをマスキングする', () => {
      const sessionData = {
        sessionToken: 'abc123-session-token-xyz',
        layout: 'TestLayout',
        database: 'TestDB',
      };

      const masked = maskSensitiveData(sessionData) as Record<string, unknown>;

      expect(masked.sessionToken).toBe('***MASKED***');
      expect(masked.layout).toBe('TestLayout');
    });
  });
});

// ============================================================================
// Logger クラスのテスト
// ============================================================================

describe('Logger', () => {
  // console.error をモック化
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe('ログレベル制御', () => {
    /**
     * 前提条件: 特定のログレベルが設定されたロガー
     * 検証項目: 設定レベル以上のログのみ出力される
     */
    it('設定レベル以上のログのみ出力される', () => {
      const logger = new Logger('test', LogLevel.WARN);

      logger.debug('debug message');
      logger.info('info message');
      logger.warn('warn message');
      logger.error('error message');

      // WARN以上のみ出力される（2回呼ばれる）
      expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
    });

    it('NONE レベルでは何も出力されない', () => {
      const logger = new Logger('test', LogLevel.NONE);

      logger.trace('trace');
      logger.debug('debug');
      logger.info('info');
      logger.warn('warn');
      logger.error('error');

      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('TRACE レベルでは全て出力される', () => {
      const logger = new Logger('test', LogLevel.TRACE);

      logger.trace('trace');
      logger.debug('debug');
      logger.info('info');
      logger.warn('warn');
      logger.error('error');

      expect(consoleErrorSpy).toHaveBeenCalledTimes(5);
    });
  });

  describe('getLevel / setLevel', () => {
    it('現在のログレベルを取得できる', () => {
      const logger = new Logger('test', LogLevel.INFO);

      expect(logger.getLevel()).toBe(LogLevel.INFO);
    });

    it('ログレベルを変更できる', () => {
      const logger = new Logger('test', LogLevel.INFO);
      logger.setLevel(LogLevel.ERROR);

      expect(logger.getLevel()).toBe(LogLevel.ERROR);
    });
  });

  describe('isEnabled', () => {
    it('設定レベル以上のログが有効と判定される', () => {
      const logger = new Logger('test', LogLevel.WARN);

      expect(logger.isEnabled(LogLevel.TRACE)).toBe(false);
      expect(logger.isEnabled(LogLevel.DEBUG)).toBe(false);
      expect(logger.isEnabled(LogLevel.INFO)).toBe(false);
      expect(logger.isEnabled(LogLevel.WARN)).toBe(true);
      expect(logger.isEnabled(LogLevel.ERROR)).toBe(true);
    });
  });

  describe('ログフォーマット', () => {
    /**
     * 前提条件: ログメッセージとデータ
     * 検証項目: タイムスタンプ、レベル、名前空間を含むフォーマット
     */
    it('標準フォーマットでログが出力される', () => {
      const logger = new Logger('test-namespace', LogLevel.INFO);

      logger.info('test message');

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      const output = consoleErrorSpy.mock.calls[0][0] as string;

      // タイムスタンプ、レベル、名前空間、メッセージを含む
      expect(output).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(output).toContain('[INFO]');
      expect(output).toContain('[test-namespace]');
      expect(output).toContain('test message');
    });

    it('データオブジェクトがJSON形式で出力される', () => {
      const logger = new Logger('test', LogLevel.INFO);

      logger.info('message with data', { key: 'value', count: 42 });

      const output = consoleErrorSpy.mock.calls[0][0] as string;
      expect(output).toContain('"key":"value"');
      expect(output).toContain('"count":42');
    });

    it('センシティブ情報がマスキングされて出力される', () => {
      const logger = new Logger('test', LogLevel.INFO);

      logger.info('auth data', { username: 'user', password: 'secret' });

      const output = consoleErrorSpy.mock.calls[0][0] as string;
      expect(output).toContain('"username":"user"');
      expect(output).toContain('"password":"***MASKED***"');
      expect(output).not.toContain('secret');
    });
  });

  describe('child ロガー', () => {
    /**
     * 前提条件: 親ロガーから子ロガーを作成
     * 検証項目: 名前空間が結合され、ログレベルが継承される
     */
    it('子ロガーの名前空間が親と結合される', () => {
      const parent = new Logger('parent', LogLevel.INFO);
      const child = parent.child('child');

      child.info('child message');

      const output = consoleErrorSpy.mock.calls[0][0] as string;
      expect(output).toContain('[parent:child]');
    });

    it('子ロガーは親のログレベルを継承する', () => {
      const parent = new Logger('parent', LogLevel.ERROR);
      const child = parent.child('child');

      expect(child.getLevel()).toBe(LogLevel.ERROR);
    });
  });
});

// ============================================================================
// createLogger のテスト
// ============================================================================

describe('createLogger', () => {
  it('ルートロガーの子として作成される', () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    const logger = createLogger('custom');
    logger.setLevel(LogLevel.INFO);
    logger.info('test');

    const output = consoleErrorSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain('jaou-fm:custom');

    consoleErrorSpy.mockRestore();
  });
});

// ============================================================================
// createTimedLogger のテスト
// ============================================================================

describe('createTimedLogger', () => {
  it('実行時間を計測してログ出力する', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    const logger = new Logger('test', LogLevel.DEBUG);

    const complete = createTimedLogger(logger, 'TestOperation');

    // 少し待機
    await new Promise((resolve) => setTimeout(resolve, 10));

    complete();

    expect(consoleErrorSpy.mock.calls.length).toBeGreaterThan(0);
    const output = consoleErrorSpy.mock.calls[0]![0] as string;
    expect(output).toContain('TestOperation completed in');
    expect(output).toMatch(/\d+ms/);

    consoleErrorSpy.mockRestore();
  });
});

// ============================================================================
// logError のテスト
// ============================================================================

describe('logError', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('Errorオブジェクトのメッセージと名前を出力する', () => {
    const logger = new Logger('test', LogLevel.ERROR);
    const error = new Error('Test error message');

    logError(logger, 'TestOperation', error);

    const output = consoleErrorSpy.mock.calls[0][0] as string;
    expect(output).toContain('Error in TestOperation');
    expect(output).toContain('Test error message');
    expect(output).toContain('"name":"Error"');
  });

  it('Axios風エラーのレスポンスデータをマスキングして出力する', () => {
    const logger = new Logger('test', LogLevel.ERROR);
    const axiosError = {
      message: 'Request failed',
      response: {
        status: 401,
        data: {
          error: 'unauthorized',
          token: 'leaked-token',
        },
      },
    };

    logError(logger, 'APICall', axiosError);

    const output = consoleErrorSpy.mock.calls[0][0] as string;
    expect(output).toContain('"status":401');
    expect(output).toContain('"token":"***MASKED***"');
    expect(output).not.toContain('leaked-token');
  });

  it('文字列エラーをそのまま出力する', () => {
    const logger = new Logger('test', LogLevel.ERROR);

    logError(logger, 'StringError', 'Simple error string');

    const output = consoleErrorSpy.mock.calls[0][0] as string;
    expect(output).toContain('Simple error string');
  });
});

// ============================================================================
// LogLevel enum のテスト
// ============================================================================

describe('LogLevel enum', () => {
  it('適切な数値順序を持つ', () => {
    expect(LogLevel.TRACE).toBeLessThan(LogLevel.DEBUG);
    expect(LogLevel.DEBUG).toBeLessThan(LogLevel.INFO);
    expect(LogLevel.INFO).toBeLessThan(LogLevel.WARN);
    expect(LogLevel.WARN).toBeLessThan(LogLevel.ERROR);
    expect(LogLevel.ERROR).toBeLessThan(LogLevel.NONE);
  });
});
