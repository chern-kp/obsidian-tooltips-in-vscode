/**
 * Creates a canonical key for indexing in the lookupCache's top level.
 * @param {string} key The original string from a filename or alias.
 * @returns {string} The canonical key.
 */
function canonicalNormalize(key) {
    if (typeof key !== 'string' || !key) return '';
    return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}


module.exports = {
    canonicalNormalize
};