// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  computeLineTaxKobo,
  computeRestockMovingWac,
  formatKobo,
  formatMilliQty,
  multiplyQtyByKobo,
  parseMoneyToKobo,
  parseQtyToMilli,
  parseTaxRatePercent,
  resolveEffectiveWacKobo,
  sanitizeCsvCell,
} from '../../server/lib/money.ts';

describe('Stage 08 Authoritative Money, Tax (D-03), Moving WAC (D-04) & CSV Safety', () => {
  it('computes exact minor-unit kobo math without floating-point drift', () => {
    const unitPrice = parseMoneyToKobo('199.99');
    const qty = parseQtyToMilli('3.500');
    const total = multiplyQtyByKobo(qty, unitPrice);
    expect(formatKobo(total)).toBe('699.97');

    // Classic IEEE-754 trap: 0.10 + 0.20 === 0.30 exactly
    expect(formatKobo(parseMoneyToKobo('0.10') + parseMoneyToKobo('0.20'))).toBe('0.30');
  });

  it('calculates exclusive and inclusive VAT accurately under D-03', () => {
    const rate = parseTaxRatePercent('7.5'); // 7.5000%
    const excl = computeLineTaxKobo(parseMoneyToKobo('1000.00'), rate, 'exclusive');
    expect(formatKobo(excl.subtotalExTaxKobo)).toBe('1000.00');
    expect(formatKobo(excl.taxKobo)).toBe('75.00');
    expect(formatKobo(excl.totalKobo)).toBe('1075.00');

    const incl = computeLineTaxKobo(parseMoneyToKobo('1075.00'), rate, 'inclusive');
    expect(formatKobo(incl.subtotalExTaxKobo)).toBe('1000.00');
    expect(formatKobo(incl.taxKobo)).toBe('75.00');
    expect(formatKobo(incl.totalKobo)).toBe('1075.00');
  });

  it('implements D-04 Moving WAC and last_positive_wac freeze across restock and oversell recovery', () => {
    // 10 units @ 500 + 10 units @ 700 => 20 units @ 600
    const r1 = computeRestockMovingWac({
      currentOnHandMilli: parseQtyToMilli('10'),
      currentWacKobo: parseMoneyToKobo('500.00'),
      lastPositiveWacKobo: parseMoneyToKobo('500.00'),
      receivedQtyMilli: parseQtyToMilli('10'),
      unitCostKobo: parseMoneyToKobo('700.00'),
    });
    expect(formatMilliQty(r1.newOnHandMilli)).toBe('20.000');
    expect(formatKobo(r1.newWacKobo)).toBe('600.00');
    expect(formatKobo(r1.newLastPositiveWacKobo)).toBe('600.00');

    // Freeze rule: when currentWac hits 0, effective WAC falls back to last_positive_wac
    expect(formatKobo(resolveEffectiveWacKobo(0n, parseMoneyToKobo('600.00')))).toBe('600.00');

    // Oversell recovery: onHand = -3, restock 10 @ 800 => net +7, WAC anchors to 800
    const r2 = computeRestockMovingWac({
      currentOnHandMilli: -parseQtyToMilli('3'),
      currentWacKobo: parseMoneyToKobo('600.00'),
      lastPositiveWacKobo: parseMoneyToKobo('600.00'),
      receivedQtyMilli: parseQtyToMilli('10'),
      unitCostKobo: parseMoneyToKobo('800.00'),
    });
    expect(formatMilliQty(r2.newOnHandMilli)).toBe('7.000');
    expect(formatKobo(r2.newWacKobo)).toBe('800.00');
  });

  it('neutralizes CSV spreadsheet formula injection payloads', () => {
    expect(sanitizeCsvCell('=CMD("calc")')).toBe('"\'=CMD(""calc"")"');
    expect(sanitizeCsvCell('+1+2')).toBe('"\'+1+2"');
    expect(sanitizeCsvCell('-500')).toBe('"\'-500"');
    expect(sanitizeCsvCell('@SUM(A1:A5)')).toBe('"\'@SUM(A1:A5)"');
    expect(sanitizeCsvCell('Normal Product')).toBe('"Normal Product"');
  });
});
