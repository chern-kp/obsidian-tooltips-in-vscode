const vscode = require("vscode");
const os = require("os");
const path = require("path");
const fs = require("fs");

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
                    // Clear cache file instead of deleting
                    try {
                        await saveCache(
                            context,
                            notesCache,
                            lastUpdateTime,
                            log
                        );
                        log("Cache cleared on disconnect");
                    } catch (error) {
                        log(`Error clearing cache file: ${error.message}`);
                    }
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
                                await updateNotesInformation(
                                    vaultPath,
                                    true
                                );

                                // Let user pick directories on connection - передаем все требуемые параметры
                                await pickDirectories(
                                    vaultPath,
                                    context,
                                    null,
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
    return connectCommand;
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
        // Load previously selected directories from global state
        const savedDirectories =
            vscodeContext.globalState.get("selectedDirectories") || [];
        selectedDirectories = new Set(savedDirectories);

        // Get root directories from vault
        const rootDirs = await getRootDirectories(vaultPath, log);

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
