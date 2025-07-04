/**
 * @constant
 * @type {object}
 * @description Provides language-specific configurations for token search.
 */
const SEARCH_CONFIG = {
    /**
     * @property {object} LANGUAGE_PATTERNS
     * @description A collection of regular expression patterns tailored for specific languages
     * to accurately determine the boundaries of a "word" or "token" under the cursor.
     * This is the core component for the token extraction logic.
     */
    LANGUAGE_PATTERNS: {
        // "A word is any sequence of letters, numbers, underscores, dots, colons, parentheses, and hyphens". It's greedy and works well with VS Code's `getWordRangeAtPosition`.
        javascript: /[\w.:\(\)-]+/,
        typescript: /[\w.:\(\)-]+/,

        // For CSS, we don't need parentheses.
        css: /[\w:.-]+/,
        scss: /[\w:.-]+/,

        // For HTML, we mostly care about letters, numbers, and hyphens (for class names).
        html: /[\w-]+/,

        // A safe default for any other languages.
        default: /[\w.-]+/
    },

    /**
     * @property {boolean}
     * @description Defines the default case sensitivity for searches.
     * The actual search logic might override this based on context.
     */
    CASE_INSENSITIVE: true,
};

module.exports = {
    SEARCH_CONFIG
};