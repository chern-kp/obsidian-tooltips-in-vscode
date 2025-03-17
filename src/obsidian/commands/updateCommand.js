const vscode = require("vscode");
const { isVaultModified } = require("../noteFetcher");

// FUNC - Registering the update command
function registerUpdateCommand(
    context,
    notesCache,
    lastUpdateTime,
    saveCache,
    log,
    updateNotesInformation
) {
    return vscode.commands.registerCommand(
        "obsidian-tooltips.updateNotes",
        async () => {
            try {
                const vaultPath = context.globalState.get("connectedVault");
                if (!vaultPath) {
                    vscode.window.showWarningMessage(
                        "Please connect to an Obsidian vault first"
                    );
                    return;
                }

                const selectedDirectories = context.globalState.get("selectedDirectories") || new Set(["Notes In Root"]);

                // Check if vault has been modified
                const needsRefresh = await isVaultModified(vaultPath, lastUpdateTime);
                if (!needsRefresh) {
                    vscode.window.showInformationMessage(
                        "Notes are up to date"
                    );
                    return;
                }

                // Update notes information
                const result = await updateNotesInformation(
                    vaultPath,
                    true,
                    context,
                    notesCache,
                    lastUpdateTime,
                    selectedDirectories
                );
                notesCache = result.notesCache;
                lastUpdateTime = result.lastUpdateTime;

                // Save cache
                await saveCache(context, notesCache, lastUpdateTime, log);

                vscode.window.showInformationMessage(
                    "Notes updated successfully"
                );
            } catch (error) {
                const errorMessage = `Failed to update notes: ${error.message}`;
                log(errorMessage);
                log(`Stack trace: ${error.stack}`);
                vscode.window.showErrorMessage(errorMessage);
            }
        }
    );
}

module.exports = {
    registerUpdateCommand
};