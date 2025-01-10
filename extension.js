const vscode = require('vscode');

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    console.log('Your extension "obsidian-tooltips" is now active!');

    // Register a hover provider for all file types
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
                // Return a hover object with the tooltip text
                return new vscode.Hover('This is a tooltip for the word "Hello"!');
            }
        }
    });

    // Add the hover provider to the subscriptions
    context.subscriptions.push(hoverProvider);
}

function deactivate() {}

module.exports = {
    activate,
    deactivate
};