const vscode = require("vscode");
const path = require("path");
const { log } = require("../utils/logging");

/**
 * FUNC - Registers the Hover Provider for the extension.
 * This provider is responsible for detecting keywords in the editor and displaying note tooltips when the user hovers over a matched word.
 *
 * @param {vscode.ExtensionContext} context The VS Code extension context.
 * @param {Map<string, object>} notesCache A Map containing cached Obsidian notes information.
 * @param {object} SEARCH_CONFIG Configuration for search, including `WORD_PATTERN` and `CASE_INSENSITIVE`.
 * @param {function(string): Promise<string>} getNoteContent Function to retrieve the content of a note.
 * @param {function(string, Map<string, object>, object): object|null} findNoteMatch Function to find a matching note in the cache.
 * @returns {vscode.Disposable} The registered HoverProvider disposable.
 */
function registerHoverProvider(
    context,
    notesCache,
    SEARCH_CONFIG,
    getNoteContent,
    findNoteMatch
) {
    return vscode.languages.registerHoverProvider(
        { scheme: "file", pattern: "**/*" }, // Register for all file types
        {
            /**
             * FUNC - Provides hover content for a given document and position.
             * This method is called by VS Code when a user hovers over text.
             *
             * @param {vscode.TextDocument} document The document in which the hover was triggered.
             * @param {vscode.Position} position The position at which the hover was triggered.
             * @returns {Promise<vscode.Hover|undefined>} A Promise that resolves to a Hover object or undefined.
             */
            async provideHover(document, position) {
                const connectedVault =
                    context.globalState.get("connectedVault");
                log(
                    `Hover triggered at position: ${position.line}:${position.character}`
                );
                log(`Connected vault: ${connectedVault}`);
                log(`Current notesCache size: ${notesCache.size}`);

                // If no vault is connected, skip providing hover content
                if (!connectedVault) {
                    log("No connected vault found, skipping hover");
                    return;
                }

                // Get the word range at the current position using the configured WORD_PATTERN
                const range = document.getWordRangeAtPosition(
                    position,
                    SEARCH_CONFIG.WORD_PATTERN
                );
                if (!range) {
                    log("No word found at hover position");
                    return;
                }

                const word = document.getText(range);
                log(`Found word at hover: "${word}"`);

                log(`Checking search parameters:
- word: ${word}
- notesCache available: ${notesCache !== undefined}
- notesCache size: ${notesCache?.size}
- SEARCH_CONFIG available: ${SEARCH_CONFIG !== undefined}
- SEARCH_CONFIG pattern: ${SEARCH_CONFIG?.WORD_PATTERN}`);

                // Find a matching note in the cache based on the hovered word
                const match = findNoteMatch(word, notesCache, SEARCH_CONFIG);
                log(`Match result: ${match ? JSON.stringify(match) : "null"}`);

                // If a match is found and it has an Obsidian URI, construct the hover message
                if (match && match.uri) {
                    const message = new vscode.MarkdownString("", true);
                    message.isTrusted = true; // Allow external links and commands
                    message.supportHtml = true; // Enable HTML content

                    // Get cached note info for  aliases
                    const noteInfo = notesCache.get(match.path);
                    log(
                        `Note info from cache: ${
                            noteInfo ? JSON.stringify(noteInfo) : "null"
                        }`
                    );

                    // Add note title to the hover message
                    const noteTitle = path.basename(match.path, ".md");
                    message.appendMarkdown(`**${noteTitle}**\n\n`);

                    // Add relative path
                    message.appendMarkdown(`📁 \`${match.path}\`\n`);

                    // Add aliases (if available)
                    if (noteInfo?.aliases?.length > 0) {
                        message.appendMarkdown(
                            `🏷️ ${noteInfo.aliases.join(", ")}\n`
                        );
                    }

                    // Add a clickable link to open the note in Obsidian
                    message.appendMarkdown(
                        `\n[🔗 Open in Obsidian](command:obsidian-tooltips.openObsidianUri?${encodeURIComponent(
                            JSON.stringify([match.uri])
                        )})`
                    );

                    // Check user configuration for displaying note content
                    const noteContentDisplay = vscode.workspace
                        .getConfiguration("obsidian-tooltips")
                        .get("noteContentDisplay");

                    // If configured to show content until the first header, retrieve and append it
                    if (noteContentDisplay === "showPreHeader") {
                        try {
                            const content = await getNoteContent(
                                match.fullPath
                            );
                            if (content) {
                                message.appendMarkdown(
                                    `\n\n\`\`\`\n${content}\n\`\`\``
                                );
                                log(
                                    `Pre-header content for ${match.path}:\n${content}`
                                );
                            }
                        } catch (error) {
                            log(`Note content error: ${error.message}`);
                        }
                    }

                    return new vscode.Hover(message);
                } else {
                    log("No matching note found for hover word");
                }
            },
        }
    );
}

module.exports = { registerHoverProvider };
