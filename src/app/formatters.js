/** @param {unknown} value */
export function formatPrice(value) {
  return `$${Number(value).toFixed(2)}`;
}
