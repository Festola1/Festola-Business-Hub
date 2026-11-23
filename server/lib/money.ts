import { ApiError } from '../middleware/error-handler.ts';
import type { TaxMode } from '../modules/identity/identity.types.ts';

const MONEY_SCALE = 100n;
const QTY_SCALE = 1000n;
const RATE_SCALE = 10_000n; // 1.0000% = 10_000n; 100.0000% = 1_000_000n

/**
 * Exact scaled-integer parser converting decimal strings/numbers into BigInt
 * without IEEE-754 floating-point drift.
 */
function parseScaledDecimal(
  input: string | number,
  decimals: number,
  label: string,
  allowNegative = false,
): bigint {
  const raw = typeof input === 'number' ? input.toFixed(decimals) : input.trim();
  const pattern = allowNegative ? /^-?\d+(\.\d+)?$/ : /^\d+(\.\d+)?$/;
  if (!pattern.test(raw)) {
    throw new ApiError(400, 'VALIDATION_ERROR', `${label} must be a valid decimal value.`);
  }

  const negative = raw.startsWith('-');
  const unsigned = negative ? raw.slice(1) : raw;
  const [wholePart = '0', fracPart = ''] = unsigned.split('.');

  if (fracPart.length > decimals) {
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      `${label} supports at most ${decimals} decimal places.`,
    );
  }

  const paddedFrac = fracPart.padEnd(decimals, '0');
  const scale = 10n ** BigInt(decimals);
  const value = BigInt(wholePart) * scale + BigInt(paddedFrac || '0');
  return negative ? -value : value;
}

function formatScaledDecimal(value: bigint, decimals: number): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const scale = 10n ** BigInt(decimals);
  const whole = abs / scale;
  const frac = (abs % scale).toString().padStart(decimals, '0');
  return `${negative ? '-' : ''}${whole.toString()}.${frac}`;
}

/**
 * Exact half-up integer division for positive or negative numerators and positive denominator.
 */
export function divideRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Division denominator must be positive.');
  }
  const negative = numerator < 0n;
  const absNum = negative ? -numerator : numerator;
  const quotient = (absNum + denominator / 2n) / denominator;
  return negative ? -quotient : quotient;
}

export function parseMoneyToKobo(input: string | number, label = 'amount'): bigint {
  return parseScaledDecimal(input, 2, label, false);
}

export function parseSignedMoneyToKobo(input: string | number, label = 'amount'): bigint {
  return parseScaledDecimal(input, 2, label, true);
}

export function formatKobo(kobo: bigint): string {
  return formatScaledDecimal(kobo, 2);
}

export function parseQtyToMilli(input: string | number, label = 'quantity'): bigint {
  return parseScaledDecimal(input, 3, label, false);
}

export function parseSignedQtyToMilli(input: string | number, label = 'quantity'): bigint {
  return parseScaledDecimal(input, 3, label, true);
}

export function formatMilliQty(milli: bigint): string {
  return formatScaledDecimal(milli, 3);
}

export function parseTaxRatePercent(input: string | number, label = 'taxRate'): bigint {
  const scaled = parseScaledDecimal(input, 4, label, false);
  if (scaled > 100n * RATE_SCALE) {
    throw new ApiError(400, 'VALIDATION_ERROR', `${label} cannot exceed 100%.`);
  }
  return scaled;
}

export function formatTaxRatePercent(scaled: bigint): string {
  return formatScaledDecimal(scaled, 4);
}

/**
 * Multiplies a 3-decimal quantity (milli-units) by a 2-decimal unit price (kobo)
 * returning exact rounded 2-decimal kobo.
 */
export function multiplyQtyByKobo(qtyMilli: bigint, unitKobo: bigint): bigint {
  return divideRoundHalfUp(qtyMilli * unitKobo, QTY_SCALE);
}

/**
 * Computes tax for a net line amount in kobo under D-03 tax rules.
 * - Exclusive: tax = round(net * rate / 100), total = net + tax
 * - Inclusive: tax = round(net * rate / (100 + rate)), subtotalExTax = net - tax, total = net
 */
export function computeLineTaxKobo(
  netAmountKobo: bigint,
  taxRateScaled10000: bigint,
  taxMode: TaxMode,
): { subtotalExTaxKobo: bigint; taxKobo: bigint; totalKobo: bigint } {
  if (netAmountKobo <= 0n || taxRateScaled10000 <= 0n) {
    return {
      subtotalExTaxKobo: netAmountKobo,
      taxKobo: 0n,
      totalKobo: netAmountKobo,
    };
  }

  const hundredPercent = 100n * RATE_SCALE;
  if (taxMode === 'exclusive') {
    const taxKobo = divideRoundHalfUp(netAmountKobo * taxRateScaled10000, hundredPercent);
    return {
      subtotalExTaxKobo: netAmountKobo,
      taxKobo,
      totalKobo: netAmountKobo + taxKobo,
    };
  }

  const taxKobo = divideRoundHalfUp(
    netAmountKobo * taxRateScaled10000,
    hundredPercent + taxRateScaled10000,
  );
  return {
    subtotalExTaxKobo: netAmountKobo - taxKobo,
    taxKobo,
    totalKobo: netAmountKobo,
  };
}

/**
 * Implements D-04 Moving Weighted Average Cost (WAC) with `last_positive_wac` freeze:
 * - On restock when currentOnHand >= 0:
 *     newWac = ((onHand * currentWac) + (receivedQty * unitCost)) / (onHand + receivedQty)
 * - On restock when currentOnHand < 0 (recovering from offline oversell):
 *     if net stock becomes > 0, WAC anchors to the fresh inbound unitCost;
 *     if net stock stays <= 0, WAC stays frozen at lastPositiveWac (or unitCost if 0).
 */
export function computeRestockMovingWac(params: {
  currentOnHandMilli: bigint;
  currentWacKobo: bigint;
  lastPositiveWacKobo: bigint;
  receivedQtyMilli: bigint;
  unitCostKobo: bigint;
}): {
  newOnHandMilli: bigint;
  newWacKobo: bigint;
  newLastPositiveWacKobo: bigint;
} {
  const {
    currentOnHandMilli,
    currentWacKobo,
    lastPositiveWacKobo,
    receivedQtyMilli,
    unitCostKobo,
  } = params;

  const newOnHandMilli = currentOnHandMilli + receivedQtyMilli;

  if (currentOnHandMilli < 0n) {
    if (newOnHandMilli > 0n) {
      return {
        newOnHandMilli,
        newWacKobo: unitCostKobo,
        newLastPositiveWacKobo: unitCostKobo,
      };
    }
    const frozen = lastPositiveWacKobo > 0n ? lastPositiveWacKobo : unitCostKobo;
    return {
      newOnHandMilli,
      newWacKobo: frozen,
      newLastPositiveWacKobo: frozen,
    };
  }

  const totalQtyMilli = currentOnHandMilli + receivedQtyMilli;
  if (totalQtyMilli <= 0n) {
    return {
      newOnHandMilli,
      newWacKobo: lastPositiveWacKobo,
      newLastPositiveWacKobo: lastPositiveWacKobo,
    };
  }

  const existingValueScaled = currentOnHandMilli * currentWacKobo;
  const inboundValueScaled = receivedQtyMilli * unitCostKobo;
  const newWacKobo = divideRoundHalfUp(existingValueScaled + inboundValueScaled, totalQtyMilli);

  return {
    newOnHandMilli,
    newWacKobo,
    newLastPositiveWacKobo: newWacKobo > 0n ? newWacKobo : lastPositiveWacKobo,
  };
}

/**
 * Implements D-04 post-sale/adjustment WAC freeze:
 * When on_hand reaches <= 0, current WAC freezes to last_positive_wac so COGS never resets to 0.
 */
export function resolveEffectiveWacKobo(
  currentWacKobo: bigint,
  lastPositiveWacKobo: bigint,
): bigint {
  if (currentWacKobo > 0n) {
    return currentWacKobo;
  }
  return lastPositiveWacKobo;
}

/**
 * Neutralizes spreadsheet CSV formula injection (=, +, -, @, tab, CR) and quotes safely.
 */
export function sanitizeCsvCell(value: unknown): string {
  const raw = value === null || value === undefined ? '' : String(value);
  const trimmedLeading = raw.replace(/^[\t\r\n]+/, '');
  const needsPrefix =
    trimmedLeading.startsWith('=') ||
    trimmedLeading.startsWith('+') ||
    trimmedLeading.startsWith('-') ||
    trimmedLeading.startsWith('@');
  const safe = needsPrefix ? `'${raw}` : raw;
  const escaped = safe.replace(/"/g, '""');
  return `"${escaped}"`;
}

export { MONEY_SCALE, QTY_SCALE, RATE_SCALE };
