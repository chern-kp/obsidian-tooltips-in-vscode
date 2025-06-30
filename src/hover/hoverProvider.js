const vscode = require("vscode");
const path = require("path");
const { log } = require("../utils/logging");
const { normalize } = require("../utils/normalizer");
const { SEARCH_CONFIG } = require("../config/searchConfig");

/**
 * FUNC - Registers the hover provider for Obsidian tooltips.
 * @param {vscode.ExtensionContext} context - The extension context.
 * @param {Map<string, Map<string, {path: string, isFileName: boolean}[]>>} lookupCache - The cache for quick note lookups.
 * @param {string[]} multiWordKeys - An array of multi-word keys for slower, more complex lookups.
 * @param {Map<string, object>} notesCache - A cache containing detailed information about each note.
 * @param {function(string): Promise<string>} getNoteContent - A function to retrieve the content of a note.
 * @returns {vscode.Disposable} A disposable object that can be used to unregister the provider.
 */
function registerHoverProvider(
    context,
    lookupCache,
    multiWordKeys,
    notesCache,
    getNoteContent
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
                if (!connectedVault) {
                    return;
                }

                // Case 1. Fast search if the key is a single word
                const wordRange = document.getWordRangeAtPosition(
                    position,
                    SEARCH_CONFIG.SMART_WORD_PATTERN
                );

                if (wordRange) {
                    const foundToken = document.getText(wordRange);
                    log(`Fast path: found token "${foundToken}"`);
                    const normalizedToken = normalize(foundToken);
                    const shelf = lookupCache.get(normalizedToken);

                    if (shelf && shelf.has(foundToken)) {
                        const foundPaths = shelf.get(foundToken);
                        if (foundPaths && foundPaths.length > 0) {
                            log(
                                `Fast path: Found ${foundPaths.length} match(es) for "${foundToken}"`
                            );
                            // Create hover content for the found paths
                            return createHover(
                                foundPaths,
                                wordRange,
                                notesCache,
                                getNoteContent
                            );
                        }
                    }
                }

                // Case 2. Slow search for multi-word keys
                const lineText = document.lineAt(position).text;
                for (const multiWordKey of multiWordKeys) {
                    const regex = new RegExp(escapeRegExp(multiWordKey), "g");
                    let match;
                    while ((match = regex.exec(lineText)) !== null) {
                        const start = match.index;
                        const end = start + multiWordKey.length;

                        if (
                            position.character >= start &&
                            position.character <= end
                        ) {
                            log(
                                `Slow path: cursor is inside multi-word key "${multiWordKey}"`
                            );
                            const range = new vscode.Range(
                                position.line,
                                start,
                                position.line,
                                end
                            );
                            const normalizedKey = normalize(multiWordKey);
                            const shelf = lookupCache.get(normalizedKey);

                            if (shelf && shelf.has(multiWordKey)) {
                                const foundPaths = shelf.get(multiWordKey);
                                log(
                                    `Slow path: Found ${foundPaths.length} match(es) for "${multiWordKey}"`
                                );
                                return createHover(
                                    foundPaths,
                                    range,
                                    notesCache,
                                    getNoteContent
                                );
                            }
                        }
                    }
                }

                //Case 3. No match found
                log("No match found by either fast or slow path.");
                return null;
            },
        }
    );
}

/**
 * Creates a vscode.Hover object with detailed information about a found note.
 * @param {Array<{path: string, isFileName: boolean}>} foundPaths - An array of objects representing the found notes.
 * @param {vscode.Range} range - The range in the document where the hover is triggered.
 * @param {Map<string, object>} notesCache - A cache containing detailed information about each note.
 * @param {function(string): Promise<string>} getNoteContent - A function to retrieve the content of a note.
 * @returns {Promise<vscode.Hover|undefined>} A promise that resolves to a Hover object or undefined if the note data is not found.
 */
async function createHover(foundPaths, range, notesCache, getNoteContent) {
    const primaryNoteInfo = foundPaths[0];
    const otherNoteInfos = foundPaths.slice(1);

    const primaryNoteData = notesCache.get(primaryNoteInfo.path);
    if (!primaryNoteData) {
        log(
            `Error: No data found in notesCache for path ${primaryNoteInfo.path}`
        );
        return;
    }

    const message = new vscode.MarkdownString("", true);
    message.isTrusted = true;
    message.supportHtml = true;

    if (otherNoteInfos.length > 0) {
        message.appendMarkdown(`**Similar notes found:**\n`);
        otherNoteInfos.forEach((info) => {
            const noteData = notesCache.get(info.path);
            if (noteData) {
                const noteName = path.basename(noteData.relativePath, ".md");
                message.appendMarkdown(`- [${noteName}](${noteData.uri}) `);
                message.appendMarkdown(
                    `*(source: ${info.isFileName ? "file name" : "aliases"})*\n`
                );
            }
        });
        message.appendMarkdown(`---\n`);
    }
    const noteTitle = path.basename(primaryNoteData.relativePath, ".md");
    message.appendMarkdown(`**${noteTitle}**\n`);
    message.appendMarkdown(
        `*${primaryNoteInfo.isFileName ? "file  name" : "from alias"}*\n\n`
    );
    message.appendMarkdown(`📁 \`${primaryNoteData.relativePath}\`\n`);

    if (primaryNoteData.aliases && primaryNoteData.aliases.length > 0) {
        message.appendMarkdown(`🏷️ *${primaryNoteData.aliases.join(", ")}*\n`);
    }

    message.appendMarkdown(
        `\n[🔗 Open in Obsidian](command:obsidian-tooltips.openObsidianUri?${encodeURIComponent(
            JSON.stringify([primaryNoteData.uri])
        )})`
    );
    const noteContentDisplay = vscode.workspace
        .getConfiguration("obsidian-tooltips")
        .get("noteContentDisplay");
    if (noteContentDisplay === "showPreHeader") {
        try {
            const content = await getNoteContent(primaryNoteData.fullPath);
            if (content) {
                message.appendMarkdown(`\n\n---\n${content}`);
            }
        } catch (error) {
            log(`Note content error: ${error.message}`);
        }
    }
    return new vscode.Hover(message, range);
}

/**
 * Escapes special characters in a string for use in a regular expression.
 * @param {string} string - The input string to escape.
 * @returns {string} - The escaped string.
 */
function escapeRegExp(string) {
    if (!string) return "";
    return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

module.exports = {
    registerHoverProvider
};