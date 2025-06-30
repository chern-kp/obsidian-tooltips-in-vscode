const vscode = require("vscode");

const { saveCache, loadCache } = require("./utils/cache");
const { initializeLogging, log } = require("./utils/logging");
const { findObsidian, getObsidianVaults } = require("./obsidian/obsidianFinder");
const { registerHoverProvider } = require("./hover/hoverProvider");
const {
    registerConnectCommand,
    pickDirectories,
} = require("./obsidian/vaultConnectionManager");
const {
    getNoteContent,
    isVaultModified,
} = require("./obsidian/noteFetcher");
const { updateNotesInformation, buildLookupCache } = require("./obsidian/vaultStateManager");
const { registerPickDirectoriesCommand } = require("./obsidian/commands/pickDirectoriesCommand");
const { registerUpdateCommand } = require("./obsidian/commands/updateCommand");

// ! Use log(...) function for logging (logging.js)

//ANCHOR - Global variables

/**
 * @global
 * @type {number}
 * @description Timestamp of the last update of notes information. Used to check if the vault has been modified since the last update.
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
let multiWordKeys = [];
let hoverProviderDisposable;

function reRegisterHoverProvider(context) {
    // Step 1. Delete the old hover provider to avoid duplicates
    if (hoverProviderDisposable) {
        hoverProviderDisposable.dispose();
    }

    // Step 2. Register new hover provider with the updated data from variables
    hoverProviderDisposable = registerHoverProvider(
        context,
        lookupCache,
        multiWordKeys,
        notesCache,
        getNoteContent
    );

    // Step 3. Add the new hover provider to the context subscriptions
    context.subscriptions.push(hoverProviderDisposable);
    log("Hover provider re-registered with updated data");
}

async function updateAndReRegister(vaultPath, force, context, notesCache, lastUpdateTime, selectedDirectories) {
    const result = await updateNotesInformation(vaultPath, force, context, notesCache, lastUpdateTime, selectedDirectories);

    // Update all global variables
    notesCache = result.notesCache;
    lookupCache = result.lookupCache;
    multiWordKeys = result.multiWordKeys;
    lastUpdateTime = result.lastUpdateTime;

    // Re-register HoverProvider with new data
    reRegisterHoverProvider(context);

    // Return the result, which the calling code expects (if it needs it)
    return { notesCache: notesCache, lastUpdateTime: lastUpdateTime };
}

/**
 * FUNC - Activates the extension (Entry point).
 * It activates on `onLanguage:*`, meaning it activates when almost any code or text file is opened.
 *
 * @param {vscode.ExtensionContext} context The context object provided by VS Code.
 * @returns {void}
 */
function activate(context) {
    initializeLogging(); // Initialize the logging system, creating an "Obsidian Tooltips" output panel.
    log("Extension activated!");


    // Restore selected directories from global state.
    const savedDirs = context.globalState.get("selectedDirectories");
    // If previously saved directories exist, use them; otherwise, default to "Notes In Root"
    selectedDirectories = savedDirs ? new Set(savedDirs) : new Set(["Notes In Root"]);

    // Asynchronously update notes information for the connected vault on activation to make sure the extension has up-to-date note data when it starts
    (async () => {
        try {
            const connectedVault = context.globalState.get("connectedVault");
            if (!connectedVault) {
                log("No connected vault found. Skipping automatic update.");
                return;
            }

            const loadedData = await loadCache(context, notesCache, lastUpdateTime, log);

            if (loadedData.cacheLoaded) {
                notesCache = loadedData.notesCache;
                lastUpdateTime = loadedData.lastUpdateTime;
                log(`Loaded ${notesCache.size} notes from file cache.`);

                // Build the lookup cache from the loaded notes cache
                const builtCaches = buildLookupCache(notesCache);
                lookupCache = builtCaches.lookupCache;
                multiWordKeys = builtCaches.multiWordKeys;
                log(`Initial lookup cache built. Found ${multiWordKeys.length} multi-word keys.`);
            }

            const needsRefresh = await isVaultModified(connectedVault, lastUpdateTime);

            if (!loadedData.cacheLoaded || needsRefresh) {
                log("Cache needs refresh. Updating notes information...");
                const result = await updateNotesInformation(connectedVault, true, context, notesCache, lastUpdateTime, selectedDirectories);
                notesCache = result.notesCache;
                lookupCache = result.lookupCache;
                multiWordKeys = result.multiWordKeys;
                lastUpdateTime = result.lastUpdateTime;
            } else {
                log("Using existing cache data.");
            }
        } catch (error) {
            log(`Error during initialization: ${error.message}`);
        } finally {
            // In any case, re-register the Hover Provider
            reRegisterHoverProvider(context);
        }
    })();

    // ANCHOR - Register the "Update Notes Information" command. This command allows users to manually refresh the list of Obsidian notes
    const updateHandler = (...args) => updateAndReRegister(...args);

    const updateCommand = registerUpdateCommand(
        context,
        notesCache,
        lastUpdateTime,
        saveCache,
        log,
        updateHandler
    );


    // ANCHOR - Register the command for opening Obsidian URIs. Needed for ability to open URLs from hover popup
    let openUriCommand = vscode.commands.registerCommand(
        "obsidian-tooltips.openObsidianUri",
        async (uri) => {
            try {
                // Convert uri string to Uri object if needed
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

    // ANCHOR - Register the "Pick Directories" command. This command allows users to select specific directories within their Obsidian vault to be scanned for notes
    const pickDirectoriesCommand = registerPickDirectoriesCommand(
        context,
        notesCache,
        lastUpdateTime,
        saveCache,
        log,
        updateHandler
    );

    // ANCHOR - Register the "Connect With Obsidian" command. This command handles the connection/disconnection to an Obsidian vault, including auto-detection and manual selection
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
    log("Extension fully initialized");
}

/**
 * FUNC - Deactivates the extension. This function is called by VS Code when the extension is deactivated
 * @returns {void}
 */
function deactivate() {
    log("Extension deactivated");
}

module.exports = {
    activate,
    deactivate,
};
