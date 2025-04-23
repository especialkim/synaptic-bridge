import MarkdownHijacker from "main";
import { App, TAbstractFile, TFile, TFolder, EventRef } from "obsidian";
import { FolderConnectionSettings } from "reSrc/settings/types";
import { SyncInternalManager } from "reSrc/sync/SyncInternalManager";

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

        const syncInternalManager = new SyncInternalManager(this.app, this.plugin);

        this.connections = this.plugin.settings.connections;
        this.watchFolders = [];

        this.connections.forEach(connection => {
            if (!connection.syncEnabled) return;
            if (connection.syncType === 'vault-to-external' || connection.syncType === 'bidirectional') {
                this.watchFolders.push(connection.internalPath);
            }
        });

        console.log(`[InternalWatcher] 감시할 폴더: ${this.watchFolders}`);

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
                syncInternalManager.handleAddFile(path, matchedConnection);
            }

            if (file instanceof TFolder) {
                // syncInternalManager.handleAddFolder(path, matchedConnection);
            }
        });

        const deleteRef = this.plugin.app.vault.on('delete', async (file: TAbstractFile) => {
            const path = file.path;
            if (!this.isValidPath(path)) return;

            const matchedConnection = this.findMatchedConnection(path);
            if (!matchedConnection) return;

            if (file instanceof TFile) {
                // syncInternalManager.handleDeleteFile(path);
            }

            if (file instanceof TFolder) {
                // syncInternalManager.handleDeleteFolder(path);
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
                    console.log(`[InternalWatcher] 확장자 미일치로 무시됨: ${path}`);
                    return;
                }
                // syncInternalManager.handleChangeFile(path);
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
                    console.log(`[InternalWatcher] 확장자 미일치로 무시됨: ${path}`);
                    return;
                }
                // syncInternalManager.handleRenameFile(path, oldPath);
            }

            if (file instanceof TFolder) {
                // syncInternalManager.handleRenameFolder(path, oldPath);
            }
        });

        this.eventRefs.push(createRef, deleteRef, modifyRef, renameRef);
    }

    private clearEvents() {
        this.eventRefs.forEach(ref => this.plugin.app.vault.offref(ref));
        this.eventRefs = [];
    }

    private isValidPath(path: string): boolean {
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