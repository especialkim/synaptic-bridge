import { App } from "obsidian";
import MarkdownHijacker from "main";
import { FolderConnectionSettings } from "../settings/types";
import { SyncExternalManager } from "./SyncExternalManager";

export enum RecentFileType {
    EXTERNAL = "externalFile",
    INTERNAL = "internalFile"
}

export class SyncManager {

    private app: App;
    private plugin: MarkdownHijacker;
    private connection: FolderConnectionSettings;
    private syncExternalManager: SyncExternalManager;

    constructor(app: App, plugin: MarkdownHijacker, connection: FolderConnectionSettings){
        this.app = app;
        this.plugin = plugin;
        this.connection = connection;
        this.syncExternalManager = new SyncExternalManager(app, plugin, connection);
    }

    public async initExternalToInternal(paths: string[]){
        const existingExternalSnapShots = paths.map(path => this.plugin.snapShotService.getCurrentStateSnapshot(this.connection, path));
        const snapShots = this.plugin.snapShotService.loadSnapshot(this.connection).linkedFiles; 

        // 1. Map을 만들어서 빠른 비교를 가능하게 함
        const pastMap = new Map(snapShots.map(s => [s.relativePath, s]));
        const currentMap = new Map(existingExternalSnapShots.map(s => [s.relativePath, s]));

        // 2. New: 현재에는 있지만 과거에는 없는 파일
        const newSnapShots = existingExternalSnapShots.filter(s => !pastMap.has(s.relativePath));
        if (newSnapShots.length > 0) {
            this.syncExternalManager.handleAddFiles(newSnapShots
                .map(s => this.plugin.syncService.getExternalPath(s.relativePath, this.connection)));
        }

        // 3. Deleted: 과거에는 있지만 현재에는 없는 파일
        const deletedSnapShots = snapShots.filter(s => !currentMap.has(s.relativePath));
        if (deletedSnapShots.length > 0) {
            this.syncExternalManager.handleDeleteFiles(deletedSnapShots
                .map(s => this.plugin.syncService.getExternalPath(s.relativePath, this.connection)));
        }

        // 4. Updated: relativePath는 같지만 externalModified가 다른 파일
        const updatedSnapShots = existingExternalSnapShots.filter(s => {
            const past = pastMap.get(s.relativePath);
            return past && s.externalModified !== past.externalModified;
        });
        if (updatedSnapShots.length > 0) {
            this.syncExternalManager.handleChangeFiles(updatedSnapShots
                .map(s => this.plugin.syncService.getExternalPath(s.relativePath, this.connection)));
        }
    }

    public async initInternalToExternal(connection: FolderConnectionSettings) {
        // 1. 현재 internal에 실제로 존재하는 파일의 SnapshotFile 목록 (비동기)
        const existingInternalSnapshots = await this.plugin.snapShotService.getCurrentStateSnapShotOfInternalRoot(connection);
        // 2. 과거(마지막 저장된) internal 스냅샷
        const lastSnapshots = this.plugin.snapShotService.loadSnapshot(connection).linkedFiles;
    
        // 3. Map을 만들어서 빠른 비교
        const pastMap = new Map(lastSnapshots.map(s => [s.relativePath, s]));
        const currentMap = new Map(existingInternalSnapshots.map(s => [s.relativePath, s]));
    
        // 4. New: 현재에는 있지만 과거에는 없는 파일
        const newSnapshots = existingInternalSnapshots.filter(s => !pastMap.has(s.relativePath));
        if (newSnapshots.length > 0) {
            await this.plugin.syncInternalManager.handleAddFiles(
                newSnapshots.map(s => this.plugin.syncService.getInternalPath(s.relativePath, connection)),
                connection
            );
        }
    
        // 5. Deleted: 과거에는 있지만 현재에는 없는 파일
        const deletedSnapshots = lastSnapshots.filter(s => !currentMap.has(s.relativePath));
        if (deletedSnapshots.length > 0) {
            await this.plugin.syncInternalManager.handleDeleteFiles(
                deletedSnapshots.map(s => this.plugin.syncService.getInternalPath(s.relativePath, connection)),
                connection
            );
        }
    
        // 6. Updated: relativePath는 같지만 internalModified가 다른 파일
        const updatedSnapshots = existingInternalSnapshots.filter(s => {
            const past = pastMap.get(s.relativePath);
            return past && s.internalModified !== past.internalModified;
        });
        if (updatedSnapshots.length > 0) {
            await this.plugin.syncInternalManager.handleChangeFiles(
                updatedSnapshots.map(s => this.plugin.syncService.getInternalPath(s.relativePath, connection)),
                connection
            );
        }
    }

    public async initBidirectional(paths: string[]) {
        console.log('[SyncManager] initBidirectional started');
        const totalStart = performance.now();
        
        // 1. 외부의 현재 상태
        console.log(`[SyncManager] Creating ${paths.length} external snapshots...`);
        const externalStart = performance.now();
        const existingExternalSnapShots = paths.map(path => this.plugin.snapShotService.getCurrentStateSnapshot(this.connection, path));
        const externalTime = (performance.now() - externalStart).toFixed(2);
        console.log(`[SyncManager] External snapshots created in ${externalTime}ms`);
        
        // 2. 내부의 현재 상태 (비동기)
        console.log('[SyncManager] Getting internal snapshots...');
        const internalStart = performance.now();
        const existingInternalSnapShots = await this.plugin.snapShotService.getCurrentStateSnapShotOfInternalRoot(this.connection);
        const internalTime = (performance.now() - internalStart).toFixed(2);
        console.log(`[SyncManager] Internal snapshots retrieved (${existingInternalSnapShots.length} files) in ${internalTime}ms`);
        
        // 3. 과거 스냅샷
        console.log('[SyncManager] Loading past snapshots...');
        const pastStart = performance.now();
        const snapShots = this.plugin.snapShotService.loadSnapshot(this.connection).linkedFiles;
        const pastTime = (performance.now() - pastStart).toFixed(2);
        console.log(`[SyncManager] Past snapshots loaded (${snapShots.length} files) in ${pastTime}ms`);
    
        // Map 생성 (relativePath 기준)
        const externalMap = new Map(existingExternalSnapShots.map(s => [s.relativePath, s]));
        const internalMap = new Map(existingInternalSnapShots.map(s => [s.relativePath, s]));
        const pastMap = new Map(snapShots.map(s => [s.relativePath, s]));
    
        // 결과를 담을 배열
        const toAddToExternal: string[] = [];
        const toAddToInternal: string[] = [];
        const toUpdateExternal: string[] = [];
        const toUpdateInternal: string[] = [];
        const toDeleteExternal: string[] = [];
        const toDeleteInternal: string[] = [];
        const toDeleteBoth: string[] = [];
    
        // 1. 외부 기준: 내부에만 있고 외부에 없는 파일 (추가)
        for (const s of existingInternalSnapShots) {
            if (!externalMap.has(s.relativePath)) {
                toAddToExternal.push(s.relativePath);
            }
        }
        // 2. 내부 기준: 외부에만 있고 내부에 없는 파일 (추가)
        for (const s of existingExternalSnapShots) {
            if (!internalMap.has(s.relativePath)) {
                toAddToInternal.push(s.relativePath);
            }
        }
        // 3. 수정된 파일: 양쪽에 다 있지만 mtime이 다른 경우
        for (const s of existingExternalSnapShots) {
            const internal = internalMap.get(s.relativePath);
            if (
                internal &&
                s.externalModified !== undefined &&
                internal.internalModified !== undefined &&
                s.externalModified !== internal.internalModified
            ) {
                // 더 최신인 쪽을 기준으로 업데이트
                if (s.externalModified > internal.internalModified) {
                    toUpdateInternal.push(s.relativePath);
                } else {
                    toUpdateExternal.push(s.relativePath);
                }
            }
        }
        // 4. 삭제된 파일: 과거에는 있었는데 현재는 한쪽에만 없는 경우
        for (const s of snapShots) {
            const nowInExternal = externalMap.has(s.relativePath);
            const nowInInternal = internalMap.has(s.relativePath);
            if (!nowInExternal && nowInInternal) {
                toDeleteExternal.push(s.relativePath);
            }
            if (!nowInInternal && nowInExternal) {
                toDeleteInternal.push(s.relativePath);
            }
            // 5. 양쪽 모두 없는 경우 (snapshot에만 있고 현재는 양쪽 모두 없음)
            if (!nowInExternal && !nowInInternal) {
                toDeleteBoth.push(s.relativePath);
            }
        }
    
        console.log(`[SyncManager] Analysis complete - toAddToExternal: ${toAddToExternal.length}, toAddToInternal: ${toAddToInternal.length}, toUpdateExternal: ${toUpdateExternal.length}, toUpdateInternal: ${toUpdateInternal.length}`);
        
        // 실제 동기화 처리 (예시)
        const syncStart = performance.now();
        
        if (toAddToExternal.length > 0) {
            console.log(`[SyncManager] Adding ${toAddToExternal.length} files to external...`);
            const start = performance.now();
            await this.plugin.syncInternalManager.handleAddFiles(toAddToExternal.map(s => this.plugin.syncService.getInternalPath(s, this.connection)), this.connection);
            console.log(`[SyncManager] Added to external in ${(performance.now() - start).toFixed(2)}ms`);
        }
        if (toAddToInternal.length > 0) {
            console.log(`[SyncManager] Adding ${toAddToInternal.length} files to internal...`);
            const start = performance.now();
            await this.syncExternalManager.handleAddFiles(toAddToInternal.map(s => this.plugin.syncService.getExternalPath(s, this.connection)));
            console.log(`[SyncManager] Added to internal in ${(performance.now() - start).toFixed(2)}ms`);
        }
        if (toUpdateExternal.length > 0) {
            console.log(`[SyncManager] Updating ${toUpdateExternal.length} external files...`);
            const start = performance.now();
            await this.plugin.syncInternalManager.handleChangeFiles(toUpdateExternal.map(s => this.plugin.syncService.getInternalPath(s, this.connection)), this.connection);
            console.log(`[SyncManager] Updated external in ${(performance.now() - start).toFixed(2)}ms`);
        }
        if (toUpdateInternal.length > 0) {
            console.log(`[SyncManager] Updating ${toUpdateInternal.length} internal files...`);
            const start = performance.now();
            await this.syncExternalManager.handleChangeFiles(toUpdateInternal.map(s => this.plugin.syncService.getExternalPath(s, this.connection)));
            console.log(`[SyncManager] Updated internal in ${(performance.now() - start).toFixed(2)}ms`);
        }
        if (toDeleteExternal.length > 0) {
            console.log(`[SyncManager] Deleting ${toDeleteExternal.length} external files...`);
            const start = performance.now();
            await this.syncExternalManager.handleDeleteFiles(toDeleteExternal.map(s => this.plugin.syncService.getExternalPath(s, this.connection)));
            console.log(`[SyncManager] Deleted from external in ${(performance.now() - start).toFixed(2)}ms`);
        }
        if (toDeleteInternal.length > 0) {
            console.log(`[SyncManager] Deleting ${toDeleteInternal.length} internal files...`);
            const start = performance.now();
            await this.plugin.syncInternalManager.handleDeleteFiles(toDeleteInternal.map(s => this.plugin.syncService.getInternalPath(s, this.connection)), this.connection);
            console.log(`[SyncManager] Deleted from internal in ${(performance.now() - start).toFixed(2)}ms`);
        }
        if (toDeleteBoth.length > 0) {
            console.log(`[SyncManager] Cleaning up ${toDeleteBoth.length} snapshots...`);
            const start = performance.now();
            await this.plugin.snapShotService.removeSnapShots(this.connection, toDeleteBoth);
            console.log(`[SyncManager] Cleaned up in ${(performance.now() - start).toFixed(2)}ms`);
        }
        
        const syncTime = (performance.now() - syncStart).toFixed(2);
        const totalTime = (performance.now() - totalStart).toFixed(2);
        console.log(`[SyncManager] Total sync operations completed in ${syncTime}ms`);
        console.log(`[SyncManager] initBidirectional completed in ${totalTime}ms`);
    }

}