/**
 * Regex to match and remove trailing special characters from a string.
 * @type {RegExp}
 */
const TRAILING_CHARS_REGEX = /[\(\)\[\];:]+$/g;

/**
 * Normalizes a string by trimming whitespace, converting to lowercase, and removing trailing special characters.
 * @param {*} key Initial string to normalize.
 * @example
 * normalize("  Hello World!  "); // "hello world"
 * @returns {string} The normalized string.
 */
export function normalize(key) {
    if (!key) return '';
    return key.toLowerCase().replace(TRAILING_CHARS_REGEX, '').trim();
}