const fs = require('fs');
const path = require('path');
const { log } = require('../utils/logging');
const { scanVaultDirectory } = require('./noteFetcher');
const { createObsidianUri } = require('../utils/noteUriHandler');

/**
 * FUNC - Loads note names and aliases from a list of files into an array.
 * This function scans the selected by user vault directories for Markdown files,
 * extracts their aliases from YAML frontmatter, and creates Obsidian URIs for them.
 *
 * @param {string} vaultPath The full path to the Obsidian vault.
 * @param {Set<string>} selectedDirectories A Set of directories to scan within the vault.
 * @returns {Promise<Array<object>>} A Promise that resolves with an array of note information objects.
 * Each object contains: `path` (full file path), `relativePath`, `aliases` (array of strings), and `uri` (Obsidian URI).
 * @throws {Error} If the vault scan fails.
 */
async function loadVaultNotes(vaultPath, selectedDirectories) {
    try {
        log(`Starting vault scan: ${vaultPath}`);
        const notes = [];

        /**
         * FUNC - Extracts aliases from the YAML frontmatter of a Markdown file.
         * Aliases are expected to be in a `aliases:` section within the frontmatter.
         *
         * @param {string} filePath The full path to the Markdown file.
         * @returns {Promise<string[]>} A Promise that resolves with an array of aliases (strings).
         */
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

/**
 * FUNC - Finds a note or alias that matches the word the user is hovering over.
 * It first attempts an exact match without normalization, then with normalization if the first fails.
 *
 * @param {string} word The word from the editor to search for.
 * @param {Map<string, object>} notesCache A Map containing cached Obsidian notes information.
 * @param {object} searchConfig Configuration for search, including `CASE_INSENSITIVE`.
 * @returns {object|null} An object containing note match details (`path`, `fullPath`, `type`, `uri`, `matchedAlias?`) or `null` if no match is found.
 */
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

    //Search for exact match WITHOUT normalization
    log(`Searching for exact match of "${word}" without normalization.`);
    let exactMatch = findExactMatch(word, caseInsensitive, false, notesCache);
    if (exactMatch) {
        log(`Found exact match (without normalization): ${JSON.stringify(exactMatch)}`);
        return exactMatch;
    } else {
        log(`No exact match found without normalization.`);
    }

    //Search with normalization (if search without it failed)
    const normalizedWord = normalizeForComparison(word, caseInsensitive);
    log(`Searching for exact match using normalized word: "${normalizedWord}" (applyNormalization = true).`);

    // Avoid redundant search if normalized word is the same as the original word AND case-insensitive is on
    const originalWordLower = caseInsensitive ? word.toLowerCase() : word;
    if (normalizedWord === originalWordLower && caseInsensitive) {
        log(`Normalized word is the same as original word (case-insensitive), skipping redundant search.`);
        return null;
    }

    // Perform the search using the normalized word and applying normalization to cache entries
    let normalizedMatch = findExactMatch(normalizedWord, caseInsensitive, true, notesCache);
    if (normalizedMatch) {
        log(`Found normalized match: ${JSON.stringify(normalizedMatch)}`);
        return normalizedMatch;
    } else {
        log(`No normalized match found.`);
    }

    log(`No match found for "${word}" after both steps.`);
    return null;
}

/**
 * FUNC - Finds an exact match for a given search word within the notes cache.
 * It compares the search word with note filenames and aliases, with options for case insensitivity and normalization.
 *
 * @param {string} searchWord The word to search for.
 * @param {boolean} caseInsensitive If true, performs a case-insensitive comparison.
 * @param {boolean} applyNormalization If true, normalizes the strings before comparison (removes trailing non-alphanumeric characters).
 * @param {Map<string, object>} notesCache A Map containing cached Obsidian notes information.
 * @returns {object|null} An object containing note match details (`path`, `fullPath`, `type`, `uri`, `matchedAlias?`) or `null` if no match is found.
 */
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

/**
 * FUNC - Normalizes a string for comparison by removing trailing non-word characters
 * and optionally converting it to lowercase.
 *
 * @param {string} str The input string to normalize.
 * @param {boolean} caseInsensitive If true, converts the string to lowercase.
 * @returns {string} The normalized string.
 */
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