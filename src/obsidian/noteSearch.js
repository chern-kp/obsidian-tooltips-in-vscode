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
    normalizeForComparison
};