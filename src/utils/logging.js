const vscode = require('vscode');

// Global output channel for logging
let outputChannel;

//FUNC - Initialize the output channel for logging
function initializeLogging() {
    outputChannel = vscode.window.createOutputChannel("Obsidian Tooltips");
    outputChannel.show();
}

//FUNC - Log messages to the VS Code output channel
function log(message) {
    outputChannel.appendLine(`[${new Date().toLocaleTimeString()}] ${message}`);
}

module.exports = {
    initializeLogging,
    log
};