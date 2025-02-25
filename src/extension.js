const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

const { saveCache, loadCache } = require('./utils/cache');
const { initializeLogging, log } = require('./utils/logging');
const { findObsidian, getObsidianVaults } = require('./obsidian/finder');
const { registerHoverProvider } = require('./hover/hoverProvider');
const { registerConnectCommand } = require('./obsidian/connect');

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
    ALLOWEDCHARS: "A-Za-z0-9-_.(){}[]:;!?+=<>*/\\"
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
            const cacheLoaded = await loadCache(vscodeContext, notesCache, lastUpdateTime, log);
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
            const needsRefresh = await isVaultModified(connectedVault);
            //If so, update notes information
            if (needsRefresh) {
                log("Vault has been modified. Updating notes information...");
                await updateNotesInformation(connectedVault, true);
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
                await updateNotesInformation(connectedVault, false);
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
            const connectedVault =
                vscodeContext.globalState.get("connectedVault");
            if (!connectedVault) {
                vscode.window.showWarningMessage(
                    "Please connect to an Obsidian vault first"
                );
                return;
            }
            await pickDirectories(connectedVault);
        }
    );

    const connectCommand = registerConnectCommand( // Call the function and get the command
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

async function getNoteContent(filePath) {
    try {
        const content = await fs.promises.readFile(filePath, "utf-8");
        const lines = content.split("\n");
        let inFrontmatter = false;
        let contentBuffer = [];
        let collectingContent = false;

        for (const line of lines) {
            const trimmedLine = line.trim();

            // Detect frontmatter boundaries
            if (trimmedLine === "---") {
                inFrontmatter = !inFrontmatter;
                collectingContent = !inFrontmatter; // Start collecting after frontmatter ends
                continue;
            }

            // Skip lines inside frontmatter
            if (inFrontmatter) continue;

            // Stop at first H1 header (exact match for "# " at line start)
            if (line.startsWith("# ")) {
                break;
            }

            // Collect content between frontmatter and first header
            if (collectingContent || !inFrontmatter) {
                contentBuffer.push(line);
            }
        }

        // Join lines and clean trailing whitespace/newlines
        return contentBuffer.join("\n").replace(/[\n\r\s]+$/, "");
    } catch (error) {
        log(`Error reading note content for ${filePath}: ${error.message}`);
        return "";
    }
}

//FUNC - Check if vault directory has been modified since last update
async function isVaultModified(vaultPath) {
    try {
        let latestModification = 0;

        await scanVaultDirectory(vaultPath, async (fullPath) => {
            const stats = await fs.promises.stat(fullPath);
            latestModification = Math.max(latestModification, stats.mtimeMs);
        });

        // Check if we need to update
        const needsRefresh = latestModification > lastUpdateTime;
        log(
            `Vault modification check: Last update: ${new Date(
                lastUpdateTime
            ).toLocaleString()}, Latest modification: ${new Date(
                latestModification
            ).toLocaleString()}`
        );
        log(`Update needed: ${needsRefresh}`);

        return needsRefresh;
    } catch (error) {
        log(`Error checking vault modifications: ${error.message}`);
        // If error occurs, force update to be safe
        return true;
    }
}

// FUNC - Let user pick directories to include
async function pickDirectories(vaultPath) {
    try {
        // Load previously selected directories from global state
        const savedDirectories =
            vscodeContext.globalState.get("selectedDirectories") || [];
        selectedDirectories = new Set(savedDirectories);

        // Get root directories from vault
        const rootDirs = await getRootDirectories(vaultPath);

        // Prepare items for QuickPick
        const items = [
            {
                label: "Notes In Root",
                picked: selectedDirectories.has("Notes In Root"),
                alwaysShow: true,
            },
            ...rootDirs.map((dir) => ({
                label: dir,
                picked: selectedDirectories.has(dir),
                alwaysShow: true,
            })),
        ];

        const quickPick = vscode.window.createQuickPick();
        quickPick.items = items;
        quickPick.canSelectMany = true;
        quickPick.selectedItems = items.filter((item) => item.picked);
        quickPick.title = "Select Directories to Include";
        quickPick.placeholder =
            "Choose directories (at least one must be selected)";

        // Handle real-time selection changes
        quickPick.onDidChangeSelection((selectedItems) => {
            const selectedLabels = selectedItems.map((item) => item.label);

            // Prevent empty selection
            if (selectedItems.length === 0) {
                vscode.window.showWarningMessage(
                    "At least one directory must be selected"
                );
                return;
            }

            // Update selected directories
            selectedDirectories = new Set(selectedLabels);
        });

        // Handle acceptance of selection
        quickPick.onDidAccept(async () => {
            const selectedLabels = quickPick.selectedItems.map(
                (item) => item.label
            );

            // Prevent empty selection
            if (selectedLabels.length === 0) {
                vscode.window.showWarningMessage(
                    "At least one directory must be selected"
                );
                return;
            }

            // Save selection to global state
            await vscodeContext.globalState.update(
                "selectedDirectories",
                Array.from(selectedDirectories)
            );

            // Update notes based on selection
            await updateNotesInformation(vaultPath, true);

            // Save cache after updating notes
            await saveCache(vscodeContext, notesCache, lastUpdateTime, log);

            quickPick.hide();
        });

        quickPick.show();
    } catch (error) {
        log(`Error in pickDirectories: ${error.message}`);
        vscode.window.showErrorMessage(
            `Failed to load directories: ${error.message}`
        );
    }
}

//FUNC - Get root directories
async function getRootDirectories(vaultPath) {
    try {
        const entries = await fs.promises.readdir(vaultPath, {
            withFileTypes: true,
        });
        return entries
            .filter(
                (entry) => entry.isDirectory() && !entry.name.startsWith(".")
            )
            .map((entry) => entry.name);
    } catch (error) {
        log(`Error getting root directories: ${error.message}`);
        throw error;
    }
}

//FUNC - Update list of notes and aliases for the connected vault (or don't if up to date)
async function updateNotesInformation(vaultPath, force = false) {
    try {
        log("Checking if notes information update is needed");

        // Skip update if vault hasn't been modified
        if (!force && !(await isVaultModified(vaultPath))) {
            const message = "Vault is up to date, skipping scan";
            log(message);
            vscode.window.showInformationMessage(message);
            return;
        }

        log("Starting notes information update");
        const notes = await loadVaultNotes(vaultPath);

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
        // Update last update time
        lastUpdateTime = Date.now();
        // Save cache to file
        try {
            await saveCache(vscodeContext, notesCache, lastUpdateTime, log);
            log("Cache saved successfully");
        } catch (error) {
            log(`Warning: Failed to save cache: ${error.message}`);
            // Continue execution even if cache save fails
        }

        // Log results
        //STUB - List all notes and aliases in the output channel
        log(
            `\nUpdated information for ${notes.length} notes:`
        );
        notesCache.forEach((noteInfo, relativePath) => {
            log(`→ ${relativePath}`);
            if (noteInfo.aliases.length > 0) {
                log(
                    `  Aliases: ${noteInfo.aliases.join(", ")}`
                );
            }
        });

        vscode.window.showInformationMessage(
            `Updated information for ${notes.length} notes`
        );
        log("Notes information update completed");
    } catch (error) {
        const errorMessage = `Failed to update notes information: ${error.message}`;
        log(errorMessage);
        vscode.window.showErrorMessage(errorMessage);
        throw error;
    }
}

//FUNC - Recursively scans vault directory for all markdown files
async function scanVaultDirectory(dirPath, callback) {
    const entries = await fs.promises.readdir(dirPath, {
        withFileTypes: true,
    });

    for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        // Skip hidden files and directories
        if (entry.name.startsWith(".")) {
            continue;
        }

        if (entry.isDirectory()) {
            await scanVaultDirectory(fullPath, callback);
        } else if (entry.isFile() && path.extname(entry.name) === ".md") {
            await callback(fullPath, entry);
        }
    }
}

//FUNC - Load note names and aliases from list of files into an array
async function loadVaultNotes(vaultPath) {
    try {
        log(`Starting vault scan: ${vaultPath}`);
        const notes = [];

        // Function to extract aliases from file content
        async function extractAliases(filePath) {
            const content = await fs.promises.readFile(filePath, "utf-8");

            // Check if file starts with frontmatter
            if (!content.startsWith("---")) {
                return [];
            }

            // Find the end of frontmatter
            const secondDash = content.indexOf("---", 3);
            if (secondDash === -1) {
                return [];
            }

            // Extract frontmatter content
            const frontmatter = content.substring(3, secondDash);

            // Look for aliases section
            const aliasesMatch = frontmatter.match(/aliases:\n((?:  - .*\n)*)/);
            if (!aliasesMatch) {
                return [];
            }

            // Extract individual aliases
            const aliasesSection = aliasesMatch[1];
            return aliasesSection
                .split("\n")
                .filter((line) => line.startsWith("  - "))
                .map((line) => line.substring(4).trim());
        }
        await scanVaultDirectory(vaultPath, async (fullPath) => {
            // Check if the note should be included based on selected directories
            const relativePath = path.relative(vaultPath, fullPath);
            const rootDir = relativePath.split(path.sep)[0];

            // If "All" is selected or the file is in a selected directory
            if (
                selectedDirectories.has("All") ||
                (rootDir === "" && selectedDirectories.has("Notes In Root")) ||
                selectedDirectories.has(rootDir)
            ) {
                const aliases = await extractAliases(fullPath);
                const obsidianUri = createObsidianUri(vaultPath, relativePath);

                const noteInfo = {
                    path: fullPath,
                    relativePath: relativePath,
                    aliases: aliases,
                    uri: obsidianUri,
                };
                notes.push(noteInfo);

                log(`Found note: ${fullPath}`);
                if (aliases.length > 0) {
                    log(`  Aliases: ${aliases.join(", ")}`);
                }
                log(`  URI: ${obsidianUri}`);
            }
        });

        log(`Total notes found: ${notes.length}`);
        return notes;
    } catch (error) {
        log(`Vault scan failed: ${error.message}`);
        throw error;
    }
}

//FUNC - Find a note or alias that matches the word user is hovering over
function findNoteMatch(word) {
    const caseInsensitive = SEARCH_CONFIG.CASE_INSENSITIVE;

    // Search for exact match with original word
    let exactMatch = findExactMatch(word, caseInsensitive, false);
    if (exactMatch) {
        return exactMatch;
    }

    // Match with normalized word
    const normalizedWord = normalizeForComparison(word, caseInsensitive);
    return findExactMatch(normalizedWord, caseInsensitive, true);
}

//FUNC - Find an exact match for a word
function findExactMatch(searchWord, caseInsensitive, applyNormalization) {
    const normalizedSearch = caseInsensitive ? searchWord.toLowerCase() : searchWord;

    for (const [relativePath, noteInfo] of notesCache.entries()) {
        const fileName = path.basename(relativePath, ".md");
        let compareName;

        if (applyNormalization) {
            compareName = normalizeForComparison(fileName, caseInsensitive);
        } else {
            compareName = caseInsensitive ? fileName.toLowerCase() : fileName;
        }

        if (compareName === normalizedSearch) {
            return {
                path: relativePath,
                fullPath: noteInfo.fullPath,
                type: "filename",
                uri: noteInfo.uri,
            };
        }

        // Check aliases
        for (const alias of noteInfo.aliases) {
            let compareAlias;
            if (applyNormalization) {
                compareAlias = normalizeForComparison(alias, caseInsensitive);
            } else {
                compareAlias = caseInsensitive ? alias.toLowerCase() : alias;
            }

            if (compareAlias === normalizedSearch) {
                return {
                    path: relativePath,
                    fullPath: noteInfo.fullPath,
                    type: "alias",
                    matchedAlias: alias,
                    uri: noteInfo.uri,
                };
            }
        }
    }

    return null;
}

//FUNC - Normalize a string for comparison
function normalizeForComparison(str, caseInsensitive) {
    let normalized = str.replace(/[^\w.-]+$/, ''); // Remove trailing non-allowed characters
    if (caseInsensitive) {
        normalized = normalized.toLowerCase();
    }
    return normalized;
}

//FUNC - Create an Obsidian URI for a note path
function createObsidianUri(vaultPath, notePath) {
    try {
        // Get vault name from path
        const vaultName = path.basename(vaultPath);

        // Prepare the note path relative to vault root
        const relativePath = notePath.replace(/\\/g, "/"); // Normalize path separators

        // Remove .md extension if present
        const notePathWithoutExt = relativePath.replace(/\.md$/, "");

        // Encode both vault name and note path
        const encodedVault = encodeURIComponent(vaultName);
        const encodedFile = encodeURIComponent(notePathWithoutExt);

        // Create the URI using the shorthand format
        const uri = `obsidian://vault/${encodedVault}/${encodedFile}`;

        log(`Generated Obsidian URI: ${uri}`);
        return uri;
    } catch (error) {
        log(`Error creating Obsidian URI: ${error.message}`);
        return null;
    }
}