const fs = require('fs');
const path = require('path');
const { log } = require('../utils/logging');

/**
 * FUNC - Gets the content of a Markdown note file up to the first H1 (#) header.
 * It skips YAML frontmatter at the beginning of the file.
 *
 * @param {string} filePath The full path to the Markdown note file.
 * @returns {Promise<string>} A Promise that resolves with the extracted content, or an empty string if an error occurs.
 */
async function getNoteContent(filePath) {
    try {
        const content = await fs.promises.readFile(filePath, "utf-8");
        const lines = content.split("\n");
        let inFrontmatter = false;
        let contentBuffer = [];
        let collectingContent = false;

        for (const line of lines) {
            const trimmedLine = line.trim();

            // Detect frontmatter boundaries (lines with '---')
            if (trimmedLine === "---") {
                inFrontmatter = !inFrontmatter;
                // Start collecting content only after the closing '---' of the frontmatter
                collectingContent = !inFrontmatter;
                continue;
            }

            // Skip lines that are part of the frontmatter
            if (inFrontmatter) continue;

            // Stop collecting content when the first H1 header is encountered
            if (line.startsWith("# ")) {
                break;
            }

            // Collect content if not in frontmatter or if collecting has started
            if (collectingContent || !inFrontmatter) {
                contentBuffer.push(line);
            }
        }

        // Join the collected lines and remove any trailing whitespace or newlines
        return contentBuffer.join("\n").replace(/[\n\r\s]+$/, "");
    } catch (error) {
        log(`Error reading note content for ${filePath}: ${error.message}`);
        return "";
    }
}

/**
 * FUNC - Checks if the Obsidian vault directory has been modified since the last update.
 * It recursively scans the vault for the latest modification timestamp of any Markdown file.
 *
 * @param {string} vaultPath The full path to the Obsidian vault.
 * @param {number} lastUpdateTime The timestamp (in milliseconds) of the last known update.
 * @returns {Promise<boolean>} A Promise that resolves to `true` if the vault has been modified, `false` otherwise.
 * Returns `true` in case of an error to force a refresh.
 */
async function isVaultModified(vaultPath, lastUpdateTime) {
    try {
        let latestModification = 0;

        // Recursively scan the vault and find the latest modification time among all Markdown files
        await scanVaultDirectory(vaultPath, async (fullPath) => {
            const stats = await fs.promises.stat(fullPath);
            latestModification = Math.max(latestModification, stats.mtimeMs);
        });

        // Determine if a refresh is needed by comparing the latest modification with the last update time
        const needsRefresh = latestModification > lastUpdateTime;
        log(
            `Vault modification check: Last update: ${new Date(
                lastUpdateTime
            ).toLocaleString()}, Latest modification: ${new Date(
                latestModification
            ).toLocaleString()}`
        );
        log(`Update needed: ${needsRefresh}`);

        return needsRefresh;
    } catch (error) {
        log(`Error checking vault modifications: ${error.message}`);
        return true; // Return true on error to force a refresh
    }
}

/**
 * FUNC - Recursively scans a directory for all Markdown files and executes a callback for each, skipping hidden files and directories (starting with a "." (dot)).
 *
 * @param {string} dirPath The directory path to start scanning from.
 * @param {function(string, fs.Dirent): Promise<void>} callback An async callback function to execute for each found Markdown file.
 * The callback receives the full path to the file and its `fs.Dirent` object.
 * @returns {Promise<void>} A Promise that resolves when the scanning is complete.
 */
async function scanVaultDirectory(dirPath, callback) {
    const entries = await fs.promises.readdir(dirPath, {
        withFileTypes: true,
    });

    for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        // Skip hidden files and directories
        if (entry.name.startsWith(".")) {
            continue;
        }

        if (entry.isDirectory()) {
            // If it's a directory, recursively scan it
            await scanVaultDirectory(fullPath, callback);
        } else if (entry.isFile() && path.extname(entry.name) === ".md") {
            // If it's a Markdown file, execute the callback
            await callback(fullPath, entry);
        }
    }
}

module.exports = {
    getNoteContent,
    isVaultModified,
    scanVaultDirectory,
};