import MarkdownHijacker from "main";
import { App } from "obsidian";
import chokidar, { FSWatcher } from 'chokidar';
import { getAllWatchedPaths, ignoreFilter } from "./utils";
import { SyncExternalManager } from "src/sync/SyncExternalManager";
import { SyncManager } from "src/sync/SyncManager";
import { SyncType } from "src/settings/types";
import * as fs from "fs";
export class ExternalWatcher{

    private app: App;
    private plugin: MarkdownHijacker;
    private watchers: FSWatcher[] = [];

    constructor(app: App, plugin: MarkdownHijacker){
        this.app = app;
        this.plugin = plugin;
    }

    public setupWatcher(){
        console.log(`[ExternalWatcher] setupWatcher 호출`);

        this.stopWatching();
        if(!this.plugin.settings.enableGlobalSync) return;
        
        const connections = this.plugin.settings.connections;
        console.log(`[ExternalWatcher] setupWatcher 호출 후 커넥션 갯수: ${connections.length}`);

        connections.forEach(connection => {
            const { externalPath, syncEnabled } = connection;
            const syncExternalManager = new SyncExternalManager(this.app, this.plugin, connection);
    
            if(!syncEnabled) return;

            let watcher: FSWatcher;

            watcher = chokidar.watch(externalPath, {
                ignored: ignoreFilter(this.app, connection),
                ignoreInitial: true,
                persistent: true,
                awaitWriteFinish: {
                  stabilityThreshold: 300,
                  pollInterval: 100
                }
            });

            watcher.on('add', (path: string) => {
                console.log(`[ExternalWatcher] 외부 파일 시스템 추가: ${path}`);
                if(!this.isValidPath(path)) return;
                if(connection.syncType === SyncType.vaultToExternal) return;
                syncExternalManager.handleAddFile(path);
            });
            watcher.on('change', (path: string) => {
                if(!this.isValidPath(path)) return;
                if(connection.syncType === SyncType.vaultToExternal) return;
                syncExternalManager.handleChangeFile(path);
            });
            watcher.on('unlink', (path: string) => {
                if(connection.syncType === SyncType.vaultToExternal) return;
                syncExternalManager.handleDeleteFile(path);
            });
            watcher.on('addDir', (path: string) => {
                if(!this.isValidPath(path)) return;
                if(connection.syncType === SyncType.vaultToExternal) return;
                syncExternalManager.handleAddFolder(path);
            });
            watcher.on('unlinkDir', (path: string) => {
                if(!this.isValidPath(path)) return;
                if(connection.syncType === SyncType.vaultToExternal) return;
                syncExternalManager.handleDeleteFolder(path);
            });
            watcher.on('error', (error: Error) => {
                console.log(`[ExternalWatcher] 외부 파일 시스템 오류 발생: ${error.message}`);
            });

            watcher.on('ready', () => {
                const syncManager = new SyncManager(this.app, this.plugin, connection);
                const paths = getAllWatchedPaths(watcher)
                    .filter(path => !path.includes('❌ '))
                    .filter(path => {
                        try {
                            return fs.statSync(path).isFile();
                        } catch (e) {
                            return false;
                        }
                    });

                switch(connection.syncType){
                    case SyncType.vaultToExternal:
                        syncManager.initInternalToExternal(connection);
                        break;
                    case SyncType.externalToVault:
                        syncManager.initExternalToInternal(paths);
                        break;
                    case SyncType.bidirectional:
                        syncManager.initBidirectional(paths);
                        break;
                }
                
            });

            this.watchers.push(watcher);
        })
    }

    public stopWatching() {
        this.watchers.forEach(w => w.close());
        this.watchers = [];
    }

    private isValidPath(path: string): boolean {
        return path.includes('❌ ') ? false : true;
    }
}