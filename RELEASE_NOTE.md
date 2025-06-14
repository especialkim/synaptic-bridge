# Release Notes

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

- **Import Non-Markdown Files as Markdown with Metadata**
  Convert non-markdown files into markdown format with automatic frontmatter generation.
  - For text-based files (e.g., `.txt`, `.csv`, `.rtf`), directly embed the file content into the markdown body.
  - For other file types (images, PDFs, binaries), provide file descriptions with preview thumbnails when possible, or fallback to direct links.
  - Users can choose to either import files into the vault or keep them in their original location and reference them via links.
  - Maintains file metadata and source path information in frontmatter for easy tracking and management.

- **Open Synced Folder from File Explorer**
  Add a context menu option in Obsidian's file explorer to quickly open the external folder linked to a synced folder.
  - When right-clicking a synced folder in the file explorer, a new menu item will appear.
  - Selecting this option will open the corresponding external folder in your system's file manager.
  - Improves workflow by providing fast access to the original sync location outside Obsidian.

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