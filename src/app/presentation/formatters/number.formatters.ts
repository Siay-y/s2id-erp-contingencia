const integerFormat = new Intl.NumberFormat('pt-BR');
const decimalFormat = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

export function formatInteger(value: number): string {
  return integerFormat.format(value);
}

export function formatDecimal(value: number): string {
  return decimalFormat.format(value);
}

/** Horas acima de 99 perdem a casa decimal: "125 h" lê melhor que "125,4 h". */
export function formatHours(hours: number): string {
  return `${hours >= 99 ? formatInteger(Math.round(hours)) : formatDecimal(hours)} h`;
}

export function plural(count: number, singular: string, pluralForm: string): string {
  return `${formatInteger(count)} ${count === 1 ? singular : pluralForm}`;
}

/** "a", "a e b", "a, b e c". */
export function joinWithAnd(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} e ${items.at(-1)}`;
}
