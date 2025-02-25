const fs = require('fs');
const path = require('path');
const { log } = require('../utils/logging');

async function getNoteContent(filePath) {
    try {
        const content = await fs.promises.readFile(filePath, "utf-8");
        const lines = content.split("\n");
        let inFrontmatter = false;
        let contentBuffer = [];
        let collectingContent = false;

        for (const line of lines) {
            const trimmedLine = line.trim();

            // Detect frontmatter boundaries
            if (trimmedLine === "---") {
                inFrontmatter = !inFrontmatter;
                collectingContent = !inFrontmatter; // Start collecting after frontmatter ends
                continue;
            }

            // Skip lines inside frontmatter
            if (inFrontmatter) continue;

            // Stop at first H1 header (exact match for "# " at line start)
            if (line.startsWith("# ")) {
                break;
            }

            // Collect content between frontmatter and first header
            if (collectingContent || !inFrontmatter) {
                contentBuffer.push(line);
            }
        }

        // Join lines and clean trailing whitespace/newlines
        return contentBuffer.join("\n").replace(/[\n\r\s]+$/, "");
    } catch (error) {
        log(`Error reading note content for ${filePath}: ${error.message}`);
        return "";
    }
}

//FUNC - Check if vault directory has been modified since last update
async function isVaultModified(vaultPath, lastUpdateTime) {
    try {
        let latestModification = 0;

        await scanVaultDirectory(vaultPath, async (fullPath) => {
            const stats = await fs.promises.stat(fullPath);
            latestModification = Math.max(latestModification, stats.mtimeMs);
        });

        // Check if we need to update
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
        return true;
    }
}

//FUNC - Recursively scans vault directory for all markdown files
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
            await scanVaultDirectory(fullPath, callback);
        } else if (entry.isFile() && path.extname(entry.name) === ".md") {
            await callback(fullPath, entry);
        }
    }
}

module.exports = {
    getNoteContent,
    isVaultModified,
    scanVaultDirectory,
};