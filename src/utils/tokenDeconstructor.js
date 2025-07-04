/**
 * Deconstructs a complex token from any language into a prioritized list of candidates.
 * Handles '.', ':', and '::' as separators to support JavaScript, CSS, and other languages.
 *
 * @param {string} token - The token extracted from the code (e.g., "document.querySelector", "btn:hover").
 * @returns {string[]} An array of unique candidate strings, sorted from most specific (longest) to least specific (shortest).
 * @example
 * deconstructToken("a.b.c"); // returns ['a.b.c', 'b.c', 'c']
 * deconstructToken("btn:hover"); // returns ['btn:hover', 'hover']
 * deconstructToken("p::before"); // returns ['p::before', 'before']
 */
function deconstructToken(token) {
    if (!token) {
        return [];
    }

    // Use a Set to handle uniqueness of candidates. The original token is always the first and most important candidate.
    const candidates = new Set([token]);

    // This regex finds any of our supported separators.
    const separators = new RegExp('\\.|::|:', 'g');
    let match;

    // Find each separator in the string.
    while ((match = separators.exec(token)) !== null) {
        // And add the "tail" of the string after it as a new candidate.
        candidates.add(token.substring(match.index + match[0].length));
    }

    // Convert the Set to an array and sort it by length in descending order. This ensures the most specific candidates are always checked first.
    return [...candidates].sort((a, b) => b.length - a.length);
}

module.exports = {
    deconstructToken
};