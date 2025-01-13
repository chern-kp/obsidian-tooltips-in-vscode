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

/**
 * Find the path to the Obsidian program
 */
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
            log('Connect With Obsidian command triggered');
            const obsidianPath = await findObsidian();

            if (obsidianPath) {
                await context.globalState.update('obsidianPath', obsidianPath);
                log(`Obsidian path saved: ${obsidianPath}`);
            } else {
                // If Obsidian is not found, open a file picker dialog
                log('Opening file picker dialog');
                const result = await vscode.window.showOpenDialog({
                    canSelectFiles: true,
                    canSelectFolders: false,
                    canSelectMany: false,
                    title: 'Open Obsidian execution file',
                    filters: {
                        'Executable': ['exe', 'app', '']
                    },
                    // Open in AppData\Local, if on Windows
                    defaultUri: os.platform() === 'win32'
                        ? vscode.Uri.file(path.join(process.env.LOCALAPPDATA, 'Obsidian'))
                        : undefined
                });

                if (result && result[0]) {
                    await context.globalState.update('obsidianPath', result[0].fsPath);
                    log(`Obsidian path manually set: ${result[0].fsPath}`);
                } else {
                    log('File picker cancelled by user');
                }
            }
        } catch (error) {
            log(`Error occurred: ${error.message}`);
            log(`Stack trace: ${error.stack}`);
            vscode.window.showErrorMessage(`Error: ${error.message}`);
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