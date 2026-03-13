/**
 * Creates a canonical key for indexing in the lookupCache's top level.
 * @param {string} key The original string from a filename or alias.
 * @returns {string} The canonical key.
 */
function canonicalNormalize(key) {
    if (typeof key !== 'string' || !key) return '';

    // NFC handles accented letters consistently.
    let normalized = key.toLowerCase().normalize('NFC');

    try {
        /**
         * Attempt to use modern Unicode Property Escapes (ES2018+).
         * \p{L} - Any kind of letter from any language.
         * \p{N} - Any kind of numeric character.
         * Using RegExp constructor to prevent boot-time syntax errors in older environments.
         */
        const unicodeRegex = new RegExp('[^\\p{L}\\p{N}]', 'gu');
        return normalized.replace(unicodeRegex, '');
    } catch (e) {
        /**
         * FALLBACK:
         * If the environment does not support Unicode Property Escapes,
         * we use a safe fallback that removes common symbols and whitespace.
         */
        return normalized
            .replace(/[\s\t\n\r_]+/g, '') // Remove whitespace and underscores
            .replace(/[^\w\u00C0-\u024F\u0400-\u04FF]+/g, ''); // Remove non-alphanumeric chars for Latin and Cyrillic
    }
}

module.exports = {
    canonicalNormalize
};