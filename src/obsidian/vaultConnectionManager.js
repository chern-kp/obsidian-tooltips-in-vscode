const vscode = require("vscode");
const os = require("os");
const path = require("path");
const fs = require("fs");
const { isVaultModified } = require("./noteFetcher");


/**
 * Registers the "Connect With Obsidian" command.
 * This command allows the user to connect to or disconnect from an Obsidian vault.
 * It handles automatic detection of Obsidian installation and vaults,
 * or prompts the user to manually locate the Obsidian executable.
 *
 * @param {vscode.ExtensionContext} context The VS Code extension context.
 * @param {Map<string, object>} notesCache A Map to store cached notes information.
 * @param {number} lastUpdateTime The timestamp of the last notes update.
 * @param {function(vscode.ExtensionContext, Map<string, object>, number, function): Promise<void>} saveCache Function to save the notes cache.
 * @param {function(string): void} log Logging function.
 * @param {function(): Promise<string|null>} findObsidian Function to find the Obsidian executable path.
 * @param {function(): Promise<string[]>} getObsidianVaults Function to get a list of Obsidian vaults.
 * @param {function(string, boolean, vscode.ExtensionContext, Map<string, object>, number, Set<string>): Promise<{notesCache: Map<string, object>, lastUpdateTime: number}>} updateNotesInformation Function to update notes information.
 * @param {function(string, vscode.ExtensionContext, Set<string>, Map<string, object>, number, function, function, function): Promise<Set<string>>} pickDirectories Function to let the user pick directories to include.
 * @returns {vscode.Disposable} The registered command disposable.
 */
function registerConnectCommand(
    context,
    notesCache,
    lastUpdateTime,
    saveCache,
    log,
    findObsidian,
    getObsidianVaults,
    updateNotesInformation,
    pickDirectories
) {
    return vscode.commands.registerCommand(
        "obsidian-tooltips.connectWithObsidian",
        async () => {
            try {
                const connectedVault = context.globalState.get("connectedVault");

                // If a vault is already connected, disconnect it
                if (connectedVault) {
                    await context.globalState.update("connectedVault", undefined); // Clear connected vault from global state
                    notesCache.clear(); // Clear in-memory notes cache
                    lastUpdateTime = 0; // Reset last update time
                    await saveCache(context, new Map(), 0, log); // Clear cache file on disk
                    vscode.window.showInformationMessage(`Disconnected from vault: ${connectedVault}`);
                    return;
                }

                log("Connect With Obsidian command triggered");

                // Attempt to find the Obsidian executable automatically
                let obsidianPath = await findObsidian();

                if (!obsidianPath) {
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
                                : undefined, // Default path for Windows
                    });

                    if (result?.[0]?.fsPath) {
                        obsidianPath = result[0].fsPath;
                        log(`Obsidian path manually set: ${obsidianPath}`);
                    } else {
                        log("File picker cancelled by user");
                        return;
                    }
                }

                await context.globalState.update(
                    "obsidianPath",
                    obsidianPath
                );
                log(`Obsidian path saved: ${obsidianPath}`);

                // Get list of available Obsidian vaults
                const vaults = await getObsidianVaults();
                if (vaults.length === 0) {
                    vscode.window.showInformationMessage(
                        "No Obsidian vaults found!"
                    );
                    return;
                }

                // Prompt user to select a vault from the found list
                const selectedVault = await vscode.window.showQuickPick(
                    vaults.map((vaultPath) => ({
                        label: vaultPath.split(/[\\/]/).pop(), // Display vault name
                        description: vaultPath, // Full path as description
                        detail: vaultPath, // Full path as detail
                    })),
                    {
                        placeHolder: "Select a vault to connect",
                        ignoreFocusOut: true, // Keep quick pick open if focus is lost
                    }
                );

                if (selectedVault) {
                    // Ensure that 'description' property exists.
                    // @ts-ignore
                    if (typeof selectedVault === 'object' && selectedVault !== null && 'description' in selectedVault) {
                        // @ts-ignore
                        const vaultPath = selectedVault.description;

                        await context.globalState.update(
                            "connectedVault",
                            vaultPath
                        );

                        try {
                            // Perform an initial scan of the selected vault to update notes information
                            const result = await updateNotesInformation(
                                vaultPath,
                                true, // Force update
                                context,
                                notesCache,
                                lastUpdateTime,
                                new Set(["Notes In Root"]) // Default to scanning notes in root
                            );
                            notesCache = result.notesCache;
                            lastUpdateTime = result.lastUpdateTime;

                            // Prompt user to pick specific directories within the vault to scan.
                            await pickDirectories(
                                vaultPath,
                                context,
                                new Set(["Notes In Root"]), // Initial selected directories
                                notesCache,
                                lastUpdateTime,
                                saveCache,
                                log,
                                updateNotesInformation
                            );
                        } catch (error) {
                            vscode.window.showErrorMessage(
                                `Failed to scan vault: ${error.message}`
                            );
                        }

                        vscode.window.showInformationMessage(
                            `Connected to vault: ${vaultPath}`
                        );

                        log(`Vault connected: ${vaultPath}`);
                    } else {
                        log("Error: selectedVault is not a QuickPickItem or missing description property.");
                        vscode.window.showErrorMessage("Error connecting to vault. Please try again.");
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
}

/**
 * FUNC - Allows the user to pick which directories within the connected Obsidian vault should be scanned for notes.
 * This function presents a QuickPick UI with a list of root directories in the vault,
 * allowing the user to select multiple directories.
 *
 * @param {string} vaultPath The full path to the connected Obsidian vault.
 * @param {vscode.ExtensionContext} vscodeContext The VS Code extension context.
 * @param {Set<string>} selectedDirectories A Set containing the currently selected directories.
 * @param {Map<string, object>} notesCache A Map to store cached notes information.
 * @param {number} lastUpdateTime The timestamp of the last notes update.
 * @param {function(vscode.ExtensionContext, Map<string, object>, number, function): Promise<void>} saveCache Function to save the notes cache.
 * @param {function(string): void} log Logging function.
 * @param {function(string, boolean, vscode.ExtensionContext, Map<string, object>, number, Set<string>): Promise<{notesCache: Map<string, object>, lastUpdateTime: number}>} updateNotesInformation Function to update notes information.
 * @returns {Promise<Set<string>>} A Promise that resolves with the updated Set of selected directories.
 */
async function pickDirectories(
    vaultPath,
    vscodeContext,
    selectedDirectories,
    notesCache,
    lastUpdateTime,
    saveCache,
    log,
    updateNotesInformation
) {
    try {
        // Ensure a vault is connected before proceeding
        if (!vaultPath) {
            vscode.window.showWarningMessage("Please connect to an Obsidian vault first");
            return new Set(); // Return an empty set if no vault is connected
        }

        // Ensure selectedDirectories is always a Set, initializing with default if necessary
        if (!selectedDirectories || !(selectedDirectories instanceof Set)) {
            selectedDirectories = new Set(["Notes In Root"]);
            log("Initializing selectedDirectories with default value");
        }

        // Check if the vault has been modified and update notes information if needed, before presenting the directory selection to ensure the list of directories is current
        const needsRefresh = await isVaultModified(vaultPath, lastUpdateTime);
        if (needsRefresh) {
            log("Vault has been modified. Updating notes information before directory selection...");
            const result = await updateNotesInformation(
                vaultPath,
                true, // Force update
                vscodeContext,
                notesCache,
                lastUpdateTime,
                selectedDirectories
            );
            notesCache = result.notesCache;
            lastUpdateTime = result.lastUpdateTime;
        }

        // Load previously selected directories from global state to pre-select them in the QuickPick
        const savedDirectories = vscodeContext.globalState.get("selectedDirectories") || [];
        selectedDirectories = new Set(savedDirectories);

        // Get the top-level directories within the Obsidian vault
        const rootDirs = await getRootDirectories(vaultPath, log);
        log(`Found ${rootDirs.length} root directories in vault`);

        // Prepare QuickPick items, including a "Notes In Root" option
        const items = [
            {
                label: "Notes In Root",
                picked: selectedDirectories.has("Notes In Root"),
                alwaysShow: true,
                description: "Include notes directly in vault root"
            },
            ...rootDirs.map((dir) => ({
                label: dir,
                picked: selectedDirectories.has(dir),
                alwaysShow: true,
                description: `Include notes from ${dir} directory`
            })),
        ];

        const quickPick = vscode.window.createQuickPick();
        quickPick.items = items;
        quickPick.canSelectMany = true;
        quickPick.selectedItems = items.filter((item) => item.picked); // Pre-select saved items
        quickPick.title = "Select Directories to Include";
        quickPick.placeholder = "Choose directories (at least one must be selected)";

        // Handle real-time selection changes in the QuickPick
        quickPick.onDidChangeSelection((selectedItems) => {
            const selectedLabels = selectedItems.map((item) => item.label);

            // Prevent the user from deselecting all directories.
            if (selectedItems.length === 0) {
                vscode.window.showWarningMessage("At least one directory must be selected");
                return;
            }

            // Update the internal selectedDirectories Set
            selectedDirectories = new Set(selectedLabels);
            log(`Selection changed: ${selectedLabels.join(", ")}`);
        });

        // Handle confirmation of selection when the user accepts the QuickPick
        quickPick.onDidAccept(async () => {
            const selectedLabels = quickPick.selectedItems.map((item) => item.label);

            // Re-check for empty selection on accept to ensure validity
            if (selectedLabels.length === 0) {
                vscode.window.showWarningMessage("At least one directory must be selected");
                return;
            }

            try {
                // Save the new selection to VS Code's global state
                await vscodeContext.globalState.update(
                    "selectedDirectories",
                    Array.from(selectedDirectories)
                );
                log(`Saved directory selection: ${selectedLabels.join(", ")}`);

                // Update notes information based on the newly selected directories
                const result = await updateNotesInformation(
                    vaultPath,
                    true,
                    vscodeContext,
                    notesCache,
                    lastUpdateTime,
                    selectedDirectories
                );
                notesCache = result.notesCache;
                lastUpdateTime = result.lastUpdateTime;

                // Save the updated cache locally
                await saveCache(vscodeContext, notesCache, lastUpdateTime, log);
                log("Cache saved after directory selection update");

                vscode.window.showInformationMessage("Directory selection updated successfully");
            } catch (error) {
                log(`Error during directory selection update: ${error.message}`);
                vscode.window.showErrorMessage(`Failed to update directory selection: ${error.message}`);
            }

            quickPick.hide(); // Close the QuickPick UI
        });

        quickPick.show(); // Display the QuickPick UI to the user
    } catch (error) {
        log(`Error in pickDirectories: ${error.message}`);
        vscode.window.showErrorMessage(`Failed to load directories: ${error.message}`);
        return new Set(); // Return an empty set on error
    }

    return selectedDirectories;
}

/**
 * FUNC - Gets the names of top-level directories within a given vault.
 * It filters out hidden directories (starting with a dot).
 *
 * @param {string} vaultPath The full path to the Obsidian vault.
 * @param {function(string): void} log Logging function.
 * @returns {Promise<string[]>} A Promise that resolves with an array of directory names.
 * @throws {Error} If there is an error reading the directory.
 */
async function getRootDirectories(vaultPath, log) {
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

module.exports = {
    registerConnectCommand,
    pickDirectories,
    getRootDirectories,
};
