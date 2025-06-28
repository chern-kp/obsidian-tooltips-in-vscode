const vscode = require('vscode');
const path = require('path');
const { log } = require('../utils/logging');
const { isVaultModified } = require('./noteFetcher');
const { loadVaultNotes } = require('./noteSearch');
const { saveCache } = require('../utils/cache');

/**
 * FUNC - Updates the list of notes and aliases for the connected Obsidian vault.
 * This function scans the vault (or selected directories within it) for Markdown files,
 * extracts their information, updates the in cache, and saves it locally.
 * It can be forced to update, or will check if the vault has been modified since the last update.
 *
 * @param {string} vaultPath The full path to the connected Obsidian vault.
 * @param {boolean} force If `true`, forces an update regardless of modification status.
 * @param {vscode.ExtensionContext} vscodeContext The VS Code extension context.
 * @param {Map<string, object>} notesCache A Map to store cached notes information.
 * @param {number} lastUpdateTime The timestamp of the last notes update.
 * @param {Set<string>} selectedDirectories A Set of directories to scan within the vault.
 * @returns {Promise<{notesCache: Map<string, object>, lastUpdateTime: number}>} A Promise that resolves with the updated notes cache and last update time.
 * @throws {Error} If the update process fails.
 */
async function updateNotesInformation(vaultPath, force, vscodeContext, notesCache, lastUpdateTime, selectedDirectories) {
    try {
        log(`Starting updateNotesInformation with vault: ${vaultPath}`);
        log(`Force update: ${force}`);
        log(`Current notesCache size: ${notesCache.size}`);
        log(`Last update time: ${new Date(lastUpdateTime).toLocaleString()}`);
        log(`Selected directories: ${Array.from(selectedDirectories).join(", ")}`);

        if (!vaultPath) {
            vscode.window.showWarningMessage("Please connect to an Obsidian vault first");
            return { notesCache, lastUpdateTime };
        }

        // Check if update is needed only if not forced
        if (!force) {
            const needsRefresh = await isVaultModified(vaultPath, lastUpdateTime);
            log(`Vault modification check: ${needsRefresh}`);
            if (!needsRefresh) {
                log("Vault is up to date, skipping update");
                vscode.window.showInformationMessage("Notes are up to date");
                return { notesCache, lastUpdateTime };
            }
        }

        log("Starting notes information update");
        // Load notes from the vault based on selected directories
        const notes = await loadVaultNotes(vaultPath, selectedDirectories);
        log(`Loaded ${notes.length} notes from vault`);

        // Clear the existing cache and populate it with new notes information
        notesCache.clear();
        notes.forEach((note) => {
            const relativePath = path.relative(vaultPath, note.path);
            notesCache.set(relativePath, {
                fullPath: note.path,
                aliases: note.aliases,
                uri: note.uri,
            });
        });
        log(`Updated notesCache with ${notesCache.size} entries`);

        // Update the last update time to the current timestamp
        const newLastUpdateTime = Date.now();
        log(`New last update time: ${new Date(newLastUpdateTime).toLocaleString()}`);

        // Save the updated cache to a file
        try {
            await saveCache(vscodeContext, notesCache, newLastUpdateTime, log);
            log("Cache saved successfully");
        } catch (error) {
            log(`Warning: Failed to save cache: ${error.message}`);
        }

        // Log the results of the update
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

        return { notesCache, lastUpdateTime: newLastUpdateTime };
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