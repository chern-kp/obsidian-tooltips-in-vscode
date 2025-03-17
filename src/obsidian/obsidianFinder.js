const fs = require('fs');
const path = require('path');
const os = require('os');
const { log } = require('../utils/logging');

//FUNC - Find the path to the Obsidian program
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
        // Common Linux path
        obsidianPath = path.join(os.homedir(), ".local/bin/obsidian");
        log(`Checking Linux path: ${obsidianPath}`);
    }

    try {
        await fs.promises.access(obsidianPath, fs.constants.F_OK);
        log(`Obsidian found at: ${obsidianPath}`);
        return obsidianPath;
    } catch {
        log("Obsidian not found in default location");
        return null;
    }
}

//FUNC - Get the path to the Obsidian configuration file (to find vaults list)
function getObsidianConfigPath() {
    const platform = os.platform();
    let configPath;

    if (platform === "win32") {
        configPath = path.join(
            process.env.APPDATA,
            "Obsidian",
            "obsidian.json"
        );
    } else if (platform === "darwin") {
        configPath = path.join(
            os.homedir(),
            "Library/Application Support/Obsidian/obsidian.json"
        );
    } else {
        configPath = path.join(os.homedir(), ".config/Obsidian/obsidian.json");
    }

    log(`Calculated config path: ${configPath}`);
    return configPath;
}

//FUNC - Get the vaults list from the Obsidian configuration file
async function getObsidianVaults() {
    try {
        const configPath = getObsidianConfigPath();
        await fs.promises.access(configPath, fs.constants.R_OK);
        const configRaw = await fs.promises.readFile(configPath, "utf-8");
        const config = JSON.parse(configRaw);

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