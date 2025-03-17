const fs = require('fs');
const path = require('path');
const { log } = require('../utils/logging');
const { scanVaultDirectory } = require('./noteFetcher');
const { createObsidianUri } = require('../utils/noteUriHandler');

//FUNC - Load note names and aliases from list of files into an array
async function loadVaultNotes(vaultPath, selectedDirectories) {
    try {
        log(`Starting vault scan: ${vaultPath}`);
        const notes = [];

        // Function to extract aliases from file content
        async function extractAliases(filePath) {
            const content = await fs.promises.readFile(filePath, "utf-8");

            // Check if file starts with frontmatter
            if (!content.startsWith("---")) {
                return [];
            }

            // Find the end of frontmatter
            const secondDash = content.indexOf("---", 3);
            if (secondDash === -1) {
                return [];
            }

            // Extract frontmatter content
            const frontmatter = content.substring(3, secondDash);

            // Look for aliases section
            const aliasesMatch = frontmatter.match(/aliases:\n((?:  - .*\n)*)/);
            if (!aliasesMatch) {
                return [];
            }

            // Extract individual aliases
            const aliasesSection = aliasesMatch[1];
            return aliasesSection
                .split("\n")
                .filter((line) => line.startsWith("  - "))
                .map((line) => line.substring(4).trim());
        }

        await scanVaultDirectory(vaultPath, async (fullPath) => {
            // Check if the note should be included based on selected directories
            const relativePath = path.relative(vaultPath, fullPath);
            const rootDir = relativePath.split(path.sep)[0];

            // If "All" is selected or the file is in a selected directory
            if (
                selectedDirectories.has("All") ||
                (rootDir === "" && selectedDirectories.has("Notes In Root")) ||
                selectedDirectories.has(rootDir)
            ) {
                const aliases = await extractAliases(fullPath);
                const obsidianUri = createObsidianUri(vaultPath, relativePath);

                const noteInfo = {
                    path: fullPath,
                    relativePath: relativePath,
                    aliases: aliases,
                    uri: obsidianUri,
                };
                notes.push(noteInfo);

                log(`Found note: ${fullPath}`);
                if (aliases.length > 0) {
                    log(`  Aliases: ${aliases.join(", ")}`);
                }
                log(`  URI: ${obsidianUri}`);
            }
        });

        log(`Total notes found: ${notes.length}`);
        return notes;
    } catch (error) {
        log(`Vault scan failed: ${error.message}`);
        throw error;
    }
}

//FUNC - Find a note or alias that matches the word user is hovering over
function findNoteMatch(word, notesCache, searchConfig) {
    log(`Searching for note match for word: "${word}"`);

    // Check if notesCache and searchConfig are defined
    if (!notesCache) {
        log('Error: notesCache is undefined');
        return null;
    }
    if (!searchConfig) {
        log('Error: searchConfig is undefined');
        return null;
    }

    log(`Current notesCache size: ${notesCache.size}`);
    log(`Search config: ${JSON.stringify(searchConfig)}`);

    const caseInsensitive = searchConfig.CASE_INSENSITIVE;
    log(`Case insensitive search: ${caseInsensitive}`);

    // Search for exact match with original word
    let exactMatch = findExactMatch(word, caseInsensitive, false, notesCache);
    if (exactMatch) {
        log(`Found exact match: ${JSON.stringify(exactMatch)}`);
        return exactMatch;
    }

    // Match with normalized word
    const normalizedWord = normalizeForComparison(word, caseInsensitive);
    log(`Trying normalized word: "${normalizedWord}"`);
    return findExactMatch(normalizedWord, caseInsensitive, true, notesCache);
}

//FUNC - Find an exact match for a word
function findExactMatch(searchWord, caseInsensitive, applyNormalization, notesCache) {
    log(`Looking for exact match of: "${searchWord}"`);
    const normalizedSearch = caseInsensitive
        ? searchWord.toLowerCase()
        : searchWord;

    for (const [relativePath, noteInfo] of notesCache.entries()) {
        const fileName = path.basename(relativePath, ".md");
        let compareName;

        if (applyNormalization) {
            compareName = normalizeForComparison(fileName, caseInsensitive);
        } else {
            compareName = caseInsensitive ? fileName.toLowerCase() : fileName;
        }

        log(`Comparing "${compareName}" with "${normalizedSearch}"`);

        if (compareName === normalizedSearch) {
            log(`Found filename match: ${relativePath}`);
            return {
                path: relativePath,
                fullPath: noteInfo.fullPath,
                type: "filename",
                uri: noteInfo.uri,
            };
        }

        // Check aliases
        for (const alias of noteInfo.aliases) {
            let compareAlias;
            if (applyNormalization) {
                compareAlias = normalizeForComparison(alias, caseInsensitive);
            } else {
                compareAlias = caseInsensitive ? alias.toLowerCase() : alias;
            }

            log(`Comparing alias "${compareAlias}" with "${normalizedSearch}"`);

            if (compareAlias === normalizedSearch) {
                log(`Found alias match: ${alias} -> ${relativePath}`);
                return {
                    path: relativePath,
                    fullPath: noteInfo.fullPath,
                    type: "alias",
                    matchedAlias: alias,
                    uri: noteInfo.uri,
                };
            }
        }
    }

    log("No exact match found");
    return null;
}

//FUNC - Normalize a string for comparison
function normalizeForComparison(str, caseInsensitive) {
    let normalized = str.replace(/[^\w.-]+$/, ""); // Remove trailing non-allowed characters
    if (caseInsensitive) {
        normalized = normalized.toLowerCase();
    }
    return normalized;
}

module.exports = {
    loadVaultNotes,
    findNoteMatch,
    findExactMatch,
    normalizeForComparison
};