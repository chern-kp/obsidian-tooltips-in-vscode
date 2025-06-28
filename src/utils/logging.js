const vscode = require('vscode');

/**
 * @global
 * @type {vscode.OutputChannel}
 * @description Global output channel for logging extension messages in VS Code into "Output" panel
 */
let outputChannel;

/**
 * FUNC - Initializes the output channel for logging.
 * This function creates a new output channel named "Obsidian Tooltips" and makes it visible.
 * It should be called once during extension activation.
 *
 * @returns {void}
 */
function initializeLogging() {
    outputChannel = vscode.window.createOutputChannel("Obsidian Tooltips");
    outputChannel.show(); // Show the output channel upon creation
}

/**
 * FUNC - Logs messages to the VS Code output channel.
 *
 * @param {string} message The message string to be logged.
 * @returns {void}
 */
function log(message) {
    outputChannel.appendLine(`[${new Date().toLocaleTimeString()}] ${message}`);
}

module.exports = {
    initializeLogging,
    log
};