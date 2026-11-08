/**
 * Brazilian currency formatter — "R$ 1.234,56"
 * Uses Intl.NumberFormat with pt-BR locale for correct
 * decimal comma and thousands dot.
 */
const currencyFmt = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const currencyFmtInt = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/**
 * Format a number as Brazilian Real.
 * @param {number} value
 * @param {boolean} decimals — true for "R$ 866,34", false for "R$ 866"
 * @returns {string}
 */
export function formatBRL(value, decimals = true) {
  if (value == null || isNaN(value)) return "R$ 0,00";
  return decimals ? currencyFmt.format(value) : currencyFmtInt.format(value);
}