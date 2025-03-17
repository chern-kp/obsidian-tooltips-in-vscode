const path = require('path');
const { log } = require('./logging');

//FUNC - Create an Obsidian URI for a note path
function createObsidianUri(vaultPath, notePath) {
    try {
        // Get vault name from path
        const vaultName = path.basename(vaultPath);

        // Prepare the note path relative to vault root
        const relativePath = notePath.replace(/\\/g, "/"); // Normalize path separators

        // Remove .md extension if present
        const notePathWithoutExt = relativePath.replace(/\.md$/, "");

        // Encode both vault name and note path
        const encodedVault = encodeURIComponent(vaultName);
        const encodedFile = encodeURIComponent(notePathWithoutExt);

        // Create the URI using the shorthand format
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