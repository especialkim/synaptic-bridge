# Release Notes

## 0.1.5

- **Enhanced Explorer Integration**: Improved visual indicators and quick access for synced folders
  - Changed circular badge to connection name badge for synced folders in file explorer
  - Click badge to open external folder in system file manager (Finder/Explorer)
  - Added right-click context menu for synced folders with options:
    - Rename Connection
    - Open Synced Folder in Finder/Explorer
    - Copy External Path
    - Open Synaptic Bridge Settings
  - Refactored duplicate code for better maintainability

## 0.1.4

- **Performance optimization**: Significantly improved plugin loading and shutdown performance
  - Eliminated startup stuttering and UI freezing during plugin initialization
  - Fixed settings change freezing issues for smooth configuration updates
  - Optimized plugin shutdown for instant response when disabling the plugin
  - Improved internal file scanning performance using Obsidian Vault API
  - Added delayed loading with requestIdleCallback for non-blocking initialization
  - Implemented immediate watcher detachment without blocking operations
  - Added .obsidianignore to exclude development files from Obsidian indexing
  - Added console.log removal in production builds for better performance

## 0.1.3

- **File name filtering for external folder**: Added glob pattern support for including/excluding specific files from external folders
  - Support for exact filename matching (e.g., `meeting.md`, `config.json`)
  - Support for glob patterns using `*`, `?`, and `[]` wildcards (e.g., `todo-*.txt`, `project-??.md`, `daily-[0-9][0-9].md`)
  - Include and exclude filters work together as intersection (files must match include patterns AND not match exclude patterns)
  - Applies to "External to Vault" and "Bidirectional" sync types

## 0.1.2

- Plugin renamed: The plugin name has been changed from "Markdown Hijacker" to "Synaptic Bridge" to better reflect its broader vision and branding direction.

## 0.1.1

- Changed UI menu language from Korean to English

## 0.1.0 (Initial Release)

- See [README.md](./README.md) for plugin overview and usage instructions. 

# Future Roadmap

- **Sync Connections Sidebar**
  Add a dedicated sidebar tab to display and manage all synchronized folder pairs in a clean list view.
  - Show all active sync connections with their current status (syncing, paused, error, idle)
  - Display connection names, sync directions, and last sync timestamps
  - Quick toggle buttons to enable/disable individual connections
  - Status indicators for sync health and file counts
  - One-click access to connection settings and sync logs
  - Enables quick overview and management of all sync pairs without opening settings

- **Post Processing Hooks**
  Allow users to define post-processing commands that run after a sync operation.
  - Users can configure named post-process profiles (e.g., `deploy`, `optimize`, `notify`) in plugin settings.
  - Post-process actions can be triggered based on frontmatter values or specific file paths.
  - Commands may include shell scripts, external tool invocations, or integration with git (e.g., commit & push).
  - Enables flexible automation after syncing, such as publishing to a blog, generating RSS, or image compression.

- **Import Non-Markdown Files as Markdown with Metadata**
  Convert non-markdown files into markdown format with automatic frontmatter generation.
  - For text-based files (e.g., `.txt`, `.csv`, `.rtf`), directly embed the file content into the markdown body.
  - For other file types (images, PDFs, binaries), provide file descriptions with preview thumbnails when possible, or fallback to direct links.
  - Users can choose to either import files into the vault or keep them in their original location and reference them via links.
  - Maintains file metadata and source path information in frontmatter for easy tracking and management.

- **Customizable Sync File Frontmatter (YAML)**
  Allow users to define and customize the frontmatter (YAML metadata) structure for synchronized files, instead of using only the plugin developer's default fields.
  - Users can add, remove, or modify frontmatter fields according to their needs.
  - Supports custom templates and variable substitution for dynamic metadata.
  - Ensures compatibility with various workflows and external tools that rely on specific frontmatter formats.

- **Selective GitHub Sync**  
  Enable synchronization between specific folders in your Vault (not the entire Vault) and a GitHub repository.  
  - You can choose which folders to sync.
  - Only selected file types (e.g., `.md`, `.svg`, etc.) will be included.
  - Each folder can be mapped to a different repository or branch if needed.

- **Blog Export Mode**
  Add an export option to transform internal Obsidian-style content into a clean, static-blog-ready format.  
  - Converts Obsidian-specific syntax (e.g., `![[image.png]]`, `[[note]]`, `dataview` blocks) into standard Markdown or static HTML.  
  - Moves or uploads image and media assets to a structured `assets/` folder or external CDN.  
  - Automatically replaces Obsidian-style links with standard Markdown links.  
  - Normalizes frontmatter (title, date, tags, etc.) for compatibility with static site generators like Jekyll or Hugo.  
  - Intended for publishing selected folders or notes as blog-ready content while preserving internal formatting separately.