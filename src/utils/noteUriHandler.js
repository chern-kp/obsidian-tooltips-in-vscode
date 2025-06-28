const path = require('path');
const { log } = require('./logging');

/**
 * FUNC - Creates an Obsidian URI for a given note path within a vault.
 * The URI format is `obsidian://vault/VaultName/Path/To/Note`
 *
 * @param {string} vaultPath The full file system path to the Obsidian vault.
 * @param {string} notePath The full file system path to the specific Markdown note.
 * @returns {string|null} The generated Obsidian URI string, or `null` if an error occurs.
 */
function createObsidianUri(vaultPath, notePath) {
    try {
        // Extract the vault name from the vault's full path
        const vaultName = path.basename(vaultPath);

        // Normalize path separators to '/'
        const relativePath = notePath.replace(/\\/g, "/");

        // Remove the '.md' extension from the note path for the URI
        const notePathWithoutExt = relativePath.replace(/\.md$/, "");

        // Encode both the vault name and the note path components to be URL-safe
        const encodedVault = encodeURIComponent(vaultName);
        const encodedFile = encodeURIComponent(notePathWithoutExt);

        // Create the Obsidian URI using the shorthand format
        const uri = `obsidian://vault/${encodedVault}/${encodedFile}`;

        log(`Generated Obsidian URI: ${uri}`);
        return uri;
    } catch (error) {
        log(`Error creating Obsidian URI: ${error.message}`);
        return null;
    }
}

module.exports = {
    createObsidianUri
};