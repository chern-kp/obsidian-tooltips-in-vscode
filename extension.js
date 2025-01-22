const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Create global output channel for logging
let outputChannel;

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

    if (platform === 'win32') {
        // Common Windows path
        const localAppData = process.env.LOCALAPPDATA;
        obsidianPath = path.join(localAppData, 'Obsidian', 'Obsidian.exe');
        log(`Checking Windows path: ${obsidianPath}`);
    } else if (platform === 'darwin') {
        // Common macOS path
        obsidianPath = '/Applications/Obsidian.app';
        log(`Checking macOS path: ${obsidianPath}`);
    } else if (platform === 'linux') {
        // Common Linux path
        obsidianPath = path.join(os.homedir(), '.local/bin/obsidian');
        log(`Checking Linux path: ${obsidianPath}`);
    }

    try {
        await fs.promises.access(obsidianPath, fs.constants.F_OK);
        log(`Obsidian found at: ${obsidianPath}`);
        return obsidianPath;
    } catch {
        log('Obsidian not found in default location');
        return null;
    }
}



function getObsidianConfigPath() {
    const platform = os.platform();
    let configPath;

    if (platform === 'win32') {
        configPath = path.join(process.env.APPDATA, 'Obsidian', 'obsidian.json');
    } else if (platform === 'darwin') {
        configPath = path.join(os.homedir(), 'Library/Application Support/Obsidian/obsidian.json');
    } else {
        configPath = path.join(os.homedir(), '.config/Obsidian/obsidian.json');
    }

    log(`Calculated config path: ${configPath}`);
    return configPath;
}

async function getObsidianVaults() {
    try {
        const configPath = getObsidianConfigPath();
        await fs.promises.access(configPath, fs.constants.R_OK);
        const configRaw = await fs.promises.readFile(configPath, 'utf-8');
        const config = JSON.parse(configRaw);

        return config.vaults
            ? Object.values(config.vaults).map(v => v.path)
            : [];
    } catch (error) {
        log(`Failed to read Obsidian config: ${error.message}`);
        return [];
    }
}

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    // Initialize logging system
    initializeLogging();
    log('Extension activated!');

    // Command registration
    let connectCommand = vscode.commands.registerCommand('obsidian-tooltips.connectWithObsidian', async () => {
        try {
            // Check current connection status
            const connectedVault = context.globalState.get('connectedVault');

            if (connectedVault) {
                // Disconnect logic
                await context.globalState.update('connectedVault', undefined);
                vscode.window.showInformationMessage(`Disconnected from vault: ${connectedVault}`);
                log(`Vault disconnected: ${connectedVault}`);
                return;
            }

            log('Connect With Obsidian command triggered');

            // Obsidian detection logic
            const obsidianPath = await findObsidian();

            if (obsidianPath) {
                await context.globalState.update('obsidianPath', obsidianPath);
                log(`Obsidian path saved: ${obsidianPath}`);

                const vaults = await getObsidianVaults();
                if (vaults.length === 0) {
                    vscode.window.showInformationMessage('No Obsidian vaults found!');
                    return;
                }

                const selectedVault = await vscode.window.showQuickPick(
                    vaults.map(path => ({
                        label: path.split(/[\\/]/).pop(), // Display vault name
                        description: path, // Full path as description
                        detail: path // Full path again
                    })),
                    {
                        placeHolder: 'Select a vault to connect',
                        ignoreFocusOut: true
                    }
                );

                if (selectedVault) {
                    await context.globalState.update('connectedVault', selectedVault.description);
                    vscode.window.showInformationMessage(`Connected to vault: ${selectedVault.description}`);
                    log(`Vault connected: ${selectedVault.description}`);
                }
            } else {
                // Manual path selection
                log('Opening file picker dialog');
                const result = await vscode.window.showOpenDialog({
                    canSelectFiles: true,
                    canSelectFolders: false,
                    canSelectMany: false,
                    title: 'Locate Obsidian Executable',
                    filters: {'Executable': ['exe', 'app', '']},
                    defaultUri: os.platform() === 'win32'
                        ? vscode.Uri.file(path.join(process.env.LOCALAPPDATA, 'Obsidian'))
                        : undefined
                });

                if (result?.[0]?.fsPath) {
                    await context.globalState.update('obsidianPath', result[0].fsPath);
                    log(`Obsidian path manually set: ${result[0].fsPath}`);
                    vscode.window.showInformationMessage('Select a vault to connect');
                } else {
                    log('File picker cancelled by user');
                }
            }
        } catch (error) {
            const errorMessage = `Connection error: ${error.message}`;
            log(errorMessage);
            log(`Stack trace: ${error.stack}`);
            vscode.window.showErrorMessage(errorMessage);
        }
    });

    // Hover provider registration
    const hoverProvider = vscode.languages.registerHoverProvider('*', {
        provideHover(document, position) {
            // Get the word at the current cursor position
            const range = document.getWordRangeAtPosition(position);
            if (!range) {
                return;
            }
            const word = document.getText(range);

            // Check if the word is "Hello"
            if (word === 'Hello') {
                log(`Hover triggered for word: ${word}`);
                return new vscode.Hover('This is a tooltip for the word "Hello"!');
            }
        }
    });

    // Add to subscriptions
    context.subscriptions.push(connectCommand, hoverProvider);
    log('Extension fully initialized');
}

function deactivate() {
    log('Extension deactivated');
}

module.exports = {
    activate,
    deactivate
};