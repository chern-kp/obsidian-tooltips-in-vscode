const fs = require('fs');
const path = require('path');

const CACHE_FILENAME = "notes-cache.json";

/**
 * FUNC - Gets the full path to the cache file.
 * It uses the VS Code extension's global storage directory. The directory is created if it does not already exist.
 *
 * @param {object} vscodeContext The context object from the extension. Expected to have `globalStorageUri.fsPath`.
 * @returns {Promise<string>} A Promise that resolves with the full path to the cache file.
 */
async function getCachePath(vscodeContext) {
    // Get the path to the global storage directory provided by VS Code.
    const extensionPath = vscodeContext.globalStorageUri.fsPath;
    // Create the directory for extension storage if it doesn't exist.
    await fs.promises.mkdir(extensionPath, { recursive: true });
    // Return the full path to the cache file.
    return path.join(extensionPath, CACHE_FILENAME);
}

/**
 * FUNC - Saves the current notes cache and last update timestamp to a file.
 * The data is stored as a JSON string in the `notes-cache.json` file within the extension's global storage.
 *
 * @param {object} vscodeContext The context object from the extension. Expected to have `globalStorageUri.fsPath`.
 * @param {Map<string, object>} notesCache A Map containing the notes information to be saved.
 * @param {number} lastUpdateTime The timestamp of the last update of the notes information.
 * @param {function(string): void} log Logging function.
 * @returns {Promise<void>} A Promise that resolves when the cache is successfully saved.
 * @throws {Error} If there is an error during the saving process.
 */
async function saveCache(vscodeContext, notesCache, lastUpdateTime, log) {
    try {
        // Get the path to the cache file
        const cachePath = await getCachePath(vscodeContext);
        // Create an object containing the notes (converted to an array) and the timestamp
        const cacheData = {
            notes: Array.from(notesCache.entries()),
            timestamp: lastUpdateTime,
        };
        // Write the cache data to the cache file as a pretty-printed JSON string
        await fs.promises.writeFile(
            cachePath,
            JSON.stringify(cacheData, null, 2)
        );
        log(`Cache saved to ${cachePath}`);
    } catch (error) {
        log(`Error saving cache: ${error.message}`);
        throw error;
    }
}

/**
 * FUNC - Loads the notes cache from the cache file for the current session.
 * It reads the `notes-cache.json` file, parses its content, and populates the `notesCache` Map
 * and `lastUpdateTime` variable. If the file does not exist, it returns default values.
 *
 * @param {object} vscodeContext The context object from the extension. Expected to have `globalStorageUri.fsPath`.
 * @param {Map<string, object>} notesCache The Map to which loaded notes information will be added.
 * @param {number} lastUpdateTime The variable to which the loaded last update timestamp will be assigned.
 * @param {function(string): void} log Logging function.
 * @returns {Promise<{notesCache: Map<string, object>, lastUpdateTime: number, cacheLoaded: boolean}>}
 * A Promise that resolves with an object containing the loaded notes cache, last update time, and a boolean indicating if the cache was successfully loaded.
 */
async function loadCache(vscodeContext, notesCache, lastUpdateTime, log) {
    try {
        // Get the path to the cache file
        const cachePath = await getCachePath(vscodeContext);
        // Check if the cache file exists
        const exists = await fs.promises
            .access(cachePath)
            .then(() => true)
            .catch(() => false);
        // If the cache file doesn't exist, log and return default values
        if (!exists) {
            log("No cache file found");
            return { notesCache, lastUpdateTime, cacheLoaded: false };
        }
        // If the cache file exists, read and parse its content
        const cacheContent = await fs.promises.readFile(cachePath, "utf-8");
        const cacheData = JSON.parse(cacheContent);

        // Create a Map object from the notes array in the cache data
        const loadedNotesCache = new Map(cacheData.notes);
        // Get the timestamp of the last update from the cache data
        const loadedLastUpdateTime = cacheData.timestamp;

        log(`Cache loaded from ${cachePath}`);
        // Return the loaded cache data.
        return { notesCache: loadedNotesCache, lastUpdateTime: loadedLastUpdateTime, cacheLoaded: true };
    } catch (error) {
        log(`Error loading cache: ${error.message}`);
        // On error, return default values and indicate that cache loading failed
        return { notesCache, lastUpdateTime, cacheLoaded: false };
    }
}

module.exports = {
    getCachePath,
    saveCache,
    loadCache
};