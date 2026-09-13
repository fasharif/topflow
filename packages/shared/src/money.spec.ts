import {
  applyRate,
  calculateLine,
  calculateTotals,
  formatMoney,
  fromFils,
  grossFromNet,
  percentToBps,
  toFils,
} from './money';

describe('money', () => {
  describe('toFils / fromFils', () => {
    it.each([
      ['45.5', 4550],
      ['45.50', 4550],
      ['1234', 123400],
      ['0.005', 1],
      ['0.004', 0],
      ['-1.25', -125],
    ])('parses %s as %d fils', (input, expected) => {
      expect(toFils(input)).toBe(expected);
    });

    it('accepts numbers and Decimal-like objects', () => {
      expect(toFils(45.5)).toBe(4550);
      expect(toFils({ toString: () => '12.30' })).toBe(1230);
    });

    it('rejects malformed input', () => {
      expect(() => toFils('12,50')).toThrow(RangeError);
      expect(() => toFils('abc')).toThrow(RangeError);
    });

    it('avoids binary floating point drift (0.1 + 0.2 = 0.3)', () => {
      expect(toFils('0.1') + toFils('0.2')).toBe(toFils('0.3'));
    });

    it.each([
      [4550, '45.50'],
      [5, '0.05'],
      [0, '0.00'],
      [-125, '-1.25'],
    ])('formats %d fils as %s', (fils, expected) => {
      expect(fromFils(fils)).toBe(expected);
    });
  });

  describe('rates', () => {
    it('rounds half-up', () => {
      expect(applyRate(10_000, 500)).toBe(500);
      expect(applyRate(10, 500)).toBe(1);
      expect(applyRate(9, 500)).toBe(0);
    });

    it('converts percentages to basis points', () => {
      expect(percentToBps('12.5')).toBe(1250);
      expect(percentToBps(5)).toBe(500);
    });

    it('computes VAT-inclusive retail prices', () => {
      expect(grossFromNet(4550)).toBe(4778);
    });
  });

  describe('calculateLine', () => {
    it('prices a line with 5% VAT', () => {
      expect(calculateLine({ listPriceFils: 4550, quantity: 3 })).toEqual({
        listPriceFils: 4550,
        unitPriceFils: 4550,
        quantity: 3,
        discountBps: 0,
        discountFils: 0,
        lineSubtotalFils: 13650,
        vatFils: 683,
        lineTotalFils: 14333,
      });
    });

    it('applies a trade discount before VAT', () => {
      const line = calculateLine({ listPriceFils: 4550, quantity: 2, discountBps: 1000 });
      expect(line.unitPriceFils).toBe(4095);
      expect(line.lineSubtotalFils).toBe(8190);
      expect(line.discountFils).toBe(910);
      expect(line.vatFils).toBe(410);
    });

    it('rejects invalid quantities and discounts', () => {
      expect(() => calculateLine({ listPriceFils: 100, quantity: 0 })).toThrow(RangeError);
      expect(() => calculateLine({ listPriceFils: 100, quantity: 1.5 })).toThrow(RangeError);
      expect(() => calculateLine({ listPriceFils: 100, quantity: 1, discountBps: 10_001 })).toThrow(
        RangeError,
      );
    });
  });

  describe('calculateTotals', () => {
    it('sums lines and charges VAT on delivery', () => {
      const totals = calculateTotals(
        [
          { listPriceFils: 4550, quantity: 2 },
          { listPriceFils: 1200, quantity: 1 },
        ],
        { deliveryFeeFils: 2500 },
      );
      expect(totals.subtotalFils).toBe(10300);
      expect(totals.vatFils).toBe(455 + 60 + 125);
      expect(totals.totalFils).toBe(10300 + 2500 + 640);
    });

    it('supports VAT-free documents (legacy v1 orders)', () => {
      const totals = calculateTotals([{ listPriceFils: 10300, quantity: 1 }], { vatRateBps: 0 });
      expect(totals.vatFils).toBe(0);
      expect(totals.totalFils).toBe(10300);
    });
  });

  it('formats AED amounts', () => {
    expect(formatMoney(123450)).toBe('AED 1,234.50');
    expect(formatMoney('45.5')).toBe('AED 45.50');
  });
});
