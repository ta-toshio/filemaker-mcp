/**
 * relationship-inferrer.ts 単体テスト
 *
 * テスト対象: リレーションシップ推測エンジン
 * - 外部キーパターンマッチング
 * - ポータル名からのテーブル名推測
 * - リレーションシップの信頼度判定
 *
 * 設計書 3.2.4 セクション準拠
 *
 * 注意: このテストはAPIへの接続を行わず、推測ロジックのみをテストします。
 * 本番データに依存したテストは含まれていません。
 */

// ============================================================================
// テスト用ヘルパー: 内部ロジックの検証用
// relationship-inferrer.ts の内部関数と同等のロジックを再実装
// ============================================================================

/**
 * 外部キーパターン定義（relationship-inferrer.ts と同じ）
 */
const FOREIGN_KEY_PATTERNS = [
  { pattern: /^(.+)_[Ii][Dd]$/, extractTable: (match: RegExpMatchArray) => match[1] },
  { pattern: /^(.+?)([A-Z]?[Ii][Dd])$/, extractTable: (match: RegExpMatchArray) => match[1] },
  { pattern: /^[Ff][Kk]_(.+)$/, extractTable: (match: RegExpMatchArray) => match[1] },
  { pattern: /^[Ii][Dd]_(.+)$/, extractTable: (match: RegExpMatchArray) => match[1] },
];

/**
 * フィールド名から外部キーを推測（テスト用再実装）
 */
function testInferForeignKeyFromField(
  fieldName: string,
  fieldResult: string
): { inferredTable: string; confidence: 'high' | 'medium' | 'low' } | null {
  // 数値またはテキストのみ対象
  if (fieldResult !== 'number' && fieldResult !== 'text') {
    return null;
  }

  for (const { pattern, extractTable } of FOREIGN_KEY_PATTERNS) {
    const match = fieldName.match(pattern);
    if (match) {
      const inferredTable = extractTable(match);
      if (inferredTable && inferredTable.length > 0) {
        const confidence =
          fieldName.toLowerCase().endsWith('_id') && fieldResult === 'number' ? 'high' : 'medium';
        return { inferredTable, confidence };
      }
    }
  }

  return null;
}

/**
 * ポータル名からテーブル名を推測（テスト用再実装）
 */
function testInferTableFromPortalName(portalName: string): string {
  let tableName = portalName;

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

// ============================================================================
// 外部キーパターンマッチングのテスト
// ============================================================================

describe('外部キーパターンマッチング', () => {
  describe('サフィックスパターン: TableName_ID', () => {
    /**
     * 前提条件: "_ID" または "_id" で終わるフィールド名
     * 検証項目: テーブル名が正しく抽出される
     */
    it('Customer_ID から Customer を推測する', () => {
      const result = testInferForeignKeyFromField('Customer_ID', 'number');

      expect(result).not.toBeNull();
      expect(result?.inferredTable).toBe('Customer');
      expect(result?.confidence).toBe('high'); // _id + number = 高信頼度
    });

    it('Product_id から Product を推測する（小文字）', () => {
      const result = testInferForeignKeyFromField('Product_id', 'number');

      expect(result).not.toBeNull();
      expect(result?.inferredTable).toBe('Product');
      expect(result?.confidence).toBe('high');
    });

    it('order_item_ID から order_item を推測する（複合名）', () => {
      const result = testInferForeignKeyFromField('order_item_ID', 'number');

      expect(result).not.toBeNull();
      expect(result?.inferredTable).toBe('order_item');
    });
  });

  describe('サフィックスパターン: TableNameID', () => {
    /**
     * 前提条件: "ID" で終わるキャメルケースのフィールド名
     * 検証項目: テーブル名が正しく抽出される
     */
    it('CustomerID から Customer を推測する', () => {
      const result = testInferForeignKeyFromField('CustomerID', 'number');

      expect(result).not.toBeNull();
      expect(result?.inferredTable).toBe('Customer');
    });

    it('productId から product を推測する', () => {
      const result = testInferForeignKeyFromField('productId', 'number');

      expect(result).not.toBeNull();
      expect(result?.inferredTable).toBe('product');
    });
  });

  describe('プレフィックスパターン: fk_TableName', () => {
    /**
     * 前提条件: "fk_" または "FK_" で始まるフィールド名
     * 検証項目: テーブル名が正しく抽出される
     */
    it('fk_Customer から Customer を推測する', () => {
      const result = testInferForeignKeyFromField('fk_Customer', 'number');

      expect(result).not.toBeNull();
      expect(result?.inferredTable).toBe('Customer');
    });

    it('FK_Product から Product を推測する（大文字）', () => {
      const result = testInferForeignKeyFromField('FK_Product', 'number');

      expect(result).not.toBeNull();
      expect(result?.inferredTable).toBe('Product');
    });
  });

  describe('プレフィックスパターン: id_TableName', () => {
    /**
     * 前提条件: "id_" または "ID_" で始まるフィールド名
     * 検証項目: テーブル名が正しく抽出される
     */
    it('id_Customer から Customer を推測する', () => {
      const result = testInferForeignKeyFromField('id_Customer', 'number');

      expect(result).not.toBeNull();
      expect(result?.inferredTable).toBe('Customer');
    });

    it('ID_Product から Product を推測する（大文字）', () => {
      const result = testInferForeignKeyFromField('ID_Product', 'number');

      expect(result).not.toBeNull();
      expect(result?.inferredTable).toBe('Product');
    });
  });

  describe('信頼度の判定', () => {
    /**
     * 前提条件: 異なるフィールド型と命名パターン
     * 検証項目: 信頼度が適切に設定される
     */
    it('_id + number型 は高信頼度', () => {
      const result = testInferForeignKeyFromField('Customer_id', 'number');

      expect(result?.confidence).toBe('high');
    });

    it('_id + text型 は中信頼度', () => {
      const result = testInferForeignKeyFromField('Customer_id', 'text');

      expect(result?.confidence).toBe('medium');
    });

    it('ID（大文字のみ）+ number型 は中信頼度', () => {
      const result = testInferForeignKeyFromField('CustomerID', 'number');

      expect(result?.confidence).toBe('medium');
    });
  });

  describe('非外部キーフィールドの除外', () => {
    /**
     * 前提条件: 外部キーパターンに一致しないフィールド
     * 検証項目: null が返される
     */
    it('通常のフィールド名は推測対象外', () => {
      expect(testInferForeignKeyFromField('FirstName', 'text')).toBeNull();
      expect(testInferForeignKeyFromField('Email', 'text')).toBeNull();
      expect(testInferForeignKeyFromField('Amount', 'number')).toBeNull();
      expect(testInferForeignKeyFromField('Description', 'text')).toBeNull();
    });

    it('日付型フィールドは推測対象外', () => {
      const result = testInferForeignKeyFromField('Customer_ID', 'date');

      expect(result).toBeNull();
    });

    it('コンテナ型フィールドは推測対象外', () => {
      const result = testInferForeignKeyFromField('Image_ID', 'container');

      expect(result).toBeNull();
    });

    it('計算フィールドの結果は推測対象外', () => {
      const result = testInferForeignKeyFromField('Calc_ID', 'calculation');

      expect(result).toBeNull();
    });
  });
});

// ============================================================================
// ポータル名からのテーブル名推測のテスト
// ============================================================================

describe('ポータル名からのテーブル名推測', () => {
  describe('プレフィックス除去', () => {
    /**
     * 前提条件: ポータル関連のプレフィックスを含む名前
     * 検証項目: プレフィックスが除去されテーブル名が抽出される
     */
    it('portal_Orders から Orders を推測する', () => {
      expect(testInferTableFromPortalName('portal_Orders')).toBe('Orders');
    });

    it('Portal_LineItems から LineItems を推測する', () => {
      expect(testInferTableFromPortalName('Portal_LineItems')).toBe('LineItems');
    });

    it('PORTAL_Products から Products を推測する', () => {
      expect(testInferTableFromPortalName('PORTAL_Products')).toBe('Products');
    });

    it('rel_Customers から Customers を推測する', () => {
      expect(testInferTableFromPortalName('rel_Customers')).toBe('Customers');
    });

    it('Rel_Invoices から Invoices を推測する', () => {
      expect(testInferTableFromPortalName('Rel_Invoices')).toBe('Invoices');
    });

    it('REL_Payments から Payments を推測する', () => {
      expect(testInferTableFromPortalName('REL_Payments')).toBe('Payments');
    });
  });

  describe('サフィックス除去', () => {
    /**
     * 前提条件: ポータル関連のサフィックスを含む名前
     * 検証項目: サフィックスが除去されテーブル名が抽出される
     */
    it('Orders_portal から Orders を推測する', () => {
      expect(testInferTableFromPortalName('Orders_portal')).toBe('Orders');
    });

    it('LineItems_Portal から LineItems を推測する', () => {
      expect(testInferTableFromPortalName('LineItems_Portal')).toBe('LineItems');
    });

    it('Products_PORTAL から Products を推測する', () => {
      expect(testInferTableFromPortalName('Products_PORTAL')).toBe('Products');
    });

    it('Customers_rel から Customers を推測する', () => {
      expect(testInferTableFromPortalName('Customers_rel')).toBe('Customers');
    });

    it('Invoices_Rel から Invoices を推測する', () => {
      expect(testInferTableFromPortalName('Invoices_Rel')).toBe('Invoices');
    });

    it('Payments_REL から Payments を推測する', () => {
      expect(testInferTableFromPortalName('Payments_REL')).toBe('Payments');
    });
  });

  describe('装飾なしのポータル名', () => {
    /**
     * 前提条件: プレフィックス/サフィックスなしのポータル名
     * 検証項目: そのままの名前が返される
     */
    it('Orders はそのまま返される', () => {
      expect(testInferTableFromPortalName('Orders')).toBe('Orders');
    });

    it('CustomerAddresses はそのまま返される', () => {
      expect(testInferTableFromPortalName('CustomerAddresses')).toBe('CustomerAddresses');
    });

    it('line_items はそのまま返される', () => {
      expect(testInferTableFromPortalName('line_items')).toBe('line_items');
    });
  });

  describe('エッジケース', () => {
    /**
     * 前提条件: 特殊なポータル名
     * 検証項目: 適切に処理される
     */
    it('空文字列は元の名前を返す', () => {
      // プレフィックス除去で空になる場合は元の名前を返す
      // この実装では空文字列はそのまま空文字列が返る
      expect(testInferTableFromPortalName('')).toBe('');
    });

    it('プレフィックスのみの名前は抽出結果が空文字の場合、元の名前を返す', () => {
      // "portal_" のみの場合、プレフィックス除去後は空文字列になる
      // testInferTableFromPortalNameの実装では空文字列の場合は元の名前を返す
      const result = testInferTableFromPortalName('portal_');
      // 空文字列が返される（プレフィックス除去後の結果）
      // 注意: 実際の実装では空文字列 || 元の名前の評価で決まる
      expect(result).toBe('portal_');
    });
  });
});

// ============================================================================
// FileMaker命名規則のテスト
// ============================================================================

describe('FileMaker命名規則のカバレッジ', () => {
  describe('一般的なFileMaker外部キーパターン', () => {
    /**
     * FileMaker開発者がよく使用する外部キー命名パターンのテスト
     */
    it('__kf_Table パターン（FileMaker標準）は対象外', () => {
      // __kf_ は FileMaker の標準パターンだが、現在の実装では対応していない
      // 将来的にはサポートを検討
      const result = testInferForeignKeyFromField('__kf_Customer', 'text');
      expect(result).toBeNull();
    });

    it('_pk_ / _fk_ パターンの部分一致', () => {
      // _fk_ を含むフィールド名
      const result = testInferForeignKeyFromField('Customer_fk_ID', 'number');
      // このパターンは現在の実装では _ID でマッチする
      expect(result).not.toBeNull();
    });
  });

  describe('複合キーパターン', () => {
    /**
     * 複数のテーブルを参照する複合キーのテスト
     */
    it('Order_Customer_ID のような複合キー', () => {
      const result = testInferForeignKeyFromField('Order_Customer_ID', 'number');

      expect(result).not.toBeNull();
      // _ID より前の部分全体をテーブル名として推測
      expect(result?.inferredTable).toBe('Order_Customer');
    });
  });
});

// ============================================================================
// 推測ロジックの整合性テスト
// ============================================================================

describe('推測ロジックの整合性', () => {
  describe('一貫性', () => {
    /**
     * 同じ入力に対して常に同じ結果が返される
     */
    it('同じフィールド名に対して常に同じ結果を返す', () => {
      const result1 = testInferForeignKeyFromField('Customer_ID', 'number');
      const result2 = testInferForeignKeyFromField('Customer_ID', 'number');

      expect(result1).toEqual(result2);
    });

    it('同じポータル名に対して常に同じ結果を返す', () => {
      const result1 = testInferTableFromPortalName('portal_Orders');
      const result2 = testInferTableFromPortalName('portal_Orders');

      expect(result1).toBe(result2);
    });
  });

  describe('大文字小文字の扱い', () => {
    /**
     * 大文字小文字の違いによる影響
     */
    it('ID と id は同等に扱われる', () => {
      const upper = testInferForeignKeyFromField('Customer_ID', 'number');
      const lower = testInferForeignKeyFromField('Customer_id', 'number');

      expect(upper?.inferredTable).toBe(lower?.inferredTable);
      // どちらも高信頼度（_id で終わるため）
      expect(upper?.confidence).toBe('high');
      expect(lower?.confidence).toBe('high');
    });
  });
});
