const vscode = require("vscode");
const path = require("path");
const { log } = require("../utils/logging");

function registerHoverProvider(
    context,
    notesCache,
    SEARCH_CONFIG,
    getNoteContent,
    findNoteMatch
) {
    return vscode.languages.registerHoverProvider(
        { scheme: "file", pattern: "**/*" },
        {
            async provideHover(document, position) {
                const connectedVault =
                    context.globalState.get("connectedVault");
                log(
                    `Hover triggered at position: ${position.line}:${position.character}`
                );
                log(`Connected vault: ${connectedVault}`);
                log(`Current notesCache size: ${notesCache.size}`);

                if (!connectedVault) {
                    log("No connected vault found, skipping hover");
                    return;
                }

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

                const match = findNoteMatch(word, notesCache, SEARCH_CONFIG);
                log(`Match result: ${match ? JSON.stringify(match) : "null"}`);

                if (match && match.uri) {
                    const message = new vscode.MarkdownString("", true);
                    message.isTrusted = true;
                    message.supportHtml = true;

                    // Get cached note info
                    const noteInfo = notesCache.get(match.path);
                    log(
                        `Note info from cache: ${
                            noteInfo ? JSON.stringify(noteInfo) : "null"
                        }`
                    );

                    // Note title
                    const noteTitle = path.basename(match.path, ".md");
                    message.appendMarkdown(`**${noteTitle}**\n\n`);

                    // Relative path
                    message.appendMarkdown(`📁 \`${match.path}\`\n`);

                    // Aliases
                    if (noteInfo?.aliases?.length > 0) {
                        message.appendMarkdown(
                            `🏷️ ${noteInfo.aliases.join(", ")}\n`
                        );
                    }

                    // Open button
                    message.appendMarkdown(
                        `\n[🔗 Open in Obsidian](command:obsidian-tooltips.openObsidianUri?${encodeURIComponent(
                            JSON.stringify([match.uri])
                        )})`
                    );

                    // Pre-header content
                    const noteContentDisplay = vscode.workspace
                        .getConfiguration("obsidian-tooltips")
                        .get("noteContentDisplay");

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
