/**
 * Color text as yellow in terminal output
 * @param {string} text
 * @returns {string}
 */
export function yellow(text) {
  return `\x1b[33m${text}\x1b[0m`;
}
