import ansiEscapes from "ansi-escapes";

let numLinesPrevLog = 0;

/**
 * Function to log and redraw lines
 * @param {string} message - The new log to be written
 * @returns {void}
 */
export function logAndRedraw(message) {
  console.log(message)
  // process.stdout.write(ansiEscapes.eraseLines(numLinesPrevLog));
  // process.stdout.write(message);
  // numLinesPrevLog = message.split("\n").length;
}
