const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const os = require("os");

// Create global output channel for logging
let outputChannel;

// Create cache for notes information (Tiles and Aliases)
let notesCache = new Map();
let lastUpdateTime = 0;

/**
 * Initialize logging system
 */
function initializeLogging() {
    outputChannel = vscode.window.createOutputChannel("Obsidian Tooltips");
    outputChannel.show();
}

/**
 * Log message to output channel with timestamp
 * @param {string} message - Message to log
 */
function log(message) {
    outputChannel.appendLine(`[${new Date().toLocaleTimeString()}] ${message}`);
}

// Find the path to the Obsidian program
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

// Check if vault directory has been modified since last update
async function needsUpdate(vaultPath) {
    try {
        let latestModification = 0;

        // Recursive function to check modification times
        async function checkDirectory(dirPath) {
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
                    await checkDirectory(fullPath);
                } else if (
                    entry.isFile() &&
                    path.extname(entry.name) === ".md"
                ) {
                    const stats = await fs.promises.stat(fullPath);
                    latestModification = Math.max(
                        latestModification,
                        stats.mtimeMs
                    );
                }
            }
        }

        await checkDirectory(vaultPath);

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

// Update notes information for connected vault
async function updateNotesInformation(vaultPath, force = false) {
    try {
        log("Checking if notes information update is needed");

        // Skip update if vault hasn't been modified
        if (!force && !(await needsUpdate(vaultPath))) {
            const message = "Vault is up to date, skipping scan";
            log(message);
            vscode.window.showInformationMessage(message);
            return;
        }

        log("Starting notes information update");
        const notes = await loadVaultNotes(vaultPath);

        // Clear and update cache
        notesCache.clear();
        notes.forEach((note) => {
            const relativePath = path.relative(vaultPath, note.path);
            notesCache.set(relativePath, {
                fullPath: note.path,
                aliases: note.aliases,
            });
        });

        // Update last update timestamp
        lastUpdateTime = Date.now();

        // Log results
        outputChannel.appendLine(
            `\nUpdated information for ${notes.length} notes:`
        );
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

//Recursively scans vault directory for markdown files and extracts aliases
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

        async function scanDirectory(dirPath) {
            const entries = await fs.promises.readdir(dirPath, {
                withFileTypes: true,
            });

            for (const entry of entries) {
                const fullPath = path.join(dirPath, entry.name);

                if (entry.isDirectory()) {
                    await scanDirectory(fullPath);
                } else if (
                    entry.isFile() &&
                    path.extname(entry.name) === ".md"
                ) {
                    const aliases = await extractAliases(fullPath);
                    const noteInfo = {
                        path: fullPath,
                        aliases: aliases,
                    };
                    notes.push(noteInfo);

                    // Log note info
                    log(`Found note: ${fullPath}`);
                    if (aliases.length > 0) {
                        log(`  Aliases: ${aliases.join(", ")}`);
                    }
                }
            }
        }

        await scanDirectory(vaultPath);
        log(`Total notes found: ${notes.length}`);
        return notes;
    } catch (error) {
        log(`Vault scan failed: ${error.message}`);
        throw error;
    }
}

// Hover provider for notes and aliases
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
            };
        }
    }
    return null;
}

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

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    // Initialize logging and cache systems
    initializeLogging();
    notesCache.clear();
    lastUpdateTime = 0;
    log("Extension activated!");

    // Command registration for connect
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

    // Register command for updating notes information
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

    // Hover provider registration
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

            if (match) {
                const message = new vscode.MarkdownString("", true);
                message.isTrusted = true;
                message.supportHtml = true;

                const obsidianUri = createObsidianUri(
                    connectedVault,
                    match.path
                );

                if (obsidianUri) {
                    // Create content with direct URI link
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
                            JSON.stringify([obsidianUri])
                        )})`
                    );
                }

                return new vscode.Hover(message);
            }
        },
    });

    // Command registration for opening Obsidian URIs
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

    context.subscriptions.push(
        connectCommand,
        updateCommand,
        hoverProvider,
        openUriCommand
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
