const vscode = require('vscode');
const path = require('path');
const { log } = require('../utils/logging');
const { isVaultModified } = require('./noteFetcher');
const { loadVaultNotes } = require('./noteSearch');
const { saveCache } = require('../utils/cache');
const { normalize } = require('../utils/normalizer');

/**
 * @typedef {object} PathInfo
 * @property {string} path - The path to the note.
 * @property {boolean} isFileName - Whether the key is a file name.
 */

//TODO make this as a setting
// If true, prioritizes the file name, if false, prioritizes aliases.
const prioritizeFileName = true;


/**
 * FUNC - Updates the list of notes and aliases for the connected Obsidian vault.
 * This function now also builds and returns the `lookupCache` for fast hover searches.
 *
 * @param {string} vaultPath The full path to the connected Obsidian vault.
 * @param {boolean} force If `true`, forces an update regardless of modification status.
 * @param {vscode.ExtensionContext} vscodeContext The VS Code extension context.
 * @param {Map<string, object>} notesCache A Map to store cached notes information.
 * @param {number} lastUpdateTime The timestamp of the last notes update.
 * @param {Set<string>} selectedDirectories A Set of directories to scan within the vault.
 * @returns {Promise<{
 *   notesCache: Map<string, object>,
 *   lookupCache: Map<string, Map<string, PathInfo[]>>,
 *   multiWordKeys: string[],
 *   lastUpdateTime: number
 * }>} A Promise that resolves with all updated cache data.
 * @throws {Error} If the update process fails.
 */

async function updateNotesInformation(vaultPath, force, vscodeContext, notesCache, lastUpdateTime, selectedDirectories) {
    try {
        log(`Starting updateNotesInformation with vault: ${vaultPath}`);
        log(`Force update: ${force}`);

        if (!vaultPath) {
            vscode.window.showWarningMessage("Please connect to an Obsidian vault first");
            // Return empty structures to avoid errors downstream.
            return { notesCache, lookupCache: new Map(), multiWordKeys: [], lastUpdateTime };
        }

        // If not forcing an update, check if the vault has changed.
        if (!force) {
            const needsRefresh = await isVaultModified(vaultPath, lastUpdateTime);
            log(`Vault modification check: ${needsRefresh}`);
            if (!needsRefresh) {
                log("Vault is up to date, skipping update");
                vscode.window.showInformationMessage("Notes are up to date");
                return { notesCache, lookupCache: new Map(), multiWordKeys: [], lastUpdateTime };
            }
        }

        log("Starting notes information update");
        const notes = await loadVaultNotes(vaultPath, selectedDirectories);
        log(`Loaded ${notes.length} notes from vault`);

        // Clear the existing cache and populate it with new notes information.
        notesCache.clear();
        notes.forEach((note) => {
            const relativePath = path.relative(vaultPath, note.path);
            notesCache.set(relativePath, {
                relativePath: relativePath,
                fullPath: note.path,
                aliases: note.aliases,
                uri: note.uri,
            });
        });
        log(`Updated notesCache with ${notesCache.size} entries`);

        // Build the lookupCache from the newly populated notesCache
        log("Building the lookup cache for fast searching...");
        const { lookupCache, multiWordKeys } = buildLookupCache(notesCache);
        log(`Lookup cache built. Found ${multiWordKeys.length} multi-word keys.`);

        // Update the last update time to the current timestamp
        const newLastUpdateTime = Date.now();
        log(`New last update time: ${new Date(newLastUpdateTime).toLocaleString()}`);

        // Save the main notesCache to a file for persistence between sessions. The lookupCache will be rebuilt on startup.
        try {
            await saveCache(vscodeContext, notesCache, newLastUpdateTime, log);
            log("Cache saved successfully");
        } catch (error) {
            log(`Warning: Failed to save cache: ${error.message}`);
        }

        // Log the results of the update.
        log(`\nUpdated information for ${notes.length} notes.`);

        vscode.window.showInformationMessage(
            `Updated information for ${notes.length} notes`
        );
        log("Notes information update completed");

        // Return all the new data structures.
        return {
            notesCache,
            lookupCache,
            multiWordKeys,
            lastUpdateTime: newLastUpdateTime
        };

    } catch (error) {
        const errorMessage = `Failed to update notes information: ${error.message}`;
        log(errorMessage);
        vscode.window.showErrorMessage(errorMessage);
        throw error;
    }
}

/**
 * Builds a lookup cache from the notes cache.
 * @param {Map<string, {aliases: string[], path: string}>} notesCache - The notes cache to build the lookup from.
 * @returns {{lookupCache: Map<string, Map<string, PathInfo[]>>, multiWordKeys: string[]}} The built lookup cache and multi-word keys.
 */

function buildLookupCache(notesCache) {
    const lookupCache = new Map();
    const multiWordKeys = [];

    for (const [relativePath, noteData] of notesCache.entries()) {
        // Get the file name without extension or path
        const fileName = path.basename(relativePath, '.md');

        // Normalize the file name
        addKeyToCache(lookupCache, multiWordKeys, fileName, relativePath, true, prioritizeFileName);

        // Normalize aliases
        for (const alias of noteData.aliases) {
            addKeyToCache(lookupCache, multiWordKeys, alias, relativePath, false, prioritizeFileName);
        }
    }

    //sort multi-word keys by length in descending order for correct matching
    multiWordKeys.sort((a, b) => b.length - a.length);

return {lookupCache, multiWordKeys};
}

function addKeyToCache(cache, multiWordKeys, originalKey, notePath, isFileName, prioritizeFileName) {
    if (!originalKey) return;

    // Save multi-word keys separately
    if (originalKey.includes(' ')) {
        if (!multiWordKeys.includes(originalKey)) { // Prevent duplicates
            multiWordKeys.push(originalKey);
        }
    }

    const normalizedKey = normalize(originalKey);
    if (!normalizedKey) return;

    if (!cache.has(normalizedKey)) cache.set(normalizedKey, new Map());
    const shelf = cache.get(normalizedKey);

    if (!shelf.has(originalKey)) shelf.set(originalKey, []);
    const pathsArray = shelf.get(originalKey);

    const newPathInfo = { path: notePath, isFileName };

    // Priority logic
    if (prioritizeFileName) {
        isFileName ? pathsArray.unshift(newPathInfo) : pathsArray.push(newPathInfo);
    } else {
        isFileName ? pathsArray.push(newPathInfo) : pathsArray.unshift(newPathInfo);
    }
}

module.exports = {
    updateNotesInformation, buildLookupCache
};