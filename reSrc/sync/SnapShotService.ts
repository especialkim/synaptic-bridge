import MarkdownHijacker from "main";
import { App } from "obsidian";
import { SyncType, BidirectionalType, DeletedFileAction, FolderConnectionSettings,  } from "../settings/types";
import * as fs from "fs";
import * as pathModule from "path";

export type SnapshotFile = {
    externalRootPath: string;
    internalRootPath: string;
    relativePath: string;
    externalModified: number | undefined;
    internalModified: number | undefined;
    isUnlinked: boolean;
};

export type Snapshot = {
    id: string;
    syncType: SyncType;
    bidirectionalType: BidirectionalType;
    deletedFileAction: DeletedFileAction;
    linkedFiles: SnapshotFile[];
    unLinkedFiles: SnapshotFile[];
};

export class SnapShotService {
    private app: App;
    private plugin: MarkdownHijacker;
    private connection: FolderConnectionSettings;

    constructor(app: App, plugin: MarkdownHijacker, connection: FolderConnectionSettings){
        this.app = app;
        this.plugin = plugin;
        this.connection = connection;
    }
    
    public saveSnapshot(
        snapshot: Snapshot
    ): void {
        try {
            const basePath = (this.app.vault.adapter as any).getBasePath?.() || '';
            const pluginDataPath = pathModule.join(basePath, '.obsidian', 'plugins', 'markdown-hijacker', 'data');
            const snapshotPath = pathModule.join(pluginDataPath, `${this.connection.id}.json`);
    
            fs.mkdirSync(pluginDataPath, { recursive: true });
            fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2), "utf-8");
            console.log(`[SnapShotService] Snapshot 저장 완료: ${snapshotPath}`);
        } catch (err) {
            console.error(`[SnapShotService] Snapshot 저장 실패`, err);
        }
    }
      
    public loadSnapshot(
        connection: FolderConnectionSettings
    ): Snapshot {
        const basePath = (this.app.vault.adapter as any).getBasePath?.() || '';
        const pluginDataPath = pathModule.join(basePath, '.obsidian', 'plugins', 'markdown-hijacker', 'data');
        const snapshotPath = pathModule.join(pluginDataPath, `${connection.id}.json`);
    
        if (!fs.existsSync(snapshotPath)) {
            // 기본 구조 반환
            return {
                id: connection.id,
                syncType: connection.syncType,
                bidirectionalType: connection.bidirectionalType,
                deletedFileAction: connection.deletedFileAction,
                linkedFiles: [],
                unLinkedFiles: []
            };
        }
    
        const snapshotData = fs.readFileSync(snapshotPath, 'utf-8');
        return JSON.parse(snapshotData);
    }
    
    public async updateSnapshot(connection: FolderConnectionSettings, path: string){
        const snapShotData = this.generateSnapshotData(this.connection, path);
        console.log(`[SnapShotService] snapShotData: ${JSON.stringify(snapShotData, null, 2)}`);
    
        const lastSnapShot = this.loadSnapshot(connection);
        console.log(`lastSnapShot: ${lastSnapShot}`);
        console.log(`[SnapShotService] lastSnapShot: ${JSON.stringify(lastSnapShot, null, 2)}`);
    
        const relativePath = snapShotData.relativePath;
    
        // files 배열에서 relativePath가 같은 항목 찾기
        const existingIndex = lastSnapShot.linkedFiles.findIndex(item => item.relativePath === relativePath);
        if (existingIndex >= 0) {
            // 기존 항목 덮어쓰기
            lastSnapShot.linkedFiles[existingIndex] = snapShotData;
        } else {
            // 새 항목 추가
            lastSnapShot.linkedFiles.push(snapShotData);
        }
    
        // 변경된 스냅샷 저장
        this.saveSnapshot(lastSnapShot);
        console.log(`[SnapShotService] Snapshot updated for: ${relativePath}`);
    }
    
    public generateSnapshotData(connection: FolderConnectionSettings, path: string, isUnlinked: boolean = false): SnapshotFile {
        const relativePath = path.replace(connection.externalPath, '').replace(connection.internalPath, '');
        const internalFileSystemPath = (this.app.vault.adapter as any).getBasePath() + '/' + connection.internalPath + '/' + relativePath;
        const internalModified = fs.statSync(internalFileSystemPath).mtime.getTime();
    
        return {
            relativePath: relativePath,
            externalRootPath: connection.externalPath,
            internalRootPath: connection.internalPath,
            externalModified: fs.statSync(path).mtime.getTime(),
            internalModified: internalModified,
            isUnlinked: isUnlinked
        };
    }
    
    public async deleteSnapShot(
        connection: FolderConnectionSettings,
        relativePath: string
    ) {
        const lastSnapShot = this.loadSnapshot(connection);
        /* '❌ '가 포함된 경우: 원본/이모지 경로 모두 삭제 및 내부만 존재하면 unlinked 등록 */
        if (relativePath.includes('❌ ')) {
            /* 원본 경로 계산 */
            const originalRelativePath = relativePath.replace(/^\/?❌\s*/, '/');
    
            /* linkedFiles/unLinkedFiles에서 원본/이모지 경로 모두 삭제 */
            lastSnapShot.linkedFiles = lastSnapShot.linkedFiles.filter((item: any) => item.relativePath !== originalRelativePath && item.relativePath !== relativePath);
            lastSnapShot.unLinkedFiles = lastSnapShot.unLinkedFiles.filter((item: any) => item.relativePath !== originalRelativePath && item.relativePath !== relativePath);
    
            /* 내부/외부 파일 존재 여부 및 실제 존재하는 경로로 unLinkedFiles 등록 */
            const origInternalAbsolutePath = (this.app.vault.adapter as any).getBasePath() + '/' + (connection.internalPath ? `${connection.internalPath}/${originalRelativePath}`.replace(/\\/g, '/') : originalRelativePath);
            const origExternalPath = connection.externalPath + originalRelativePath;
            const origInternalExists = fs.existsSync(origInternalAbsolutePath);
            const origExternalExists = fs.existsSync(origExternalPath);
            const emojiInternalAbsolutePath = (this.app.vault.adapter as any).getBasePath() + '/' + (connection.internalPath ? `${connection.internalPath}/${relativePath}`.replace(/\\/g, '/') : relativePath);
            const emojiInternalExists = fs.existsSync(emojiInternalAbsolutePath);
            if ((origInternalExists || emojiInternalExists) && !origExternalExists) {
                /* 실제 존재하는 경로로 등록 */
                const unlinkedPath = emojiInternalExists ? relativePath : originalRelativePath;
                let info = lastSnapShot.linkedFiles.find((item: any) => item.relativePath === unlinkedPath);
                if (!info) {
                    const statPath = emojiInternalExists ? emojiInternalAbsolutePath : origInternalAbsolutePath;
                    info = {
                        relativePath: unlinkedPath,
                        externalRootPath: connection.externalPath,
                        internalRootPath: connection.internalPath,
                        externalModified: undefined,
                        internalModified: fs.statSync(statPath).mtime.getTime(),
                        isUnlinked: true
                    };
                } else {
                    info = { ...info, isUnlinked: true };
                }
                lastSnapShot.unLinkedFiles.push(info);
            }
            this.saveSnapshot(lastSnapShot);
            return;
        }
    
        /* 내부/외부 모두 없으면 완전 삭제 */
        const internalAbsolutePath = (this.app.vault.adapter as any).getBasePath() + '/' + (connection.internalPath ? `${connection.internalPath}/${relativePath}`.replace(/\\/g, '/') : relativePath);
        const externalPath = connection.externalPath + relativePath;
        const internalExists = fs.existsSync(internalAbsolutePath);
        const externalExists = fs.existsSync(externalPath);
        if (!internalExists && !externalExists) {
            lastSnapShot.linkedFiles = lastSnapShot.linkedFiles.filter((item: any) => item.relativePath !== relativePath);
            lastSnapShot.unLinkedFiles = lastSnapShot.unLinkedFiles.filter((item: any) => item.relativePath !== relativePath);
            this.saveSnapshot(lastSnapShot);
            return;
        }
    
        /* 둘 중 하나만 있으면 unlinked 처리 */
        const idx = lastSnapShot.linkedFiles.findIndex((item: any) => item.relativePath === relativePath);
        if (idx !== -1) {
            const file = { ...lastSnapShot.linkedFiles[idx], isUnlinked: true };
            const unlinkedIdx = lastSnapShot.unLinkedFiles.findIndex((item: any) => item.relativePath === relativePath);
            if (unlinkedIdx !== -1) {
                lastSnapShot.unLinkedFiles[unlinkedIdx] = file;
            } else {
                lastSnapShot.unLinkedFiles.push(file);
            }
            lastSnapShot.linkedFiles.splice(idx, 1);
            this.saveSnapshot(lastSnapShot);
            return;
        }
        const unlinkedIdx = lastSnapShot.unLinkedFiles.findIndex((item: any) => item.relativePath === relativePath);
        if (unlinkedIdx !== -1) {
            lastSnapShot.unLinkedFiles[unlinkedIdx].isUnlinked = true;
            this.saveSnapshot(lastSnapShot);
            return;
        }
    }
}