const vscode = require("vscode");
const { isVaultModified } = require("../noteFetcher");
const { getRootDirectories } = require("../vaultConnectionManager");

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

        // Load previously selected directories from global state and convert to Set
        const savedDirs = vscodeContext.globalState.get("selectedDirectories");
        selectedDirectories = savedDirs ? new Set(savedDirs) : new Set(["Notes In Root"]);

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

// FUNC - Registering the pick directories command
function registerPickDirectoriesCommand(
    context,
    notesCache,
    lastUpdateTime,
    saveCache,
    log,
    updateNotesInformation
) {
    return vscode.commands.registerCommand(
        "obsidian-tooltips.pickDirectories",
        async () => {
            try {
                const vaultPath = context.globalState.get("connectedVault");
                const savedDirs = context.globalState.get("selectedDirectories");
                const selectedDirectories = savedDirs ? new Set(savedDirs) : new Set(["Notes In Root"]);

                await pickDirectories(
                    vaultPath,
                    context,
                    selectedDirectories,
                    notesCache,
                    lastUpdateTime,
                    saveCache,
                    log,
                    updateNotesInformation
                );
            } catch (error) {
                const errorMessage = `Failed to pick directories: ${error.message}`;
                log(errorMessage);
                log(`Stack trace: ${error.stack}`);
                vscode.window.showErrorMessage(errorMessage);
            }
        }
    );
}

module.exports = {
    registerPickDirectoriesCommand,
    pickDirectories
};