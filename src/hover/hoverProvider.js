const vscode = require("vscode");
const path = require("path");
const { log } = require("../utils/logging");
const { canonicalNormalize } = require("../utils/normalizer");
const { SEARCH_CONFIG } = require('../config/searchConfig');
const { deconstructToken } = require("../utils/tokenDeconstructor");

/**
 * Registers the hover provider for Obsidian tooltips.
 * @param {vscode.ExtensionContext} context - The extension context.
 * @param {Map<string, Map<string, {path: string, isFileName: boolean}[]>>} lookupCache - The cache for quick note lookups.
 * @param {Map<string, object>} notesCache - A cache containing detailed information about each note.
 * @param {function(string): Promise<string>} getNoteContent - A function to retrieve the content of a note.
 * @returns {vscode.Disposable} A disposable object that can be used to unregister the provider.
 */
function registerHoverProvider(
    context,
    lookupCache,
    notesCache,
    getNoteContent
) {
    return vscode.languages.registerHoverProvider(
        { scheme: "file", pattern: "**/*" },
        {
            /**
             *FUNC - Provides hover content for a given document and position.
             */
            async provideHover(document, position) {
                if (!context.globalState.get("connectedVault")) return null;

                // --- 1. Candidate Extraction ---
                const pattern = SEARCH_CONFIG.LANGUAGE_PATTERNS[document.languageId] || SEARCH_CONFIG.LANGUAGE_PATTERNS['default'];
                const maxTokenRange = document.getWordRangeAtPosition(position, pattern);
                if (!maxTokenRange) return null;

                const maxToken = document.getText(maxTokenRange);
                const candidates = deconstructToken(maxToken);
                log(`[Hover] Candidates for "${maxToken}": [${candidates.join(', ')}]`);

                // --- 2. Maximum Relevance Search ---
                for (const candidate of candidates) {
                    const normalizedCandidate = canonicalNormalize(candidate);
                    const shelf = lookupCache.get(normalizedCandidate);

                    if (shelf) {

                        // Priority 1: Perfect match.
                        if (shelf.has(candidate)) {
                            log(`[Hover] SUCCESS: Found a PERFECT match for candidate: "${candidate}"`);
                            return createHover(shelf.get(candidate), maxTokenRange, notesCache, getNoteContent);
                        }

                        // Priority 2: Best fuzzy match.
                        // This handles cases like `note()` vs `note` in code.
                        let potentialMatches = [];
                        for (const [originalKey, paths] of shelf.entries()) {
                            if (canonicalNormalize(originalKey) === normalizedCandidate) {
                                potentialMatches.push({ originalKey, paths });
                            }
                        }

                        if (potentialMatches.length > 0) {
                            // Find the match with the smallest length difference to the code candidate.
                            potentialMatches.sort((a, b) =>
                                Math.abs(a.originalKey.length - candidate.length) -
                                Math.abs(b.originalKey.length - candidate.length)
                            );
                            const bestMatch = potentialMatches[0];
                            log(`[Hover] SUCCESS: Best fuzzy match for "${candidate}" is "${bestMatch.originalKey}"`);
                            return createHover(bestMatch.paths, maxTokenRange, notesCache, getNoteContent);
                        }
                    }
                }

                log(`[Hover] No match found for any candidate.`);
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
        log(`Error: No data found in notesCache for path ${primaryNoteInfo.path}`);
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
                message.appendMarkdown(`*(source: ${info.isFileName ? "file name" : "alias"})*\n`);
            }
        });
        message.appendMarkdown(`---\n`);
    }
    const noteTitle = path.basename(primaryNoteData.relativePath, ".md");
    message.appendMarkdown(`**${noteTitle}**\n`);
    message.appendMarkdown(`*Source: ${primaryNoteInfo.isFileName ? "file name" : "alias"}*\n\n`);
    message.appendMarkdown(`📁 \`${primaryNoteData.relativePath}\`\n`);
    if (primaryNoteData.aliases && primaryNoteData.aliases.length > 0) {
        message.appendMarkdown(`🏷️ *${primaryNoteData.aliases.join(", ")}*\n`);
    }
    message.appendMarkdown(
        `\n[🔗 Open in Obsidian](command:obsidian-tooltips.openObsidianUri?${encodeURIComponent(
            JSON.stringify([primaryNoteData.uri])
        )})`
    );
    const noteContentDisplay = vscode.workspace.getConfiguration("obsidian-tooltips").get("noteContentDisplay");
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

module.exports = {
    registerHoverProvider
};