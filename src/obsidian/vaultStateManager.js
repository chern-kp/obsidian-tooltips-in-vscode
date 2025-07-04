const vscode = require('vscode');
const path = require('path');
const { log } = require('../utils/logging');
const { isVaultModified } = require('./noteFetcher');
const { loadVaultNotes } = require('./noteSearch');
const { saveCache } = require('../utils/cache');
const { canonicalNormalize } = require('../utils/normalizer');

/**
 * @typedef {object} PathInfo
 * @property {string} path - The relative path to the note.
 * @property {boolean} isFileName - True if the key originated from a filename, false if from an alias.
 */

// TODO: Make this a user setting
const prioritizeFileName = true;

/**
 * Updates the list of notes from the vault and builds the lookup cache.
 * @returns {Promise<{
 *   notesCache: Map<string, object>,
 *   lookupCache: Map<string, Map<string, PathInfo[]>>,
 *   lastUpdateTime: number
 * }>} A Promise that resolves with all updated cache data.
 */
async function updateNotesInformation(vaultPath, force, vscodeContext, notesCache, lastUpdateTime, selectedDirectories) {
    try {
        log(`Starting notes update. Force: ${force}`);
        if (!vaultPath) {
            vscode.window.showWarningMessage("Please connect to an Obsidian vault first");
            return { notesCache, lookupCache: new Map(), lastUpdateTime };
        }

        if (!force) {
            const needsRefresh = await isVaultModified(vaultPath, lastUpdateTime);
            if (!needsRefresh) {
                log("Vault is up-to-date, skipping update.");
                // If we skip the update, we still need to build the lookupCache from the existing notesCache.
                const { lookupCache } = buildLookupCache(notesCache);
                return { notesCache, lookupCache, lastUpdateTime };
            }
        }

        log("Updating notes information from vault...");
        const notes = await loadVaultNotes(vaultPath, selectedDirectories);
        log(`Loaded ${notes.length} notes.`);

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
        log(`Updated notesCache with ${notesCache.size} entries.`);

        // Build the lookupCache from the newly populated notesCache.
        log("Building the lookup cache...");
        const { lookupCache } = buildLookupCache(notesCache);
        log(`Lookup cache built successfully.`);

        const newLastUpdateTime = Date.now();
        await saveCache(vscodeContext, notesCache, newLastUpdateTime, log);
        log("Cache saved successfully.");

        vscode.window.showInformationMessage(`Updated information for ${notes.length} notes.`);
        log("Notes information update completed.");

        return {
            notesCache,
            lookupCache,
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
 * Builds the fast lookup cache from the main notes cache.
 * @param {Map<string, {aliases: string[], relativePath: string}>} notesCache
 * @returns {{lookupCache: Map<string, Map<string, PathInfo[]>>}}
 */
function buildLookupCache(notesCache) {
    const lookupCache = new Map();

    for (const [relativePath, noteData] of notesCache.entries()) {
        const fileName = path.basename(relativePath, '.md');
        addKeyToCache(lookupCache, fileName, relativePath, true);
        for (const alias of noteData.aliases) {
            addKeyToCache(lookupCache, alias, relativePath, false);
        }
    }
    return { lookupCache };
}

/**
 * FUNC - Helper function to add a key to the lookup cache.
 */
function addKeyToCache(cache, originalKey, notePath, isFileName) {
    if (!originalKey || typeof originalKey !== 'string' || !originalKey.trim()) return;


    const normalizedKey = canonicalNormalize(originalKey);
    if (!normalizedKey) return;

    const shelf = cache.has(normalizedKey) ? cache.get(normalizedKey) : cache.set(normalizedKey, new Map()).get(normalizedKey);
    const pathsArray = shelf.has(originalKey) ? shelf.get(originalKey) : shelf.set(originalKey, []).get(originalKey);

    const newPathInfo = { path: notePath, isFileName };

    // Prevent adding the exact same note path twice under the same originalKey
    const existingIndex = pathsArray.findIndex(p => p.path === notePath);
    if (existingIndex > -1) {
        if (isFileName && !pathsArray[existingIndex].isFileName) {
            pathsArray[existingIndex].isFileName = true;
        }
        return;
    }

    // Priority logic
    if (prioritizeFileName) {
        isFileName ? pathsArray.unshift(newPathInfo) : pathsArray.push(newPathInfo);
    } else {
        isFileName ? pathsArray.push(newPathInfo) : pathsArray.unshift(newPathInfo);
    }
}

module.exports = {
    updateNotesInformation,
    buildLookupCache
};