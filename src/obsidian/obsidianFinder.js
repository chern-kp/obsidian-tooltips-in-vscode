const fs = require('fs');
const path = require('path');
const os = require('os');
const { log } = require('../utils/logging');

/**
 * FUNC - Finds the path to the Obsidian program executable based on the operating system.
 * It checks common default installation paths for Windows, macOS, and Linux.
 *
 * @returns {Promise<string|null>} A Promise that resolves with the full path to the Obsidian executable if found, otherwise `null`.
 */
async function findObsidian() {
    const platform = os.platform();
    let obsidianPath = null;

    log(`Searching Obsidian on platform: ${platform}`);

    if (platform === "win32") {
        // Common Windows path
        const localAppData = process.env.LOCALAPPDATA;
        obsidianPath = path.join(localAppData, "Obsidian", "Obsidian.exe");
        log(`Checking Windows path: ${obsidianPath}`);
    } else if (platform === "darwin") {
        // Common macOS path
        obsidianPath = "/Applications/Obsidian.app";
        log(`Checking macOS path: ${obsidianPath}`);
    } else if (platform === "linux") {
        // Common Linux path for Obsidian executable (e.g., AppImage or installed via snap/flatpak)
        obsidianPath = path.join(os.homedir(), ".local/bin/obsidian");
        log(`Checking Linux path: ${obsidianPath}`);
    }

    try {
        // Check if the determined path exists and is accessible
        await fs.promises.access(obsidianPath, fs.constants.F_OK);
        log(`Obsidian found at: ${obsidianPath}`);
        return obsidianPath;
    } catch {
        log("Obsidian not found in default location");
        return null;
    }
}

/**
 * FUNC - Gets the path to the Obsidian configuration file, which contains the list of registered vaults.
 * The path varies based on the operating system.
 *
 * @returns {string} The full path to the Obsidian configuration JSON file.
 */
function getObsidianConfigPath() {
    const platform = os.platform();
    let configPath;

    if (platform === "win32") {
        // Windows: %APPDATA%\Obsidian\obsidian.json
        configPath = path.join(
            process.env.APPDATA,
            "Obsidian",
            "obsidian.json"
        );
    } else if (platform === "darwin") {
        // macOS: ~/Library/Application Support/Obsidian/obsidian.json
        configPath = path.join(
            os.homedir(),
            "Library/Application Support/Obsidian/obsidian.json"
        );
    } else {
        // Linux: ~/.config/Obsidian/obsidian.json
        configPath = path.join(os.homedir(), ".config/Obsidian/obsidian.json");
    }

    log(`Calculated config path: ${configPath}`);
    return configPath;
}

/**
 * FUNC - Gets a list of Obsidian vault paths from the Obsidian configuration file.
 * It reads the `obsidian.json` file, parses it, and extracts the paths of all configured vaults.
 *
 * @returns {Promise<string[]>} A Promise that resolves with an array of full paths to Obsidian vaults.
 * Returns an empty array if the config file cannot be read or no vaults are found.
 */
async function getObsidianVaults() {
    try {
        const configPath = getObsidianConfigPath();
        // Check if the config file exists and is readable
        await fs.promises.access(configPath, fs.constants.R_OK);
        const configRaw = await fs.promises.readFile(configPath, "utf-8");
        const config = JSON.parse(configRaw);

        // Extract vault paths from the parsed configuration
        return config.vaults
            ? Object.values(config.vaults).map((v) => v.path)
            : [];
    } catch (error) {
        log(`Failed to read Obsidian config: ${error.message}`);
        return [];
    }
}

module.exports = {
    findObsidian,
    getObsidianConfigPath,
    getObsidianVaults
};