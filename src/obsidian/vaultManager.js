const vscode = require('vscode');
const path = require('path');
const { log } = require('../utils/logging');
const { isVaultModified } = require('./fetcher');
const { loadVaultNotes } = require('./vaultSearch');
const { saveCache } = require('../utils/cache');

//FUNC - Update list of notes and aliases for the connected vault (or don't if up to date)
async function updateNotesInformation(vaultPath, force, vscodeContext, notesCache, lastUpdateTime, selectedDirectories) {
    try {
        log("Checking if notes information update is needed");

        // Skip update if vault hasn't been modified
        if (!force && !(await isVaultModified(vaultPath))) {
            const message = "Vault is up to date, skipping scan";
            log(message);
            vscode.window.showInformationMessage(message);
            return;
        }

        log("Starting notes information update");
        const notes = await loadVaultNotes(vaultPath, selectedDirectories);

        // Update cache with new notes information
        notesCache.clear();
        notes.forEach((note) => {
            const relativePath = path.relative(vaultPath, note.path);
            notesCache.set(relativePath, {
                fullPath: note.path,
                aliases: note.aliases,
                uri: note.uri,
            });
        });
        // Update last update time
        lastUpdateTime = Date.now();
        // Save cache to file
        try {
            await saveCache(vscodeContext, notesCache, lastUpdateTime, log);
            log("Cache saved successfully");
        } catch (error) {
            log(`Warning: Failed to save cache: ${error.message}`);
            // Continue execution even if cache save fails
        }

        // Log results
        //STUB - List all notes and aliases in the output channel
        log(`\nUpdated information for ${notes.length} notes:`);
        notesCache.forEach((noteInfo, relativePath) => {
            log(`→ ${relativePath}`);
            if (noteInfo.aliases.length > 0) {
                log(`  Aliases: ${noteInfo.aliases.join(", ")}`);
            }
        });

        vscode.window.showInformationMessage(
            `Updated information for ${notes.length} notes`
        );
        log("Notes information update completed");
    } catch (error) {
        const errorMessage = `Failed to update notes information: ${error.message}`;
        log(errorMessage);
        vscode.window.showErrorMessage(errorMessage);
        throw error;
    }
}

module.exports = {
    updateNotesInformation
};