import MarkdownHijacker from "main";
import { App, TAbstractFile, TFile, TFolder, EventRef } from "obsidian";
import { FolderConnectionSettings } from "src/settings/types";

export class InternalWatcher {

    private app: App;
    private plugin: MarkdownHijacker;
    private watchFolders: string[] = [];
    private connections: FolderConnectionSettings[] = [];
    private eventRefs: EventRef[] = [];
    private isSettingUp: boolean = false;  // 설정 중 플래그
    constructor(app: App, plugin: MarkdownHijacker) {
        this.app = app;
        this.plugin = plugin;
    }

    public setupWatcher() {
        console.log('[InternalWatcher] ========== setupWatcher START ==========');
        console.log('[InternalWatcher] Current isSettingUp:', this.isSettingUp);
        console.log('[InternalWatcher] Current eventRefs count:', this.eventRefs.length);
        
        // 이미 설정 중이면 무시
        if (this.isSettingUp) {
            console.log('[InternalWatcher] ⚠️ Already setting up, skipping...');
            return;
        }
        
        this.isSettingUp = true;
        console.log('[InternalWatcher] ✓ Set isSettingUp = true');
        this.clearEvents();
        console.log('[InternalWatcher] ✓ clearEvents completed');

        if (!this.plugin.settings.enableGlobalSync) {
            console.log('[InternalWatcher] ⚠️ Global sync disabled, skipping setup');
            this.isSettingUp = false;
            console.log('[InternalWatcher] ✓ Set isSettingUp = false (global sync disabled)');
            return;
        }

        this.connections = this.plugin.settings.connections;
        this.watchFolders = [];
        console.log('[InternalWatcher] Total connections:', this.connections.length);
        
        // 이벤트 등록 시작하면 바로 플래그 해제
        this.isSettingUp = false;
        console.log('[InternalWatcher] ✓ Set isSettingUp = false (starting event registration)');

        this.connections.forEach(connection => {
            if (!connection.syncEnabled) return;
            if (connection.syncType === 'vault-to-external' || connection.syncType === 'bidirectional') {
                this.watchFolders.push(connection.internalPath);
            }
        });
        
        console.log('[InternalWatcher] Watch folders:', this.watchFolders);
        console.log('[InternalWatcher] Registering vault event listeners...');

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
        console.log('[InternalWatcher] ✓ All event listeners registered');
        console.log('[InternalWatcher] ========== setupWatcher END ==========');
        console.log('[InternalWatcher] Total eventRefs:', this.eventRefs.length);
    }

    public clearEvents() {
        console.log('[InternalWatcher] clearEvents called');
        const clearStart = performance.now();
        
        const count = this.eventRefs.length;
        this.eventRefs.forEach(ref => this.plugin.app.vault.offref(ref));
        this.eventRefs = [];
        
        const totalTime = (performance.now() - clearStart).toFixed(2);
        console.log(`[InternalWatcher] ${count} event references cleared in ${totalTime}ms`);
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