const vscode = require("vscode");

const { saveCache, loadCache } = require("./utils/cache");
const { initializeLogging, log } = require("./utils/logging");
const { findObsidian, getObsidianVaults } = require("./obsidian/finder");
const { registerHoverProvider } = require("./hover/hoverProvider");
const {
    registerConnectCommand,
    pickDirectories,
} = require("./obsidian/connect");
const {
    getNoteContent,
    isVaultModified,
} = require("./obsidian/fetcher");
const { findNoteMatch } = require("./obsidian/vaultSearch");
const { updateNotesInformation } = require("./obsidian/vaultManager");

// ! Use log(...) function for logging (logging.js)

//ANCHOR - Global variables
// Timestamp of the last update of notes information
let lastUpdateTime = 0;
// List of directories to scan for notes that are selected by the user
let selectedDirectories = new Set(["Notes In Root"]);

// Context (state) of the extension as global variable (for use in functions)
let vscodeContext;

// Path to the cache file for saving notes information between sessions
// Temporary cache for notes information (Tiles and Aliases)
let notesCache = new Map();

const SEARCH_CONFIG = {
    // Regex pattern for matching words including allowed characters
    WORD_PATTERN: /(?:\b|^)([A-Za-z0-9]+(?:[.\-_:()]*[A-Za-z0-9]+)*)(?=\b|$)/g,
    // Comparison options (true is case-insensitive, false is case-sensitive)
    CASE_INSENSITIVE: true,
    ALLOWEDCHARS: "A-Za-z0-9-_.(){}[]:;!?+=<>*/\\",
};

//FUNC - Activate the extension (Entry point)
function activate(context) {
    vscodeContext = context; // Save context globally
    // Initialize logging system
    initializeLogging();

    log("Extension activated!");

    // Restore selected directories from global state
    const savedDirectories = context.globalState.get("selectedDirectories");
    if (savedDirectories) {
        selectedDirectories = new Set(savedDirectories);
    }

    // Update notes information for connected vault on activation
    (async () => {
        try {
            // Load cache and check if it was successful
            const cacheLoaded = await loadCache(
                vscodeContext,
                notesCache,
                lastUpdateTime,
                log
            );
            if (!cacheLoaded) {
                // Only clear cache if loading failed
                notesCache.clear();
                lastUpdateTime = 0;
                log("No cache found, starting fresh");
            } else {
                log("Cache loaded successfully");
            }

            // Check if a vault is connected. If so, update notes information
            const connectedVault = context.globalState.get("connectedVault");
            if (!connectedVault) {
                log("No connected vault found. Skipping automatic update.");
                return;
            }

            log(`Connected vault found: ${connectedVault}`);
            // Check if vault has been modified since last update.
            const needsRefresh = await isVaultModified(
                connectedVault,
                lastUpdateTime
            );
            //If so, update notes information
            if (needsRefresh) {
                log("Vault has been modified. Updating notes information...");
                await updateNotesInformation(connectedVault, true, vscodeContext, notesCache, lastUpdateTime, selectedDirectories);
            }
            //If not, use cached data
            else {
                log("Vault is up to date. Using cached data.");
            }
        } catch (error) {
            log(`Error during initialization: ${error.message}`);
        }
    })();

    // ANCHOR - Command registration for "Update Notes Information" command
    let updateCommand = vscode.commands.registerCommand(
        "obsidian-tooltips.updateNotesInformation",
        async () => {
            const connectedVault = context.globalState.get("connectedVault");
            if (!connectedVault) {
                vscode.window.showWarningMessage(
                    "Please connect to an Obsidian vault first"
                );
                return;
            }

            try {
                // Update if vault was changed
                await updateNotesInformation(connectedVault, false, vscodeContext, notesCache, lastUpdateTime, selectedDirectories);
            } catch (error) {
                log(`Failed to update notes information: ${error.message}`);
                vscode.window.showErrorMessage(
                    `Failed to update notes: ${error.message}`
                );
            }
        }
    );

    // ANCHOR - Command registration for opening Obsidian URIs (Needed for ability to open URLs from hover popup)
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

    // ANCHOR - Command registration for "Pick Directories" command
    let pickDirectoriesCommand = vscode.commands.registerCommand(
        "obsidian-tooltips.pickDirectories",
        async () => {
            const connectedVault = vscodeContext.globalState.get("connectedVault");
            if (!connectedVault) {
                vscode.window.showWarningMessage(
                    "Please connect to an Obsidian vault first"
                );
                return;
            }

            await pickDirectories(
                connectedVault,
                vscodeContext,
                selectedDirectories,
                notesCache,
                lastUpdateTime,
                saveCache,
                log,
                updateNotesInformation
            );
        }
    );

    const connectCommand = registerConnectCommand(
        // Call the function and get the command
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

    // ANCHOR - Hover provider registration
    const hoverProvider = registerHoverProvider(
        context,
        notesCache,
        SEARCH_CONFIG,
        getNoteContent,
        findNoteMatch
    );

    // Register provider first in subscriptions array for priority
    context.subscriptions.splice(0, 0, hoverProvider);

    // Register all commands and providers
    context.subscriptions.push(
        connectCommand,
        updateCommand,
        hoverProvider,
        openUriCommand,
        pickDirectoriesCommand
    );
    log("Extension fully initialized");
}

//FUNC - Deactivate the extension. On deactivation, save the cache to file if possible
function deactivate() {
    log("Extension deactivated");
}

module.exports = {
    activate,
    deactivate,
};
