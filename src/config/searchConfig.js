// Configuration for note search functionality
const SEARCH_CONFIG = {
    // Regex pattern for matching words including allowed characters
    WORD_PATTERN: /(?:\b|^)([A-Za-z0-9]+(?:[.\-_:()]*[A-Za-z0-9]+)*)(?=\b|$)/g,
    // Comparison options (true is case-insensitive, false is case-sensitive)
    CASE_INSENSITIVE: true,
    ALLOWEDCHARS: "A-Za-z0-9-_.(){}[]:;!?+=<>*/\\",
};

module.exports = {
    SEARCH_CONFIG
};