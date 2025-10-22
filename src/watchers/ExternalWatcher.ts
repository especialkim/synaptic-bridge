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
    private isSettingUp: boolean = false;  // 설정 중 플래그

    constructor(app: App, plugin: MarkdownHijacker){
        this.app = app;
        this.plugin = plugin;
    }

    public setupWatcher(){
        console.log('[ExternalWatcher] ========== setupWatcher START ==========');
        console.log('[ExternalWatcher] Current isSettingUp:', this.isSettingUp);
        console.log('[ExternalWatcher] Current watchers count:', this.watchers.length);
        
        // 이미 설정 중이면 무시
        if (this.isSettingUp) {
            console.log('[ExternalWatcher] ⚠️ Already setting up, skipping...');
            return;
        }
        
        this.isSettingUp = true;
        console.log('[ExternalWatcher] ✓ Set isSettingUp = true');
        const setupStart = performance.now();

        // 기존 watcher 정리 (비동기로 빠르게!)
        console.log('[ExternalWatcher] Stopping existing watchers before setup...');
        this.stopWatching(true); // immediate: true로 변경!
        console.log('[ExternalWatcher] ✓ stopWatching completed');
        
        if(!this.plugin.settings.enableGlobalSync) {
            console.log('[ExternalWatcher] ⚠️ Global sync disabled, skipping setup');
            this.isSettingUp = false;
            console.log('[ExternalWatcher] ✓ Set isSettingUp = false (global sync disabled)');
            return;
        }
        
        const connections = this.plugin.settings.connections;
        console.log(`[ExternalWatcher] Setting up ${connections.length} connections`);
        
        // watcher 생성 시작하면 바로 플래그 해제
        // (실제 초기화는 비동기로 진행됨)
        this.isSettingUp = false;
        console.log('[ExternalWatcher] ✓ Set isSettingUp = false (starting watcher creation)');

        connections.forEach((connection, index) => {
            console.log(`[ExternalWatcher] --- Connection ${index + 1}/${connections.length} START ---`);
            const { externalPath, syncEnabled } = connection;
            console.log(`[ExternalWatcher] Connection name: ${connection.name}, syncEnabled: ${syncEnabled}`);
            
            const syncExternalManager = new SyncExternalManager(this.app, this.plugin, connection);
    
            if(!syncEnabled) {
                console.log(`[ExternalWatcher] Connection ${index + 1}/${connections.length} (${connection.name}) - ⚠️ disabled, skipping`);
                return;
            }

            console.log(`[ExternalWatcher] Connection ${index + 1}/${connections.length} (${connection.name}) - creating watcher for ${externalPath}`);
            const watcherStart = performance.now();
            
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
            
            const watcherCreateTime = (performance.now() - watcherStart).toFixed(2);
            console.log(`[ExternalWatcher] Connection ${index + 1}/${connections.length} - watcher created in ${watcherCreateTime}ms`);

            watcher.on('add', (path: string) => {
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
            });

            watcher.on('ready', () => {
                // ready 콜백을 완전히 비동기로 실행 (메인 스레드 블로킹 방지)
                setTimeout(async () => {
                    console.log(`[ExternalWatcher] Connection ${index + 1}/${connections.length} (${connection.name}) - watcher ready, starting initial sync`);
                    const readyStart = performance.now();
                    
                    const syncManager = new SyncManager(this.app, this.plugin, connection);
                    
                    console.log(`[ExternalWatcher] Connection ${index + 1}/${connections.length} - collecting watched paths...`);
                    const pathCollectStart = performance.now();
                    const paths = getAllWatchedPaths(watcher)
                        .filter(path => !path.includes('❌ '))
                        .filter(path => {
                            try {
                                return fs.statSync(path).isFile();
                            } catch (e) {
                                return false;
                            }
                        });
                    const pathCollectTime = (performance.now() - pathCollectStart).toFixed(2);
                    console.log(`[ExternalWatcher] Connection ${index + 1}/${connections.length} - collected ${paths.length} files in ${pathCollectTime}ms`);

                    console.log(`[ExternalWatcher] Connection ${index + 1}/${connections.length} - starting sync (type: ${connection.syncType})...`);
                    const syncStart = performance.now();
                    
                    try {
                        switch(connection.syncType){
                            case SyncType.vaultToExternal:
                                await syncManager.initInternalToExternal(connection);
                                break;
                            case SyncType.externalToVault:
                                await syncManager.initExternalToInternal(paths);
                                break;
                            case SyncType.bidirectional:
                                await syncManager.initBidirectional(paths);
                                break;
                        }
                        
                        const syncTime = (performance.now() - syncStart).toFixed(2);
                        const totalReadyTime = (performance.now() - readyStart).toFixed(2);
                        console.log(`[ExternalWatcher] Connection ${index + 1}/${connections.length} - sync completed in ${syncTime}ms (total ready: ${totalReadyTime}ms)`);
                    } catch (error) {
                        console.error(`[ExternalWatcher] Connection ${index + 1}/${connections.length} - sync failed:`, error);
                    }
                }, 0); // 즉시 실행하되, 이벤트 루프에 넘김
            });

            this.watchers.push(watcher);
            console.log(`[ExternalWatcher] --- Connection ${index + 1}/${connections.length} watcher added to array ---`);
        });
        
        console.log('[ExternalWatcher] ========== setupWatcher END ==========');
        console.log('[ExternalWatcher] Total watchers after setup:', this.watchers.length);
    }

    public stopWatching(immediate: boolean = false) {
        console.log(`[ExternalWatcher] ========== stopWatching START ==========`);
        console.log(`[ExternalWatcher] Current watchers count: ${this.watchers.length}`);
        const stopStart = performance.now();
        
        const count = this.watchers.length;
        
        // 배열만 비우고 watcher.close()는 절대 호출하지 않음!
        // close()는 어떤 방식으로든 시간이 걸림 (동기든 비동기든)
        // Node.js의 GC가 자동으로 파일 디스크립터를 정리함
        this.watchers = [];
        
        const totalTime = (performance.now() - stopStart).toFixed(2);
        console.log(`[ExternalWatcher] ✓ ${count} watchers detached in ${totalTime}ms (GC will cleanup)`);
        console.log(`[ExternalWatcher] ========== stopWatching END ==========`);
    }

    private isValidPath(path: string): boolean {
        return path.includes('❌ ') ? false : true;
    }
}