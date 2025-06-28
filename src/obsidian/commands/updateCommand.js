const vscode = require("vscode");
const { isVaultModified } = require("../noteFetcher");

/**
 * FUNC - Registers the "Update Notes Information" command.
 * This command allows the user to manually trigger an update of the Obsidian notes cache.
 * It checks if a vault is connected and if the vault has been modified since the last update.
 *
 * @param {vscode.ExtensionContext} context The VS Code extension context.
 * @param {Map<string, object>} notesCache A Map to store cached notes information.
 * @param {number} lastUpdateTime The timestamp of the last notes update.
 * @param {function(vscode.ExtensionContext, Map<string, object>, number, function): Promise<void>} saveCache Function to save the notes cache.
 * @param {function(string): void} log Logging function.
 * @param {function(string, boolean, vscode.ExtensionContext, Map<string, object>, number, Set<string>): Promise<{notesCache: Map<string, object>, lastUpdateTime: number}>} updateNotesInformation Function to update notes information.
 * @returns {vscode.Disposable} The registered command disposable.
 */
function registerUpdateCommand(
    context,
    notesCache,
    lastUpdateTime,
    saveCache,
    log,
    updateNotesInformation
) {
    return vscode.commands.registerCommand(
        "obsidian-tooltips.updateNotesInformation",
        async () => {
            try {
                const vaultPath = context.globalState.get("connectedVault");
                if (!vaultPath) {
                    vscode.window.showWarningMessage(
                        "Please connect to an Obsidian vault first"
                    );
                    return;
                }

                const savedDirs = context.globalState.get("selectedDirectories");
                const selectedDirectories = savedDirs ? new Set(savedDirs) : new Set(["Notes In Root"]);

                // Check if vault has been modified since the last update
                const needsRefresh = await isVaultModified(vaultPath, lastUpdateTime);
                if (!needsRefresh) {
                    vscode.window.showInformationMessage(
                        "Notes are up to date"
                    );
                    return;
                }

                // Update notes information by scanning the vault
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

                // Save the updated cache locally
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