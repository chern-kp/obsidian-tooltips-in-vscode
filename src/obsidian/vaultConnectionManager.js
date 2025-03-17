const vscode = require("vscode");
const os = require("os");
const path = require("path");
const fs = require("fs");
const { isVaultModified } = require("./noteFetcher");

// FUNC - Registering the connect command
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

                // Check current connection status
                if (connectedVault) {
                    await context.globalState.update("connectedVault", undefined);
                    notesCache.clear();
                    lastUpdateTime = 0;
                    // Clear cache file
                    await saveCache(context, new Map(), 0, log);
                    vscode.window.showInformationMessage(`Disconnected from vault: ${connectedVault}`);
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
                        // @ts-ignore
                        if (typeof selectedVault === 'object' && selectedVault !== null && 'description' in selectedVault) {
                            // @ts-ignore
                            const vaultPath = selectedVault.description;

                            await context.globalState.update(
                                "connectedVault",
                                vaultPath
                            );

                            try {
                                // Initial vault scan on connection
                                const result = await updateNotesInformation(
                                    vaultPath,
                                    true,
                                    context,
                                    notesCache,
                                    lastUpdateTime,
                                    new Set(["Notes In Root"])
                                );
                                notesCache = result.notesCache;
                                lastUpdateTime = result.lastUpdateTime;

                                // Let user pick directories on connection
                                await pickDirectories(
                                    vaultPath,
                                    context,
                                    new Set(["Notes In Root"]),
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
}

// FUNC - Let user pick directories to include
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
        // Check if vault is connected
        if (!vaultPath) {
            vscode.window.showWarningMessage("Please connect to an Obsidian vault first");
            return;
        }

        // Ensure selectedDirectories is always a Set
        if (!selectedDirectories || !(selectedDirectories instanceof Set)) {
            selectedDirectories = new Set(["Notes In Root"]);
            log("Initializing selectedDirectories with default value");
        }

        // Check if vault has been modified
        const needsRefresh = await isVaultModified(vaultPath, lastUpdateTime);
        if (needsRefresh) {
            log("Vault has been modified. Updating notes information before directory selection...");
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
        }

        // Load previously selected directories from global state
        const savedDirectories = vscodeContext.globalState.get("selectedDirectories") || [];
        selectedDirectories = new Set(savedDirectories);

        // Get root directories from vault
        const rootDirs = await getRootDirectories(vaultPath, log);
        log(`Found ${rootDirs.length} root directories in vault`);

        // Prepare items for QuickPick
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
        quickPick.selectedItems = items.filter((item) => item.picked);
        quickPick.title = "Select Directories to Include";
        quickPick.placeholder = "Choose directories (at least one must be selected)";

        // Handle real-time selection changes
        quickPick.onDidChangeSelection((selectedItems) => {
            const selectedLabels = selectedItems.map((item) => item.label);

            // Prevent empty selection
            if (selectedItems.length === 0) {
                vscode.window.showWarningMessage("At least one directory must be selected");
                return;
            }

            // Update selected directories
            selectedDirectories = new Set(selectedLabels);
            log(`Selection changed: ${selectedLabels.join(", ")}`);
        });

        // Handle selection confirmation
        quickPick.onDidAccept(async () => {
            const selectedLabels = quickPick.selectedItems.map((item) => item.label);

            // Prevent empty selection
            if (selectedLabels.length === 0) {
                vscode.window.showWarningMessage("At least one directory must be selected");
                return;
            }

            try {
                // Save selection to global state
                await vscodeContext.globalState.update(
                    "selectedDirectories",
                    Array.from(selectedDirectories)
                );
                log(`Saved directory selection: ${selectedLabels.join(", ")}`);

                // Update notes information based on selection
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

                // Save cache after notes information update
                await saveCache(vscodeContext, notesCache, lastUpdateTime, log);
                log("Cache saved after directory selection update");

                vscode.window.showInformationMessage("Directory selection updated successfully");
            } catch (error) {
                log(`Error during directory selection update: ${error.message}`);
                vscode.window.showErrorMessage(`Failed to update directory selection: ${error.message}`);
            }

            quickPick.hide();
        });

        quickPick.show();
    } catch (error) {
        log(`Error in pickDirectories: ${error.message}`);
        vscode.window.showErrorMessage(`Failed to load directories: ${error.message}`);
    }

    return selectedDirectories;
}

// FUNC - Get root directories from vault
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
