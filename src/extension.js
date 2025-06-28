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
const { findNoteMatch } = require("./obsidian/noteSearch");
const { updateNotesInformation } = require("./obsidian/vaultStateManager");
const { registerPickDirectoriesCommand } = require("./obsidian/commands/pickDirectoriesCommand");
const { registerUpdateCommand } = require("./obsidian/commands/updateCommand");
const { SEARCH_CONFIG } = require("./config/searchConfig");

// ! Use log(...) function for logging (logging.js)

//ANCHOR - Global variables

/**
 * @global
 * @type {vscode.ExtensionContext}
 * @description The default VS Code extension context, saved globally for access from other functions.
 */
let vscodeContext;

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

/**
 * FUNC - Activates the extension (Entry point).
 * It activates on `onLanguage:*`, meaning it activates when almost any code or text file is opened.
 *
 * @param {vscode.ExtensionContext} context The context object provided by VS Code.
 * @returns {void}
 */
function activate(context) {
    log("Extension activated!");

    vscodeContext = context; // Save context globally for other functions

    initializeLogging(); // Initialize the logging system, creating an "Obsidian Tooltips" output panel

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

            // Attempt to load the notes cache from `notes-cache.json` file
            const cacheLoaded = await loadCache(
                vscodeContext,
                notesCache,
                lastUpdateTime,
                log
            );

            // Check if the Obsidian vault has been modified since the last cache update
            const needsRefresh = await isVaultModified(connectedVault, lastUpdateTime);

            // If the cache failed to load or the vault has been modified, force an update of notes information
            if (!cacheLoaded || needsRefresh) {
                log("Cache needs refresh. Updating notes information...");
                const result = await updateNotesInformation(connectedVault, true, vscodeContext, notesCache, lastUpdateTime, selectedDirectories);
                notesCache = result.notesCache;
                lastUpdateTime = result.lastUpdateTime;
            } else {
                log("Using existing cache data");
            }
        } catch (error) {
            log(`Error during initialization: ${error.message}`);
        }
    })();

    // ANCHOR - Register the "Update Notes Information" command. This command allows users to manually refresh the list of Obsidian notes
    const updateCommand = registerUpdateCommand(
        context,
        notesCache,
        lastUpdateTime,
        saveCache,
        log,
        updateNotesInformation
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
        updateNotesInformation
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
        updateNotesInformation,
        pickDirectories
    );

    // ANCHOR - Register the Hover Provider. It is responsible for detecting keywords in the editor and displaying Obsidian note tooltips
    const hoverProvider = registerHoverProvider(
        context,
        notesCache,
        SEARCH_CONFIG,
        getNoteContent,
        findNoteMatch
    );

    // Register the hover provider with higher priority by placing it at the beginning of the subscriptions array
    context.subscriptions.splice(0, 0, hoverProvider);

    // Add all registered commands and providers to the extension's subscriptions
    context.subscriptions.push(
        connectCommand,
        updateCommand,
        hoverProvider,
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
