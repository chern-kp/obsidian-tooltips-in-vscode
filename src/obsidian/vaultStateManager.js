const vscode = require('vscode');
const path = require('path');
const { log } = require('../utils/logging');
const { isVaultModified } = require('./noteFetcher');
const { loadVaultNotes } = require('./noteSearch');
const { saveCache } = require('../utils/cache');

//FUNC - Update list of notes and aliases for the connected vault (or don't if up to date)
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

        // Check if update is needed only if not force
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
        const notes = await loadVaultNotes(vaultPath, selectedDirectories);
        log(`Loaded ${notes.length} notes from vault`);

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
        log(`Updated notesCache with ${notesCache.size} entries`);

        // Update last update time
        const newLastUpdateTime = Date.now();
        log(`New last update time: ${new Date(newLastUpdateTime).toLocaleString()}`);

        // Save cache to file
        try {
            await saveCache(vscodeContext, notesCache, newLastUpdateTime, log);
            log("Cache saved successfully");
        } catch (error) {
            log(`Warning: Failed to save cache: ${error.message}`);
        }

        // Log results
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