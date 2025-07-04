# Obsidian Tooltips Visual Studio Code extension architecture

## Concepts
#### Hover
Hover is a feature of Visual Studio Code that allows us to show a tooltip with the information about a word or a specific pattern.

#### Hover Provider
In Visual Studio Code, the hover provider is a listener, that constantly checks for the mouse hover events. When VS Code detects that the mouse is hovering over a text range (like a word or a specific pattern), it triggers all the hover providers that match the document type (basically, the programming language). Then, the hover provider checks the word in dictionaries, both integral in VS Code and from VS Code extensions. Hover is able to show the information from several sources in the same time in one tooltip.

#### Global State
The global state is a storage provided by VS Code to save data across sessions.

## Global Variables
- `lastUpdateTime` (`number`) - Timestamp of the last update of notes information. Used to check if the vault has been modified since the last update. *Initialized in [`extension.js`](../src/extension.js) file.*
- `selectedDirectories` (`Set<string>`) - Set of directories selected by the user for scanning Obsidian notes using, for example, the "Pick Directories" command (function `registerPickDirectoriesCommand`) in [`extension.js`](../src/extension.js). *Initialized in [`extension.js`](../src/extension.js) file.*
Example of data:
```js
[
  "01. Projects",
  "03. Resources"
]
```
- `notesCache` (`Map<string, object>`) - Cache of notes information. After the cache is loaded from the cache file, it is used to store the notes data in the memory and used by other functions. *Initialized in [`extension.js`](../src/extension.js) file.*
Example of data:
```js
{
  "10 - Projects/MOC - Project Management.md": {
    "relativePath": "10 - Projects/MOC - Project Management.md",
    "fullPath": "C:\\Users\\You\\Documents\\MyVault\\10 - Projects\\MOC - Project Management.md",
    "aliases": [],
    "uri": "obsidian://open?vault=MyVault&file=10%20-%20Projects%2FMOC%20-%20Project%20Management"
  },
  "10 - Projects/Project \"Phoenix\".md": {
    "relativePath": "10 - Projects/Project \"Phoenix\".md",
    "fullPath": "C:\\Users\\You\\Documents\\MyVault\\10 - Projects\\Project \"Phoenix\".md",
    "aliases": [
      "Phoenix Project",
      "Project P"
    ],
    "uri": "obsidian://open?vault=MyVault&file=10%20-%20Projects%2FProject%20%22Phoenix%22"
  },
  "20 - Areas of Responsibility/Health and Fitness.md": {
    "relativePath": "20 - Areas of Responsibility/Health and Fitness.md",
    "fullPath": "C:\\Users\\You\\Documents\\MyVault\\20 - Areas of Responsibility\\Health and Fitness.md",
    "aliases": [
      "Fitness",
      "Health"
    ],
    "uri": "obsidian://open?vault=MyVault&file=20%20-%20Areas%20of%20Responsibility%2FHealth%20and%20Fitness"
  },
  "README.md": {
    "relativePath": "README.md",
    "fullPath": "C:\\Users\\You\\Documents\\MyVault\\README.md",
    "aliases": [],
    "uri": "obsidian://open?vault=MyVault&file=README"
  }
}
```
- `lookupCache` (`Map<string, Map<string, PathInfo[]>>`) - A multi-level map created for fast note search. It is built from the `notesCache` variable and serves as the primary search index. Data is organized in a three-tier structure:
  - **The Outer `Map`** - A `Map` with **canonically normalized** keys (note titles and aliases) and `Map` objects as values *Example: A note titled "Function()" and a note with an alias `.function` will both be mapped to the same entry under the key `'function'`.* **This allows for a very fast lookup, as the system can find a group of potential matches instantly without scanning all notes.**
  - **The Inner `Map`** - A `Map` with **original, un-normalized** keys (note titles and aliases) and arrays as values.*Example: If a user has a note for the data type "String" and another for the function "String()", they will be grouped under the same normalized key `'string'` in the Outer Map, but exist as two different objects, `'String'` and `'String()'`, in this Inner Map.* **This allows the search algorithm to perform a perfect match against the exact token from the code and resolve ambiguity.**
 - **The `PathInfo[]` Array** - An array of objects containing a pointer to the note and metadata about the match's origin. The structure is `{ path: string, isFileName: boolean }`. The `isFileName` flag is `true` if the key came from a note's filename and `false` if it came from an **alias**. *Example: If the user has two notes with the same alias, like "API", this array will contain pointers to both notes. The primary result is displayed fully, while the rest are suggested as candidates under "Similar Notes",* **ensuring no information is lost**. Priority of note title or aliases depends on the `prioritizeFileName` setting.
*Initialized in [`extension.js`](../src/extension.js) file.*
Example of data:
```js
{
  // Outer Map

  // Normalized key: 'projectphoenix' from the file name 'Project "Phoenix"'.
  "projectphoenix": {

    // Inner Map

    // Original key: 'Project "Phoenix"' (from a file name)
    "Project \"Phoenix\"": [
      // PathInfo[] Array
      {
        "path": "10 - Projects/Project \"Phoenix\".md",
        "isFileName": true
      }
    ]
  },

  // Normalized key: 'phoenixproject' from the alias 'Phoenix Project' (for the note 'Project "Phoenix"').
  "phoenixproject": {
    // This is a "shelf" for all original keys that normalize to 'phoenixproject'.

    // Original key: 'Phoenix Project' (from an alias)
    "Phoenix Project": [
      {
        "path": "10 - Projects/Project \"Phoenix\".md",
        "isFileName": false
      }
    ]
  },

  // Normalized key: 'projectp' from the alias 'Project P' (for the note 'Project "Phoenix"').
  "projectp": {
    "Project P": [
      {
        "path": "10 - Projects/Project \"Phoenix\".md",
        "isFileName": false
      }
    ]
  },

  // Normalized key: 'mocprojectmanagement' from the file name 'MOC - Project Management'.
  "mocprojectmanagement": {
    "MOC - Project Management": [
      {
        "path": "10 - Projects/MOC - Project Management.md",
        "isFileName": true
      }
    ]
  },

  // Normalized key: 'healthandfitness' from the file name 'Health and Fitness'.
  "healthandfitness": {
    "Health and Fitness": [
      {
        "path": "20 - Areas of Responsibility/Health and Fitness.md",
        "isFileName": true
      }
    ]
  },

  // Normalized key: 'fitness' from the alias 'Fitness' (for the note 'Health and Fitness').
  "fitness": {
    "Fitness": [
      {
        "path": "20 - Areas of Responsibility/Health and Fitness.md",
        "isFileName": false
      }
    ]
  },

  // Normalized key: 'health' from the alias 'Health' (for the note 'Health and Fitness').
  "health": {
    "Health": [
      {
        "path": "20 - Areas of Responsibility/Health and Fitness.md",
        "isFileName": false
      }
    ]
  },

  // Normalized key: 'readme' from the file name 'README'.
  "readme": {
    "README": [
      {
        "path": "README.md",
        "isFileName": true
      }
    ]
  }
}
```

## Activation Flow
### Step 1. `initializeLogging();`
Initialize the extension's logging system. This is our custom way of logging messages to the "Obsidian Tooltips" output panel. See [`logging.js`](../src/utils/logging.js) file.
**Instead of using logging system in dev tools with `console.log()` function, vs code allows us to use output channel using VS Code API (`vscode.OutputChannel`). User can see the log in a separate panel in VS Code "Output", located usually in the bottom part of the window, in a separate tab `Obsidian Tooltips`.**

### Step 2. `restoreSelectedDirectories(context);`
When the extension is activated, it checks the storage of the extension ([Global State](#global-state)) for previously selected directories. If the global state contains saved directories, they are restored; if not, the extension defaults to "Notes In Root" (all top level directories in the vault).
**Extension allows user to select only specific directories in the vault, not the whole vault, using the "Pick Directories" command (function `registerPickDirectoriesCommand`) in [`extension.js`](../src/extension.js). We should check if user has selected directories, so we wouldn't have to fetch the data from unused directories (for performance reasons).**

### Step 3. `initializeOnActivation(context);`
This function is asynchronous.

1. We check the global state (storage) for a connected vault.
   - If a connected vault is NOT found, initialization is skipped. User is asked to connect the vault using the "Connect Vault" command (function `registerConnectVaultCommand`) in [`extension.js`](../src/extension.js). (End Point)
   - If a connected vault is found, initialization continues.
*Example: when user just installed the extension, there is no vault connected, so the extension is not initialized.*

2. We call `loadCache` function from ([`cache.js`](../src/utils/cache.js)) file. This function attempts to load the notes cache from the cache file.
**We use cache so our extension wouldn't have to fetch the notes data from the vault every time the user hovers over a word (for performance reasons).**
   - If a cache file is NOT found, skips this step and continues with the next step.
   - If a cache file is found, it:
   - a. gets the data from the cache file
   - b. updates the global variable `notesCache` with the all the note data from the cache file.
   - c. updates the global variable `lastUpdateTime` with the timestamp of the last update of notes information. **We do it so we could use it to skip the update of notes data if it was not modified since the last update (for performance reasons)**
   - d. call the `buildLookupCache` on the restored `notesCache` variable. It populates the `lookupCache` variable with the data from the `notesCache` variable.

3. We call `isVaultModified` function from [`noteFetcher.js`](../src/noteFetcher.js) file, using the timestamp of the last update from `lastUpdateTime` variable that we got in the previous step. This function checks if the vault has been modified since the last update.
   - If the modification time of the vault is identical to the timestamp from `lastUpdateTime` variable, we skip to the next step. **We do it so we wouldn't have to update the notes data if it was not modified since the last update.** *Example: if user has connected the vault, but didn't modify it since the last time the extension was activated, updating the notes data is redundant.*
   - If the modification time of the vault is NOT identical to the timestamp from `lastUpdateTime` variable, we call `updateNotesInformation` function from [`vaultStateManager.js`](../src/vaultStateManager.js) file. This function updates the cache file with the data from the vault.
   - a. after updating the cache file, it updates all global variables with the new data from the cache file: `notesCache`, `lookupCache`, `lastUpdateTime`.

4. We call `reRegisterHoverProvider` function from [`hover/hoverProvider.js`](../src/hover/hoverProvider.js) file. This function re-registers the hover provider with the updated data from variables. Because of previous steps, it receives updated data from global variables (`notesCache`, `lookupCache`,  `lastUpdateTime`).
   - In our case, we pass the current updated data from global variables to the hover provider.
   - a. We re-register the data by deleting the old hover provider and registering the new one with the updated data.
   - b. Actually register the hover provider with the updated data from previous steps.

### Step 4. `registerCommands(context);`
Register all the commands (that user can call from VS Code) that the extension provides.
