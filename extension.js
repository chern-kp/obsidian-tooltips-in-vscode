const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const os = require("os");

// Global output channel for logging
let outputChannel;

// Cache for notes information (Tiles and Aliases)
let notesCache = new Map();
let lastUpdateTime = 0;
// List of directories to scan for notes that are selected by the user
let selectedDirectories = new Set(['Notes In Root']);
// Context (state) of the extension as global variable
let vscodeContext;

//FUNC - Activate the extension (Entry point)
function activate(context) {

    vscodeContext = context; // Save context globally

    // Initialize logging and cache systems
    initializeLogging();
    notesCache.clear();
    lastUpdateTime = 0;
    log("Extension activated!");

    // Update notes information for connected vault on activation
    (async () => {
        const connectedVault = context.globalState.get("connectedVault");
        if (!connectedVault) {
            log("No connected vault found. Skipping automatic update.");
            return;
        }

        try {
            log(`Connected vault found: ${connectedVault}`);
            const needsRefresh = await isVaultModified(connectedVault);
            if (needsRefresh) {
                log("Vault has been modified. Updating notes information...");
                await updateNotesInformation(connectedVault, true);
            } else {
                log("Vault is up to date. No update needed.");
            }
        } catch (error) {
            log(`Error during automatic update: ${error.message}`);
        }
    })();

    // ANCHOR - Command registration for "Connect With Obsidian" command
    let connectCommand = vscode.commands.registerCommand(
        "obsidian-tooltips.connectWithObsidian",
        async () => {
            try {
                // Check current connection status
                const connectedVault =
                    context.globalState.get("connectedVault");

                if (connectedVault) {
                    // Clear all cache data and reset timestamp on disconnect
                    await context.globalState.update(
                        "connectedVault",
                        undefined
                    );
                    notesCache.clear();
                    lastUpdateTime = 0;
                    vscode.window.showInformationMessage(
                        `Disconnected from vault: ${connectedVault}`
                    );
                    log(`Vault disconnected: ${connectedVault}`);
                    return;
                }

                log("Connect With Obsidian command triggered");

                // Obsidian detection logic
                const obsidianPath = await findObsidian();

                if (obsidianPath) {
                    await context.globalState.update(
                        "obsidianPath",
                        obsidianPath
                    );
                    log(`Obsidian path saved: ${obsidianPath}`);

                    const vaults = await getObsidianVaults();
                    if (vaults.length === 0) {
                        vscode.window.showInformationMessage(
                            "No Obsidian vaults found!"
                        );
                        return;
                    }

                    const selectedVault = await vscode.window.showQuickPick(
                        vaults.map((path) => ({
                            label: path.split(/[\\/]/).pop(),
                            description: path,
                            detail: path,
                        })),
                        {
                            placeHolder: "Select a vault to connect",
                            ignoreFocusOut: true,
                        }
                    );

                    if (selectedVault) {
                        await context.globalState.update(
                            "connectedVault",
                            selectedVault.description
                        );
                        try {
                            // Initial vault scan on connection
                            await updateNotesInformation(
                                selectedVault.description,
                                true
                            );

                            // Let user pick directories on connection
                            await pickDirectories(selectedVault.description);

                        } catch (error) {
                            vscode.window.showErrorMessage(
                                `Failed to scan vault: ${error.message}`
                            );
                        }
                        vscode.window.showInformationMessage(
                            `Connected to vault: ${selectedVault.description}`
                        );
                        log(`Vault connected: ${selectedVault.description}`);
                    }
                } else {
                    log("Opening file picker dialog");
                    const result = await vscode.window.showOpenDialog({
                        canSelectFiles: true,
                        canSelectFolders: false,
                        canSelectMany: false,
                        title: "Locate Obsidian Executable",
                        filters: { Executable: ["exe", "app", ""] },
                        defaultUri:
                            os.platform() === "win32"
                                ? vscode.Uri.file(
                                      path.join(
                                          process.env.LOCALAPPDATA,
                                          "Obsidian"
                                      )
                                  )
                                : undefined,
                    });

                    if (result?.[0]?.fsPath) {
                        await context.globalState.update(
                            "obsidianPath",
                            result[0].fsPath
                        );
                        log(`Obsidian path manually set: ${result[0].fsPath}`);
                        vscode.window.showInformationMessage(
                            "Select a vault to connect"
                        );
                    } else {
                        log("File picker cancelled by user");
                    }
                }
            } catch (error) {
                const errorMessage = `Connection error: ${error.message}`;
                log(errorMessage);
                log(`Stack trace: ${error.stack}`);
                vscode.window.showErrorMessage(errorMessage);
            }
        }
    );

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
        'obsidian-tooltips.pickDirectories',
        async () => {
            const connectedVault = vscodeContext.globalState.get('connectedVault');
            if (!connectedVault) {
                vscode.window.showWarningMessage('Please connect to an Obsidian vault first');
                return;
            }
            await pickDirectories(connectedVault);
        }
    );

    // ANCHOR - Hover provider registration
    const hoverProvider = vscode.languages.registerHoverProvider("*", {
        provideHover(document, position) {
            const connectedVault = context.globalState.get("connectedVault");
            if (!connectedVault) {
                return;
            }

            const range = document.getWordRangeAtPosition(position);
            if (!range) {
                return;
            }

            const word = document.getText(range);
            const match = findNoteMatch(word);

            if (match && match.uri) {
                const message = new vscode.MarkdownString("", true);
                message.isTrusted = true;
                message.supportHtml = true;

                // Create content with cached URI
                if (match.type === "title") {
                    message.appendMarkdown(
                        `**Note found**\n\nPath: \`${match.path}\`\n\n`
                    );
                } else {
                    message.appendMarkdown(
                        `**Note found via alias**\n\nAlias: \`${match.matchedAlias}\`\nPath: \`${match.path}\`\n\n`
                    );
                }

                message.appendMarkdown(
                    `[Open in Obsidian](command:obsidian-tooltips.openObsidianUri?${encodeURIComponent(
                        JSON.stringify([match.uri])
                    )})`
                );

                return new vscode.Hover(message);
            }
        },
    });

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

function deactivate() {
    log("Extension deactivated");
}

module.exports = {
    activate,
    deactivate,
};

//FUNC - Initialize the output channel for logging
function initializeLogging() {
    outputChannel = vscode.window.createOutputChannel("Obsidian Tooltips");
    outputChannel.show();
}

//FUNC - Log messages to the VS Code output channel
function log(message) {
    outputChannel.appendLine(`[${new Date().toLocaleTimeString()}] ${message}`);
}

//FUNC - Find the path to the Obsidian program
async function findObsidian() {
    const platform = os.platform();
    let obsidianPath = null;

    log(`Searching Obsidian on platform: ${platform}`);

    if (platform === "win32") {
        // Common Windows path
        const localAppData = process.env.LOCALAPPDATA;
        obsidianPath = path.join(localAppData, "Obsidian", "Obsidian.exe");
        log(`Checking Windows path: ${obsidianPath}`);
    } else if (platform === "darwin") {
        // Common macOS path
        obsidianPath = "/Applications/Obsidian.app";
        log(`Checking macOS path: ${obsidianPath}`);
    } else if (platform === "linux") {
        // Common Linux path
        obsidianPath = path.join(os.homedir(), ".local/bin/obsidian");
        log(`Checking Linux path: ${obsidianPath}`);
    }

    try {
        await fs.promises.access(obsidianPath, fs.constants.F_OK);
        log(`Obsidian found at: ${obsidianPath}`);
        return obsidianPath;
    } catch {
        log("Obsidian not found in default location");
        return null;
    }
}

//FUNC - Get the path to the Obsidian configuration file (to find vaults list)
function getObsidianConfigPath() {
    const platform = os.platform();
    let configPath;

    if (platform === "win32") {
        configPath = path.join(
            process.env.APPDATA,
            "Obsidian",
            "obsidian.json"
        );
    } else if (platform === "darwin") {
        configPath = path.join(
            os.homedir(),
            "Library/Application Support/Obsidian/obsidian.json"
        );
    } else {
        configPath = path.join(os.homedir(), ".config/Obsidian/obsidian.json");
    }

    log(`Calculated config path: ${configPath}`);
    return configPath;
}

//FUNC - Get the vaults list from the Obsidian configuration file
async function getObsidianVaults() {
    try {
        const configPath = getObsidianConfigPath();
        await fs.promises.access(configPath, fs.constants.R_OK);
        const configRaw = await fs.promises.readFile(configPath, "utf-8");
        const config = JSON.parse(configRaw);

        return config.vaults
            ? Object.values(config.vaults).map((v) => v.path)
            : [];
    } catch (error) {
        log(`Failed to read Obsidian config: ${error.message}`);
        return [];
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
        const savedDirectories = vscodeContext.globalState.get('selectedDirectories') || [];
        selectedDirectories = new Set(savedDirectories);

        // Get root directories from vault
        const rootDirs = await getRootDirectories(vaultPath);

        // Prepare items for QuickPick
        const items = [
            {
                label: 'Notes In Root',
                picked: selectedDirectories.has('Notes In Root'),
                alwaysShow: true
            },
            ...rootDirs.map(dir => ({
                label: dir,
                picked: selectedDirectories.has(dir),
                alwaysShow: true
            }))
        ];

        const quickPick = vscode.window.createQuickPick();
        quickPick.items = items;
        quickPick.canSelectMany = true;
        quickPick.selectedItems = items.filter(item => item.picked);
        quickPick.title = 'Select Directories to Include';
        quickPick.placeholder = 'Choose directories (at least one must be selected)';

        // Handle real-time selection changes
        quickPick.onDidChangeSelection(selectedItems => {
            const selectedLabels = selectedItems.map(item => item.label);

            // Prevent empty selection
            if (selectedItems.length === 0) {
                vscode.window.showWarningMessage('At least one directory must be selected');
                return;
            }

            // Update selected directories
            selectedDirectories = new Set(selectedLabels);
        });

        // Handle acceptance of selection
        quickPick.onDidAccept(async () => {
            const selectedLabels = quickPick.selectedItems.map(item => item.label);

            // Prevent empty selection
            if (selectedLabels.length === 0) {
                vscode.window.showWarningMessage('At least one directory must be selected');
                return;
            }

            // Save selection to global state
            await vscodeContext.globalState.update('selectedDirectories', Array.from(selectedDirectories));

            // Update notes based on selection
            await updateNotesInformation(vaultPath, true);

            quickPick.hide();
        });

        quickPick.show();
    } catch (error) {
        log(`Error in pickDirectories: ${error.message}`);
        vscode.window.showErrorMessage(`Failed to load directories: ${error.message}`);
    }
}

//FUNC - Get root directories
async function getRootDirectories(vaultPath) {
    try {
        const entries = await fs.promises.readdir(vaultPath, { withFileTypes: true });
        return entries
            .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
            .map(entry => entry.name);
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

        // Clear and update cache
        notes.forEach((note) => {
            const relativePath = path.relative(vaultPath, note.path);
            notesCache.set(relativePath, {
                fullPath: note.path,
                aliases: note.aliases,
                uri: note.uri,
            });
        });

        // Update last update timestamp
        lastUpdateTime = Date.now();

        // Log results
        outputChannel.appendLine(
            `\nUpdated information for ${notes.length} notes:`
        );
        //STUB - List all notes and aliases in the output channel
        notesCache.forEach((noteInfo, relativePath) => {
            outputChannel.appendLine(`→ ${relativePath}`);
            if (noteInfo.aliases.length > 0) {
                outputChannel.appendLine(
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
            if (selectedDirectories.has('All') ||
                (rootDir === '' && selectedDirectories.has('Notes In Root')) ||
                selectedDirectories.has(rootDir)) {

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
    // Convert word to lowercase for case-insensitive comparison
    const searchWord = word.toLowerCase();

    for (const [relativePath, noteInfo] of notesCache.entries()) {
        // Check if word matches the note filename (without extension)
        const fileName = path.basename(relativePath, ".md").toLowerCase();
        if (fileName === searchWord) {
            return {
                path: relativePath,
                fullPath: noteInfo.fullPath,
                type: "title",
                uri: noteInfo.uri,
            };
        }

        // Check if word exactly matches any aliases
        const aliasMatch = noteInfo.aliases.find(
            (alias) => alias.toLowerCase() === searchWord
        );
        if (aliasMatch) {
            return {
                path: relativePath,
                fullPath: noteInfo.fullPath,
                type: "alias",
                matchedAlias: aliasMatch,
                uri: noteInfo.uri,
            };
        }
    }
    return null;
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
