# Obsidian Tooltips in VS Code
**Obsidian Tooltips in VS Code** is an extension for Visual Studio Code that adds hover popups (tooltips) over keywords that match note parameters (such as names and aliases) from your specified Obsidian (Obsidian MD) vault. These tooltips contain links to the corresponding Obsidian notes and can display either full or partial content of the note (customizable by the user).

In development.

## Use Case
You can use this extension to connect to the Obsidian vault that you use as your personal programming reference. This allows you to see tooltips with your own documentation and explanations when you hover over terms you've previously documented in Obsidian.

## Features
- Choose and connect to your Obsidian vault
- Display note content in tooltip after hovering over text matching note titles or aliases from your Obsidian vault
  - Full support for Obsidian note aliases defined in YAML frontmatter
- Choose specific directories within your vault to include in the search scope
- Setting to underline matched keywords

## Requirements

- Visual Studio Code 1.60.0 or higher
- Obsidian installed on your system
- An existing Obsidian vault, filled with notes with titles or aliases corresponding to words you will find while code editing (keyword of programming language etc)

## Extension Settings

This extension contributes the following settings:

* `obsidian-tooltips.enableExternalLinks`: Enable/disable opening Obsidian links from tooltips (Default: Enabled)
* `obsidian-tooltips.enableWordUnderline`: Enable/disable underlining of matched keywords that correspond to your Obsidian notes (Default: Disabled)

## Known Issues

## Release Notes

### 1.0.0