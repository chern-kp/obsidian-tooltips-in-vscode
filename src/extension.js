const vscode = require("vscode");

const { saveCache, loadCache } = require("./utils/cache");
const { initializeLogging, log } = require("./utils/logging");
const {
    findObsidian,
    getObsidianVaults,
} = require("./obsidian/obsidianFinder");
const { registerHoverProvider } = require("./hover/hoverProvider");
const {
    registerConnectCommand,
    pickDirectories,
} = require("./obsidian/vaultConnectionManager");
const { getNoteContent, isVaultModified } = require("./obsidian/noteFetcher");
const {
    updateNotesInformation,
    buildLookupCache,
} = require("./obsidian/vaultStateManager");
const {
    registerPickDirectoriesCommand,
} = require("./obsidian/commands/pickDirectoriesCommand");
const { registerUpdateCommand } = require("./obsidian/commands/updateCommand");

/** ! Use log(...) function for logging.
 * Implementation: {@link log} function in `logging.js`.
 */

//ANCHOR - Global variables

/**
 * @global
 * @type {number}
 * @description Timestamp of the last update of notes information. Used to check if the vault has been modified since the last update.
 * Used in:
 * {@link updateNotesInformation} in `vaultStateManager.js` to determine if the vault needs to be updated.
 * {@link isVaultModified} in `noteFetcher.js` to check if the vault has been modified since the last update.
 */
let lastUpdateTime = 0;

/**
 * @global
 * @type {Set<string>}
 * @description Set of directories selected by the user for scanning Obsidian notes.
 * Defaults to "Notes In Root" if no directories are saved in global state.
 */
let selectedDirectories = new Set(["Notes In Root"]);

/**
 * @global
 * @type {Map<string, object>}
 * @description Temporary cache for Obsidian notes information (titles, aliases, URIs).
 * Key is the relative path to the note file, value is an object containing { fullPath, aliases, uri }.
 * This cache is saved to and loaded from `notes-cache.json` between sessions.
 */
let notesCache = new Map();

let lookupCache = new Map();
let hoverProviderDisposable;

/**
 * FUNC - Activates the extension (Entry point).
 * It activates on `onLanguage:*`, meaning it activates when almost any code or text file is opened.
 * ! For more information see /docs/ARCHITECTURE.md file.
 *
 * @param {vscode.ExtensionContext} context The context object provided by VS Code.
 * @returns {void}
 */
function activate(context) {
    // STEP 1: Initialize logging and restore user settings from the previous session.
    initializeLogging();
    log("Extension activated!");

    // STEP 2. When the extension is activated, check the global state for previously selected directories.
    restoreSelectedDirectories(context);

    // STEP 3. Initialize the extension on activation.
    initializeOnActivation(context);

    // STEP 4. Register all the commands (that user can call from VS Code) that the extension provides.
    registerCommands(context);

    log("Extension fully initialized");
}

/**
 * FUNC - Restores the selected directories from the global state.
 * @param {vscode.ExtensionContext} context The extension context.
 */
function restoreSelectedDirectories(context) {
    // Restore selected directories from global state.
    // Global state is a storage provided by VS Code to save data across sessions.
    const savedDirs = context.globalState.get("selectedDirectories");

    // If previously saved directories exist, use them; otherwise, default to "Notes In Root"
    selectedDirectories = savedDirs
        ? new Set(savedDirs)
        : new Set(["Notes In Root"]);
}

/**
 * FUNC - Re-registers the Hover Provider with the current state of the caches.
 * This function disposes of the old provider and creates a new one, ensuring
 * that hover tooltips always use the most up-to-date data.
 * @param {vscode.ExtensionContext} context The extension context.
 */
function reRegisterHoverProvider(context) {
    // Step 1. Delete the old hover provider to avoid duplicates
    if (hoverProviderDisposable) {
        hoverProviderDisposable.dispose();
    }

    // Step 2. Register new hover provider with the updated data from variables
    hoverProviderDisposable = registerHoverProvider(
        context,
        lookupCache,
        notesCache,
        getNoteContent
    );

    // Step 3. Add the new hover provider to the context subscriptions
    context.subscriptions.push(hoverProviderDisposable);
    log("Hover provider re-registered with updated data");
}

/**
 * FUNC - Updates the notes information and re-registers the Hover Provider.
 */

async function updateAndReRegister(
    vaultPath,
    force,
    context,
    currentNotesCache,
    currentLastUpdateTime,
    selectedDirectories
) {
    const result = await updateNotesInformation(
        vaultPath,
        force,
        context,
        currentNotesCache,
        currentLastUpdateTime,
        selectedDirectories
    );

    // Update all global variables
    notesCache = result.notesCache;
    lookupCache = result.lookupCache;
    lastUpdateTime = result.lastUpdateTime;

    // Re-register HoverProvider with new data
    reRegisterHoverProvider(context);

    // Return the result, which the calling code expects (if it needs it)
    return { notesCache: notesCache, lastUpdateTime: lastUpdateTime };
}

/**
 * FUNC - Initializes the extension on activation.
 * @param {vscode.ExtensionContext} context The extension context.
 */
async function initializeOnActivation(context) {
    try {
        // Check the global state (storage) for a connected vault.
        const connectedVault = context.globalState.get("connectedVault");
        if (!connectedVault) {
            log("No connected vault found. Skipping automatic update.");
            // Call registration with empty parameter to activate the provider
            reRegisterHoverProvider(context);
            return;
        }

        const loadedData = await loadCache(
            context,
            notesCache,
            lastUpdateTime,
            log
        );
        if (loadedData.cacheLoaded) {
            notesCache = loadedData.notesCache;
            lastUpdateTime = loadedData.lastUpdateTime;
            log(`Loaded ${notesCache.size} notes from file cache.`);

            // Build the lookup cache from the loaded notes cache
            const builtCaches = buildLookupCache(notesCache);
            lookupCache = builtCaches.lookupCache;
        }

        const needsRefresh = await isVaultModified(
            connectedVault,
            lastUpdateTime
        );

        if (!loadedData.cacheLoaded || needsRefresh) {
            log("Cache needs refresh. Updating notes information...");
            await updateAndReRegister(
                connectedVault,
                true,
                context,
                notesCache,
                lastUpdateTime,
                selectedDirectories
            );
        } else {
            log("Using existing cache data.");
            // We still need to register the provider with the loaded data
            reRegisterHoverProvider(context);
        }
    } catch (error) {
        log(`Error during initialization: ${error.message}`);
    }
}

/**
 * FUNC - Deactivates the extension. This function is called by VS Code when the extension is deactivated
 * @returns {void}
 */
function deactivate() {
    log("Extension deactivated");
}

// SECTION - Register Commands -------------------------------

function registerCommands(context) {
    const updateHandler = (...args) => {
        return updateAndReRegister(...args);
    };

    // ANCHOR - Register the "Update Notes Information" command.
    const updateCommand = registerUpdateCommand(
        context,
        notesCache,
        lastUpdateTime,
        saveCache,
        log,
        updateHandler
    );

    // ANCHOR - Register the command for opening Obsidian URIs.
    let openUriCommand = vscode.commands.registerCommand(
        "obsidian-tooltips.openObsidianUri",
        async (uri) => {
            try {
                const uriToOpen =
                    typeof uri === "string" ? vscode.Uri.parse(uri) : uri;
                await vscode.env.openExternal(uriToOpen);
                log(`Opening URI in Obsidian: ${uri}`);
            } catch (error) {
                log(`Failed to open URI: ${error.message}`);
                vscode.window.showErrorMessage(
                    `Failed to open in Obsidian: ${error.message}`
                );
            }
        }
    );

    // ANCHOR - Register the "Pick Directories" command.
    const pickDirectoriesCommand = registerPickDirectoriesCommand(
        context,
        notesCache,
        lastUpdateTime,
        saveCache,
        log,
        updateHandler
    );

    // ANCHOR - Register the "Connect With Obsidian" command.
    const connectCommand = registerConnectCommand(
        context,
        notesCache,
        lastUpdateTime,
        saveCache,
        log,
        findObsidian,
        getObsidianVaults,
        updateHandler,
        pickDirectories
    );

    // Add all registered commands and providers to the extension's subscriptions
    context.subscriptions.push(
        connectCommand,
        updateCommand,
        openUriCommand,
        pickDirectoriesCommand
    );
}

//! SECTION - Register Commands -------------------------------

module.exports = {
    activate,
    deactivate,
};
