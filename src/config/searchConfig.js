/**
 * @constant
 * @type {object}
 * @description Configuration for the note search functionality
 */
const SEARCH_CONFIG = {
    /**
     * @property {RegExp} WORD_PATTERN
     * @description Regular expression pattern used for matching words in the editor.
     */
    WORD_PATTERN: /(?:\b|^)([A-Za-z0-9]+(?:[-_:]*[A-Za-z0-9]+)*)(?=\b|$)/g,

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