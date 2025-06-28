/**
 * @constant
 * @type {object}
 * @description Configuration for the note search functionality
 */
const SEARCH_CONFIG = {
    /**
     * @property {RegExp} WORD_PATTERN
     * @description Regular expression pattern used for matching words in the editor.
     * @deprecated
     */
    WORD_PATTERN: /(?:\b|^)([A-Za-z0-9]+(?:[-_:]*[A-Za-z0-9]+)*)(?=\b|$)/g,

    /**
     * @property {RegExp} SMART_WORD_PATTERN
     * @description A more advanced regular expression pattern for matching words, including those with dots and dashes.
     * @example
     * SMART_WORD_PATTERN.test("example.word") // true
     * SMART_WORD_PATTERN.test("example-word") // true
     * SMART_WORD_PATTERN.test("example_word") // true
     */
    SMART_WORD_PATTERN: /[a-zA-Z0-9_]+(?:[\.-][a-zA-Z0-9_]+)*/g,

    /**
     * @property {string} ALLOWEDCHARS
     * @description A string containing characters that are EXPLICITLY ALLOWED within a "word". This is used in conjunction with `WORD_PATTERN`.
     */
    ALLOWEDCHARS: "A-Za-z0-9-_.(){}[]:;!?+=<>*/\\",

    // Comparison options (true is case-insensitive, false is case-sensitive)
    CASE_INSENSITIVE: true,
};

module.exports = {
    SEARCH_CONFIG
};