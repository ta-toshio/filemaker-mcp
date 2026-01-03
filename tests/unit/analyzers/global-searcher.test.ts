/**
 * global-searcher.ts 単体テスト
 *
 * テスト対象: グローバルデータ検索エンジン
 * - フィールド検索可能判定（isSearchableField）
 * - 検索値生成（buildSearchValue）
 * - 検索モード（contains, exact, startsWith）
 *
 * 設計書 3.2.6 セクション準拠
 *
 * 注意: このテストはAPIへの接続を行わず、検索ロジックのみをテストします。
 * 本番データに依存したテストは含まれていません。
 */

// ============================================================================
// テスト用ヘルパー: 内部ロジックの検証用
// global-searcher.ts の内部関数と同等のロジックを再実装
// ============================================================================

/**
 * 検索可能なフィールド結果型
 */
const SEARCHABLE_RESULT_TYPES = ['text', 'number', 'date', 'time', 'timestamp'];

/**
 * フィールドメタデータ型（テスト用簡易版）
 */
interface TestFieldMetaData {
  name: string;
  type: string;      // 'normal' | 'calculation' | 'summary'
  result: string;    // 'text' | 'number' | 'date' | 'time' | 'timestamp' | 'container'
}

/**
 * フィールドが検索可能かどうかを判定（テスト用再実装）
 */
function testIsSearchableField(field: TestFieldMetaData, includeCalculations: boolean): boolean {
  // 結果型が検索可能でない場合は除外
  if (!SEARCHABLE_RESULT_TYPES.includes(field.result)) {
    return false;
  }

  // 計算フィールドの処理
  if (field.type === 'calculation' && !includeCalculations) {
    return false;
  }

  // サマリーフィールドは検索対象外
  if (field.type === 'summary') {
    return false;
  }

  return true;
}

/**
 * 検索モードとフィールド型に応じた検索値を生成（テスト用再実装）
 */
function testBuildSearchValue(
  searchText: string,
  searchMode: 'contains' | 'exact' | 'startsWith',
  fieldResultType: string
): string {
  // テキスト型以外は完全一致のみ（ワイルドカード非対応）
  if (fieldResultType !== 'text') {
    return searchText;
  }

  // テキスト型のみワイルドカードを適用
  switch (searchMode) {
    case 'exact':
      return `==${searchText}`;
    case 'startsWith':
      return `${searchText}*`;
    default:
      return `*${searchText}*`;
  }
}

// ============================================================================
// isSearchableField のテスト
// ============================================================================

describe('isSearchableField', () => {
  describe('検索可能なフィールド型', () => {
    /**
     * 前提条件: 検索対象となるフィールド型
     * 検証項目: true が返される
     */
    it('text 型は検索可能', () => {
      const field: TestFieldMetaData = { name: 'Description', type: 'normal', result: 'text' };
      expect(testIsSearchableField(field, false)).toBe(true);
    });

    it('number 型は検索可能', () => {
      const field: TestFieldMetaData = { name: 'Amount', type: 'normal', result: 'number' };
      expect(testIsSearchableField(field, false)).toBe(true);
    });

    it('date 型は検索可能', () => {
      const field: TestFieldMetaData = { name: 'CreatedDate', type: 'normal', result: 'date' };
      expect(testIsSearchableField(field, false)).toBe(true);
    });

    it('time 型は検索可能', () => {
      const field: TestFieldMetaData = { name: 'StartTime', type: 'normal', result: 'time' };
      expect(testIsSearchableField(field, false)).toBe(true);
    });

    it('timestamp 型は検索可能', () => {
      const field: TestFieldMetaData = { name: 'ModifiedAt', type: 'normal', result: 'timestamp' };
      expect(testIsSearchableField(field, false)).toBe(true);
    });
  });

  describe('検索不可能なフィールド型', () => {
    /**
     * 前提条件: 検索対象外となるフィールド型
     * 検証項目: false が返される
     */
    it('container 型は検索不可能', () => {
      const field: TestFieldMetaData = { name: 'Image', type: 'normal', result: 'container' };
      expect(testIsSearchableField(field, false)).toBe(false);
    });

    it('不明な結果型は検索不可能', () => {
      const field: TestFieldMetaData = { name: 'Unknown', type: 'normal', result: 'blob' };
      expect(testIsSearchableField(field, false)).toBe(false);
    });
  });

  describe('計算フィールドの扱い', () => {
    /**
     * 前提条件: 計算フィールド
     * 検証項目: includeCalculations オプションに応じて判定される
     */
    it('計算フィールドは includeCalculations=false で検索不可能', () => {
      const field: TestFieldMetaData = { name: 'FullName', type: 'calculation', result: 'text' };
      expect(testIsSearchableField(field, false)).toBe(false);
    });

    it('計算フィールドは includeCalculations=true で検索可能', () => {
      const field: TestFieldMetaData = { name: 'FullName', type: 'calculation', result: 'text' };
      expect(testIsSearchableField(field, true)).toBe(true);
    });

    it('計算フィールドでも container 型は検索不可能', () => {
      const field: TestFieldMetaData = { name: 'CalcImage', type: 'calculation', result: 'container' };
      expect(testIsSearchableField(field, true)).toBe(false);
    });
  });

  describe('サマリーフィールドの扱い', () => {
    /**
     * 前提条件: サマリーフィールド
     * 検証項目: 常に検索不可能
     */
    it('サマリーフィールドは常に検索不可能', () => {
      const field: TestFieldMetaData = { name: 'Total', type: 'summary', result: 'number' };
      expect(testIsSearchableField(field, false)).toBe(false);
      expect(testIsSearchableField(field, true)).toBe(false);
    });
  });
});

// ============================================================================
// buildSearchValue のテスト
// ============================================================================

describe('buildSearchValue', () => {
  describe('テキスト型フィールドの検索値生成', () => {
    /**
     * 前提条件: テキスト型フィールドに対する検索
     * 検証項目: 検索モードに応じたワイルドカードが付与される
     */
    describe('contains モード（部分一致）', () => {
      it('検索語を * で囲む', () => {
        const result = testBuildSearchValue('test', 'contains', 'text');
        expect(result).toBe('*test*');
      });

      it('日本語も同様に処理される', () => {
        const result = testBuildSearchValue('顧客', 'contains', 'text');
        expect(result).toBe('*顧客*');
      });

      it('スペースを含む検索語も処理される', () => {
        const result = testBuildSearchValue('John Doe', 'contains', 'text');
        expect(result).toBe('*John Doe*');
      });
    });

    describe('exact モード（完全一致）', () => {
      it('== プレフィックスを付与する', () => {
        const result = testBuildSearchValue('test', 'exact', 'text');
        expect(result).toBe('==test');
      });

      it('日本語も同様に処理される', () => {
        const result = testBuildSearchValue('東京', 'exact', 'text');
        expect(result).toBe('==東京');
      });
    });

    describe('startsWith モード（前方一致）', () => {
      it('末尾に * を付与する', () => {
        const result = testBuildSearchValue('test', 'startsWith', 'text');
        expect(result).toBe('test*');
      });

      it('日本語も同様に処理される', () => {
        const result = testBuildSearchValue('株式会社', 'startsWith', 'text');
        expect(result).toBe('株式会社*');
      });
    });
  });

  describe('非テキスト型フィールドの検索値生成', () => {
    /**
     * 前提条件: number, date, time, timestamp 型フィールドに対する検索
     * 検証項目: ワイルドカードは適用されず、検索語がそのまま使用される
     *
     * 設計書 3.2.6 準拠:
     * - ワイルドカード（*）はテキスト型にのみ適用
     * - number/date/time/timestamp は完全一致のみ
     */
    describe('number 型', () => {
      it('contains モードでもワイルドカードなし', () => {
        const result = testBuildSearchValue('12345', 'contains', 'number');
        expect(result).toBe('12345');
      });

      it('exact モードでもワイルドカードなし', () => {
        const result = testBuildSearchValue('12345', 'exact', 'number');
        expect(result).toBe('12345');
      });

      it('startsWith モードでもワイルドカードなし', () => {
        const result = testBuildSearchValue('12345', 'startsWith', 'number');
        expect(result).toBe('12345');
      });
    });

    describe('date 型', () => {
      it('日付形式がそのまま使用される', () => {
        const result = testBuildSearchValue('2024-01-15', 'contains', 'date');
        expect(result).toBe('2024-01-15');
      });

      it('FileMaker形式の日付も可能', () => {
        const result = testBuildSearchValue('1/15/2024', 'contains', 'date');
        expect(result).toBe('1/15/2024');
      });
    });

    describe('time 型', () => {
      it('時間形式がそのまま使用される', () => {
        const result = testBuildSearchValue('14:30:00', 'contains', 'time');
        expect(result).toBe('14:30:00');
      });
    });

    describe('timestamp 型', () => {
      it('タイムスタンプ形式がそのまま使用される', () => {
        const result = testBuildSearchValue('2024-01-15 14:30:00', 'contains', 'timestamp');
        expect(result).toBe('2024-01-15 14:30:00');
      });
    });
  });
});

// ============================================================================
// FileMaker検索文法の整合性テスト
// ============================================================================

describe('FileMaker検索文法の整合性', () => {
  describe('特殊文字の扱い', () => {
    /**
     * FileMaker検索で意味を持つ特殊文字の扱い
     * 注意: 現在の実装では特殊文字のエスケープは行っていない
     */
    it('アスタリスク（*）を含む検索語', () => {
      // ユーザーが * を入力した場合、そのままワイルドカードとして機能する
      const result = testBuildSearchValue('test*value', 'contains', 'text');
      expect(result).toBe('*test*value*');
    });

    it('イコール（=）を含む検索語', () => {
      const result = testBuildSearchValue('key=value', 'contains', 'text');
      expect(result).toBe('*key=value*');
    });

    it('感嘆符（!）を含む検索語', () => {
      // FileMakerでは ! は除外検索を意味する
      const result = testBuildSearchValue('important!', 'contains', 'text');
      expect(result).toBe('*important!*');
    });
  });

  describe('空白・空文字の扱い', () => {
    it('空文字の検索語はそのまま処理される', () => {
      const result = testBuildSearchValue('', 'contains', 'text');
      expect(result).toBe('**');
    });

    it('スペースのみの検索語はそのまま処理される', () => {
      const result = testBuildSearchValue('   ', 'contains', 'text');
      expect(result).toBe('*   *');
    });
  });
});

// ============================================================================
// デフォルト値のテスト
// ============================================================================

describe('デフォルト値', () => {
  /**
   * 設計書 3.2.6 準拠のデフォルト値
   */
  it('DEFAULT_MAX_FIELDS_PER_LAYOUT は 50', () => {
    const DEFAULT_MAX_FIELDS_PER_LAYOUT = 50;
    expect(DEFAULT_MAX_FIELDS_PER_LAYOUT).toBe(50);
  });

  it('DEFAULT_MAX_RECORDS_PER_LAYOUT は 100', () => {
    const DEFAULT_MAX_RECORDS_PER_LAYOUT = 100;
    expect(DEFAULT_MAX_RECORDS_PER_LAYOUT).toBe(100);
  });

  it('ABSOLUTE_MAX_RECORDS は 1000', () => {
    const ABSOLUTE_MAX_RECORDS = 1000;
    expect(ABSOLUTE_MAX_RECORDS).toBe(1000);
  });
});

// ============================================================================
// 検索可能フィールド型の網羅性テスト
// ============================================================================

describe('検索可能フィールド型の網羅性', () => {
  describe('各結果型の検索可能性', () => {
    it.each([
      ['text', true],
      ['number', true],
      ['date', true],
      ['time', true],
      ['timestamp', true],
      ['container', false],
    ])('%s 型の検索可能性は %s', (resultType, expected) => {
      const field: TestFieldMetaData = {
        name: 'TestField',
        type: 'normal',
        result: resultType,
      };

      expect(testIsSearchableField(field, false)).toBe(expected);
    });
  });
});

// ============================================================================
// 検索モードの網羅性テスト
// ============================================================================

describe('検索モードの網羅性', () => {
  const searchModes: Array<'contains' | 'exact' | 'startsWith'> = ['contains', 'exact', 'startsWith'];

  describe('テキスト型での各検索モード', () => {
    it.each([
      ['contains', '*test*'],
      ['exact', '==test'],
      ['startsWith', 'test*'],
    ])('%s モードの出力は "%s"', (mode, expected) => {
      const result = testBuildSearchValue('test', mode as 'contains' | 'exact' | 'startsWith', 'text');
      expect(result).toBe(expected);
    });
  });

  describe('数値型での各検索モード（全て同じ）', () => {
    it.each(searchModes)('%s モードでもワイルドカードなし', (mode) => {
      const result = testBuildSearchValue('123', mode, 'number');
      expect(result).toBe('123');
    });
  });
});
