# Release Notes

## 0.1.1

- Changed UI menu language from Korean to English

## 0.1.0 (Initial Release)

- See [README.md](./README.md) for plugin overview and usage instructions. 

# Future Roadmap

- **Customizable Sync File Frontmatter (YAML)**
  - Allow users to define and customize the frontmatter (YAML metadata) structure for synchronized files, instead of using only the plugin developer's default fields.
  - Users can add, remove, or modify frontmatter fields according to their needs.
  - Supports custom templates and variable substitution for dynamic metadata.
  - Ensures compatibility with various workflows and external tools that rely on specific frontmatter formats.

- **Selective GitHub Sync**  
  - Enable synchronization between specific folders in your Vault (not the entire Vault) and a GitHub repository.  
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