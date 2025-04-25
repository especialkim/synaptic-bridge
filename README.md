# Markdown Hijacker

> Beyond the Vault. One hub for every Markdown, everywhere.

Markdown Hijacker is an Obsidian plugin that synchronizes markdown files between your Obsidian Vault and external folders. With this plugin, you can synchronize markdown files in various ways between internal and external locations to improve your workflow.

## Key Features

- **Multiple Folder Mappings**: Connect multiple external folders to your Vault folders
- **Flexible Synchronization**: Support for one-way (External→Vault, Vault→External) or bidirectional sync
- **Real-time File Monitoring**: Automatic synchronization when files change
- **Customizable Settings**: Include/exclude specific folders/files, customize file deletion handling, and more
- **Metadata Preservation**: Automatic management of file metadata (frontmatter)
- **Status Indicator**: View synchronization status in the Obsidian status bar

## Use Cases

- **Integrate Existing Markdown Documents**: Bring your existing markdown documents from other locations into your Obsidian Vault
- **Collaborate with External Tools**: Maintain synchronization when working with other markdown editors or Git repositories
- **Backup and Redundancy**: Automatically back up important documents or manage synchronization across multiple locations

## Installation

1. In Obsidian, go to Settings(⚙️) > Community Plugins > Browse
2. Search for "Markdown Hijacker" and install
3. Enable the plugin

## Configuration

### 1. Basic Settings

1. Go to Settings(⚙️) > Community Plugins > Markdown Hijacker settings
2. Toggle "Enable Plugin" to activate all features

### 2. Folder Mapping Setup

1. Click "Add Folder Mapping" to create a new mapping
2. For each mapping, configure:
   - **Vault Path**: Relative path within your Vault (can be selected with the folder finder button)
   - **External Folder Path**: Absolute path to the external folder to synchronize (can be selected with the folder selection button)
   - **Enable Mapping**: Toggle to activate this specific mapping

### 3. Advanced Settings

- **Synchronization Direction**: 
  - External→Vault: Import external changes to Vault only
  - Vault→External: Export Vault changes to external folders only
  - Bidirectional: Reflect changes in both directions

- **Bidirectional Sync Settings** (when bidirectional sync is selected):
  - Merge: Merge changes from both sides
  - External Priority: External files take precedence in conflicts
  - Internal Priority: Vault files take precedence in conflicts

- **Deleted File Handling**:
  - Property Change: Mark as deleted (add "❌" prefix to filename)
  - Complete Deletion: Fully delete from connected folder

- **Filtering Options**:
  - Ignore Hidden Files: Exclude hidden files (files starting with .) from sync
  - Exclude/Include Folders: Exclude or include specific folders from synchronization
  - Specify Extensions: Synchronize only specific file extensions (.md, .txt, etc.)

## Usage Tips

1. **Initial Setup and Initialization**:
   - When a mapping is activated, an initial scan automatically runs to synchronize existing files.

2. **Status Monitoring**:
   - Check the current synchronization status in the Obsidian status bar.

3. **Conflict Resolution**:
   - When using bidirectional synchronization, conflicts are automatically resolved according to your priority settings.
   - It's recommended to back up important data before using bidirectional synchronization.

4. **Checking Changes**:
   - Synchronization-related metadata is added to the frontmatter.
   - This information allows you to verify the original location and synchronization status of files.

## Important Notes

- Initial loading time may be longer when synchronizing large file sets.
- Resource usage may increase when synchronizing frequently changing files.
- Errors may occur if external paths are invalid.
- Unexpected synchronization conflicts may arise if the same file is modified through different methods.

## Troubleshooting

1. **If Synchronization Isn't Working**:
   - Check if the plugin is enabled
   - Verify that mappings are activated
   - Check access permissions for external paths

2. **Files Being Deleted**:
   - Change "Deleted File Handling" setting to "Property Change"

3. **Performance Issues**:
   - Reduce the number of files/folders being synchronized
   - Use filtering options to synchronize only necessary files

## License

Distributed under the MIT License.

## Developer Information

- Developer: Yongmini
- Contact: https://x.com/Facilitate4U
