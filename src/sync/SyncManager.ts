import { App } from "obsidian";
import MarkdownHijacker from "main";
import { FolderConnectionSettings } from "../settings/types";
import { SyncExternalManager } from "./SyncExternalManager";
import { SyncInternalManager } from "./SyncInternalManager";
import { SnapShotService } from "./SnapShotService";
import { SyncService } from "./SyncService";

export enum RecentFileType {
    EXTERNAL = "externalFile",
    INTERNAL = "internalFile"
}

export class SyncManager {

    private snapShotService: SnapShotService;
    private connection: FolderConnectionSettings;
    private syncExternalManager: SyncExternalManager;
    private syncInternalManager: SyncInternalManager;
    private syncService: SyncService;

    constructor(app: App, plugin: MarkdownHijacker, connection: FolderConnectionSettings){
        this.snapShotService = new SnapShotService(app, plugin);
        this.connection = connection;
        this.syncExternalManager = new SyncExternalManager(app, plugin, connection);
        this.syncInternalManager = new SyncInternalManager(app, plugin);
        this.syncService = new SyncService(app, plugin);
    }

    public async initExternalToInternal(paths: string[]){
        const existingExternalSnapShots = paths.map(path => this.snapShotService.getCurrentStateSnapshot(this.connection, path));
        const snapShots = this.snapShotService.loadSnapshot(this.connection).linkedFiles; 

        // 1. Map을 만들어서 빠른 비교를 가능하게 함
        const pastMap = new Map(snapShots.map(s => [s.relativePath, s]));
        const currentMap = new Map(existingExternalSnapShots.map(s => [s.relativePath, s]));

        // 2. New: 현재에는 있지만 과거에는 없는 파일
        const newSnapShots = existingExternalSnapShots.filter(s => !pastMap.has(s.relativePath));
        if (newSnapShots.length > 0) {
            this.syncExternalManager.handleAddFiles(newSnapShots
                .map(s => this.syncService.getExternalPath(s.relativePath, this.connection)));
        }

        // 3. Deleted: 과거에는 있지만 현재에는 없는 파일
        const deletedSnapShots = snapShots.filter(s => !currentMap.has(s.relativePath));
        if (deletedSnapShots.length > 0) {
            this.syncExternalManager.handleDeleteFiles(deletedSnapShots
                .map(s => this.syncService.getExternalPath(s.relativePath, this.connection)));
        }

        // 4. Updated: relativePath는 같지만 externalModified가 다른 파일
        const updatedSnapShots = existingExternalSnapShots.filter(s => {
            const past = pastMap.get(s.relativePath);
            return past && s.externalModified !== past.externalModified;
        });
        if (updatedSnapShots.length > 0) {
            this.syncExternalManager.handleChangeFiles(updatedSnapShots
                .map(s => this.syncService.getExternalPath(s.relativePath, this.connection)));
        }
    }

    public async initInternalToExternal(connection: FolderConnectionSettings) {
        // 1. 현재 internal에 실제로 존재하는 파일의 SnapshotFile 목록 (비동기)
        const existingInternalSnapshots = await this.snapShotService.getCurrentStateSnapShotOfInternalRoot(connection);
        // 2. 과거(마지막 저장된) internal 스냅샷
        const lastSnapshots = this.snapShotService.loadSnapshot(connection).linkedFiles;
    
        // 3. Map을 만들어서 빠른 비교
        const pastMap = new Map(lastSnapshots.map(s => [s.relativePath, s]));
        const currentMap = new Map(existingInternalSnapshots.map(s => [s.relativePath, s]));
    
        // 4. New: 현재에는 있지만 과거에는 없는 파일
        const newSnapshots = existingInternalSnapshots.filter(s => !pastMap.has(s.relativePath));
        if (newSnapshots.length > 0) {
            await this.syncInternalManager.handleAddFiles(
                newSnapshots.map(s => this.syncService.getInternalPath(s.relativePath, connection)),
                connection
            );
        }
    
        // 5. Deleted: 과거에는 있지만 현재에는 없는 파일
        const deletedSnapshots = lastSnapshots.filter(s => !currentMap.has(s.relativePath));
        if (deletedSnapshots.length > 0) {
            await this.syncInternalManager.handleDeleteFiles(
                deletedSnapshots.map(s => this.syncService.getInternalPath(s.relativePath, connection)),
                connection
            );
        }
    
        // 6. Updated: relativePath는 같지만 internalModified가 다른 파일
        const updatedSnapshots = existingInternalSnapshots.filter(s => {
            const past = pastMap.get(s.relativePath);
            return past && s.internalModified !== past.internalModified;
        });
        if (updatedSnapshots.length > 0) {
            await this.syncInternalManager.handleChangeFiles(
                updatedSnapshots.map(s => this.syncService.getInternalPath(s.relativePath, connection)),
                connection
            );
        }
    }

    public async initBidirectional(paths: string[]) {
        // 1. 외부의 현재 상태
        const existingExternalSnapShots = paths.map(path => this.snapShotService.getCurrentStateSnapshot(this.connection, path));
        // 2. 내부의 현재 상태 (비동기)
        const existingInternalSnapShots = await this.snapShotService.getCurrentStateSnapShotOfInternalRoot(this.connection);
        // 3. 과거 스냅샷
        const snapShots = this.snapShotService.loadSnapshot(this.connection).linkedFiles;
    
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
    
        // 실제 동기화 처리 (예시)
        if (toAddToExternal.length > 0) {
            // 내부에서 외부로 추가
            await this.syncInternalManager.handleAddFiles(toAddToExternal.map(s => this.syncService.getInternalPath(s, this.connection)), this.connection);
        }
        if (toAddToInternal.length > 0) {
            // 외부에서 내부로 추가
            await this.syncExternalManager.handleAddFiles(toAddToInternal.map(s => this.syncService.getExternalPath(s, this.connection)));
        }
        if (toUpdateExternal.length > 0) {
            // 내부에서 외부로 업데이트
            await this.syncInternalManager.handleChangeFiles(toUpdateExternal.map(s => this.syncService.getInternalPath(s, this.connection)), this.connection);
        }
        if (toUpdateInternal.length > 0) {
            // 외부에서 내부로 업데이트
            await this.syncExternalManager.handleChangeFiles(toUpdateInternal.map(s => this.syncService.getExternalPath(s, this.connection)));
        }
        if (toDeleteExternal.length > 0) {
            // 외부에 없고 내부에 있음 -> 외부에서 삭제 이벤트
            await this.syncExternalManager.handleDeleteFiles(toDeleteExternal.map(s => this.syncService.getExternalPath(s, this.connection)));
        }
        if (toDeleteInternal.length > 0) {
            // 내부에 없고 외부에 있음 -> 내부에서 삭제 이벤트
            await this.syncInternalManager.handleDeleteFiles(toDeleteInternal.map(s => this.syncService.getInternalPath(s, this.connection)), this.connection);
        }
        if (toDeleteBoth.length > 0) {
            // 양쪽 모두 없는 경우: snapshot에서만 정리
            console.log(`[SyncManager] 양쪽 모두 없는 경우: ${toDeleteBoth}`);
            await this.snapShotService.removeSnapShots(this.connection, toDeleteBoth);
        }
    }

}