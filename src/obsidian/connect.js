const vscode = require('vscode');
const os = require('os');
const path = require('path');

function registerConnectCommand(context, notesCache, lastUpdateTime, saveCache, log, findObsidian, getObsidianVaults, updateNotesInformation, pickDirectories) {
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
                        await saveCache(context, notesCache, lastUpdateTime, log) // Corrected: Pass context to saveCache
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
                            await context.globalState.update(
                                "connectedVault",
                                // @ts-ignore
                                selectedVault.description
                            );
                            try {
                                // Initial vault scan on connection
                                await updateNotesInformation(
                                    // @ts-ignore
                                    selectedVault.description,
                                    true
                                );

                                // Let user pick directories on connection
                                // @ts-ignore
                                await pickDirectories(selectedVault.description);
                            } catch (error) {
                                vscode.window.showErrorMessage(
                                    `Failed to scan vault: ${error.message}`
                                );
                            }
                            vscode.window.showInformationMessage(
                                // @ts-ignore
                                `Connected to vault: ${selectedVault.description}`
                            );
                            // @ts-ignore
                            log(`Vault connected: ${selectedVault.description}`);
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

module.exports = { registerConnectCommand };