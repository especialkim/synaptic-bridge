import MarkdownHijacker from "main";
import { App, TAbstractFile, TFile, TFolder, EventRef } from "obsidian";
import { FolderConnectionSettings } from "src/settings/types";

export class InternalWatcher {

    private app: App;
    private plugin: MarkdownHijacker;
    private watchFolders: string[] = [];
    private connections: FolderConnectionSettings[] = [];
    private eventRefs: EventRef[] = [];
    constructor(app: App, plugin: MarkdownHijacker) {
        this.app = app;
        this.plugin = plugin;
    }

    public setupWatcher() {
        this.clearEvents();

        if (!this.plugin.settings.enableGlobalSync) return;

        this.connections = this.plugin.settings.connections;
        this.watchFolders = [];

        this.connections.forEach(connection => {
            if (!connection.syncEnabled) return;
            if (connection.syncType === 'vault-to-external' || connection.syncType === 'bidirectional') {
                this.watchFolders.push(connection.internalPath);
            }
        });

        const createRef = this.plugin.app.vault.on('create', async (file: TAbstractFile) => {
            
            const path = file.path;
            if (!this.isValidPath(path)) return;

            const matchedConnection = this.findMatchedConnection(path);
            if (!matchedConnection) return;

            if (file instanceof TFile) {
                const ext = file.extension.toLowerCase();
                const validExts = matchedConnection.extensions.map(e => e.replace(/^\./, '').toLowerCase());
                if (!validExts.includes(ext)) {
                    return;
                }
                this.plugin.syncInternalManager.handleAddFile(path, matchedConnection);
            }

            if (file instanceof TFolder) {
                this.plugin.syncInternalManager.handleAddFolder(path, matchedConnection);
            }
        });

        const deleteRef = this.plugin.app.vault.on('delete', async (file: TAbstractFile) => {
            const path = file.path;
            
            const matchedConnection = this.findMatchedConnection(path);
            if (!matchedConnection) return;
            
            if (file instanceof TFile) {
                this.plugin.syncInternalManager.handleDeleteFile(path, matchedConnection);
            }

            if (file instanceof TFolder) {
                this.plugin.syncInternalManager.handleDeleteFolder(path, matchedConnection);
            }
        });

        const modifyRef = this.plugin.app.vault.on('modify', async (file: TAbstractFile) => {
            const path = file.path;
            if (!this.isValidPath(path)) return;

            const matchedConnection = this.findMatchedConnection(path);
            if (!matchedConnection) return;

            if (file instanceof TFile) {
                const ext = file.extension.toLowerCase();
                const validExts = matchedConnection.extensions.map(e => e.replace(/^\./, '').toLowerCase());
                if (!validExts.includes(ext)) {
                    return;
                }
                this.plugin.syncInternalManager.handleChangeFile(path, matchedConnection);
            }
        });

        const renameRef = this.plugin.app.vault.on('rename', async (file: TAbstractFile, oldPath: string) => {
            const path = file.path;
            if (!this.isValidPath(path) && !this.isValidPath(oldPath)) return;

            const matchedConnection = this.findMatchedConnection(path);
            if (!matchedConnection) return;

            if (file instanceof TFile) {
                const ext = file.extension.toLowerCase();
                const validExts = matchedConnection.extensions.map(e => e.replace(/^\./, '').toLowerCase());
                if (!validExts.includes(ext)) {
                    return;
                }
                await this.plugin.syncInternalManager.handleRenameFile(path, oldPath, matchedConnection);
            }

            if (file instanceof TFolder) {
                await this.plugin.syncInternalManager.handleRenameFolder(path, oldPath, matchedConnection);
            }
        });

        this.eventRefs.push(createRef, deleteRef, modifyRef, renameRef);
    }

    public clearEvents() {
        this.eventRefs.forEach(ref => this.plugin.app.vault.offref(ref));
        this.eventRefs = [];
    }

    private isValidPath(path: string): boolean {
        if (path.includes('❌ ')) return false;
        return this.watchFolders.some(folder => path.startsWith(folder));
    }

    private findMatchedConnection(path: string): FolderConnectionSettings | undefined {
        return this.connections.find(connection => {
            return (
                connection.syncEnabled &&
                (connection.syncType === 'vault-to-external' || connection.syncType === 'bidirectional') &&
                (path === connection.internalPath || path.startsWith(connection.internalPath + '/'))
            );
        });
    }
}