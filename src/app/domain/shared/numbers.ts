export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function isNonNegativeInteger(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

export function isNonNegativeNumber(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

export function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Arredonda para cima ignorando o ruído de ponto flutuante: 0.625 * 72 dá
 * 45.00000000000001, e um `Math.ceil` direto mandaria um litro a mais.
 * Zero sai positivo: `Math.ceil(-1e-9)` é `-0`, que a formatação exibe como "-0".
 */
export function ceilSafe(value: number): number {
  const result = Math.ceil(value - 1e-9);
  return result === 0 ? 0 : result;
}

export function ceilToMultiple(value: number, multiple: number): number {
  return ceilSafe(value / multiple) * multiple;
}
