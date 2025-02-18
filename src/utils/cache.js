const fs = require('fs');
const path = require('path');

const CACHE_FILENAME = "notes-cache.json";

//FUNC - Get the path to the cache file
// vscodeContext - The context object from the extension, we use it to get the path to the global storage directory
export async function getCachePath(vscodeContext) {
    // Get the path to the global storage directory
    const extensionPath = vscodeContext.globalStorageUri.fsPath;
    // Creates directory for extension storage if it doesn't exist
    await fs.promises.mkdir(extensionPath, { recursive: true });
    // Returns the path to the cache file
    return path.join(extensionPath, CACHE_FILENAME);
}

//FUNC - Load the cache file and add notes information to the cache
export async function saveCache(vscodeContext, notesCache, lastUpdateTime, log) {
    try {
        // Get the path to the cache file from getCachePath function
        const cachePath = await getCachePath(vscodeContext);
        // Create an object with the notes and the timestamp of the last update of the cache
        const cacheData = {
            notes: Array.from(notesCache.entries()),
            timestamp: lastUpdateTime,
        };
        // Write the cache data to the cache file
        await fs.promises.writeFile(
            cachePath,
            // Convert the cache data to a JSON string
            JSON.stringify(cacheData, null, 2)
        );
        log(`Cache saved to ${cachePath}`);
    } catch (error) {
        log(`Error saving cache: ${error.message}`);
        throw error;
    }
}

//FUNC - Load the cache file as data for current session
export async function loadCache(vscodeContext, notesCache, lastUpdateTime, log) {
    try {
        // Get the path to the cache file from getCachePath function
        const cachePath = await getCachePath(vscodeContext);
        // Check if the cache file exists
        const exists = await fs.promises
            .access(cachePath)
            .then(() => true)
            .catch(() => false);
        // If the cache file doesn't exist, return the default values
        if (!exists) {
            log("No cache file found");
            return { notesCache, lastUpdateTime, cacheLoaded: false };
        }
        // If the cache file exists, load the cache data
        const cacheContent = await fs.promises.readFile(cachePath, "utf-8");
        const cacheData = JSON.parse(cacheContent);

        // Create a Map object from the notes array in the cache data
        const loadedNotesCache = new Map(cacheData.notes);
        // Get the timestamp of the last update of the cache
        const loadedLastUpdateTime = cacheData.timestamp;

        log(`Cache loaded from ${cachePath}`);
        // Return the loaded cache data
        return { notesCache: loadedNotesCache, lastUpdateTime: loadedLastUpdateTime, cacheLoaded: true };
    } catch (error) {
        log(`Error loading cache: ${error.message}`);
        return { notesCache, lastUpdateTime, cacheLoaded: false };
    }
}