import { App } from "obsidian";
import MarkdownHijacker from "main";
import { BidirectionalType, DeletedFileAction, FolderConnectionSettings } from "../settings/types";
import { WatcherEvent } from "./types/whatcherEvent";
import { SyncType } from "../settings/types";
import * as fs from "fs";
import * as pathModule from "path";
import { SyncExternalManager } from "./SyncExternalManager";
import { SyncInternalManager } from "./SyncInternalManager";

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

export class SyncManager {

    private app: App;
    private plugin: MarkdownHijacker;
    private connection: FolderConnectionSettings;
    // private snapShot: Snapshot = {};
    private syncExternalManager: SyncExternalManager;
    private syncInternalManager: SyncInternalManager;
    
    constructor(app: App, plugin: MarkdownHijacker, connection: FolderConnectionSettings){
        this.app = app;
        this.plugin = plugin;
        this.connection = connection;
        this.syncExternalManager = new SyncExternalManager(app, plugin, connection);
        this.syncInternalManager = new SyncInternalManager(app, plugin);
    }

    public async handleExternalWatcherReady(paths: string[]){

    }

    public async handleInternalWatcherReady(paths: string[]){
        
    }

}


export function callBackReady(
    app: App,
    connection: FolderConnectionSettings,
    paths: string[]
){
    const syncType = connection.syncType;
    const externalRootPath = connection.externalPath;
    const internalRootPath = connection.internalPath;

    const lastSnapshot = loadSnapshot(app, connection);
    const newSnapshot = paths.map(path => {
        const externalLastModified = fs.statSync(path).mtime.getTime();
        const internalPath = path.replace(externalRootPath, internalRootPath);
        const internalLastModified = app.vault.getFileByPath(internalPath)?.stat.mtime;

        return {
            relativePath: path.replace(externalRootPath, ''), // 
            externalRootPath: externalRootPath,
            internalRootPath: internalRootPath,
            externalModified: externalLastModified,
            internalModified: internalLastModified,
        };
    });

    console.log(`lastSnapshot: ${JSON.stringify(lastSnapshot, null, 2)}`);
    console.log(`newSnapshot: ${JSON.stringify(newSnapshot, null, 2)}`);

    /* lastSnapShot 과 NewSnapShot를 기준으로 비교 */
    const externalNewFile: string[] = []; // a.k.a external에서 새롭게 추가된  파일
    const externalDeletedFile: string[] = []; // a.k.a external에서 삭제된 파일
    const externalNewFolder: string[] = []; // a.k.a external에서 새롭게 추가된 폴더
    const externalDeletedFolder: string[] = []; // a.k.a external에서 삭제된 폴더
    const externalUpdatedFile: string[] = []; // a.k.a external에서 업데이트된 파일, 변경 사항중에 externalLastModified가 변경된 파일
    const internalNewFile: string[] = []; // a.k.a internal에서 새롭게 추가된 파일
    const internalDeletedFile: string[] = []; // a.k.a internal에서 삭제된 파일
    const internalNewFolder: string[] = []; // a.k.a internal에서 새롭게 추가된 폴더
    const internalDeletedFolder: string[] = []; // a.k.a internal에서 삭제된 폴더
    const internalUpdatedFile: string[] = []; // a.k.a internal에서 업데이트된 파일, 변경 사항중에 internalLastModified가 변경된 파일

    /**
     * 주어진 경로가 디렉토리인지 확인하는 함수
     * @param rootPath 기본 경로
     * @param relativePath 상대 경로
     * @returns 디렉토리이면 true, 아니면 false
     */
    function isPathDirectory(rootPath: string, relativePath: string): boolean {
        try {
            const fullPath = relativePath ? pathModule.join(rootPath, relativePath) : rootPath;
            // 빈 문자열이거나 경로 끝이 /로 끝나면 폴더로 간주
            if (relativePath === '' || relativePath.endsWith('/')) return true;
            
            // fs.statSync를 사용하여 실제 경로가 디렉토리인지 확인
            const stats = fs.statSync(fullPath);
            return stats.isDirectory();
        } catch (error) {
            // 경로가 존재하지 않거나 기타 오류 발생 시 파일로 간주
            console.warn(`경로 확인 중 오류 발생: ${rootPath}, ${relativePath}`, error);
            return false;
        }
    }

    /**
     * 이전 스냅샷 항목이 디렉토리였는지 확인하는 함수
     * @param item 스냅샷 항목
     * @returns 디렉토리였으면 true, 아니면 false
     */
    function wasPathDirectory(item: SnapshotFile): boolean {
        // 이전 스냅샷 정보로 폴더 여부 추정
        // 빈 문자열이거나 경로 끝이 /로 끝나면 폴더로 간주
        if (item.relativePath === '' || item.relativePath.endsWith('/')) {
            return true;
        }
        
        // 파일 확장자가 없으면 폴더로 추정 (단, 확장자 없는 파일도 있을 수 있음)
        // item.extensions 배열이 있으면 해당 확장자 확인
        const hasExtension = pathModule.extname(item.relativePath) !== '';
        if (!hasExtension) {
            return true;
        }
        
        return false;
    }

    /* 1. NewFile 찾기: newSnapshot에 있지만 lastSnapshot에 없는 파일 */
    const lastSnapshotPaths = new Set(lastSnapshot.linkedFiles.map(item => item.relativePath));
    const newSnapshotPaths = new Set(newSnapshot.map(item => item.relativePath));
    
    // 1-1. externalNewFile, internalNewFile, externalNewFolder, internalNewFolder 찾기
    for (const item of newSnapshot) {
        // newSnapshot에 있지만 lastSnapshot에 없는 파일/폴더
        if (!lastSnapshotPaths.has(item.relativePath)) {
            // 폴더인지 파일인지 확인
            const isFolder = isPathDirectory(item.externalRootPath, item.relativePath);
            
            // externalModified가 있고 internalModified가 undefined인 경우
            if (item.externalModified && !item.internalModified) {
                if (isFolder) {
                    externalNewFolder.push(item.relativePath);
                } else {
                    externalNewFile.push(item.relativePath);
                }
            }
            // internalModified가 있고 externalModified가 undefined인 경우
            else if (!item.externalModified && item.internalModified) {
                if (isFolder) {
                    internalNewFolder.push(item.relativePath);
                } else {
                    internalNewFile.push(item.relativePath);
                }
            }
        }
    }

    /* 2. deletedFile 찾기: lastSnapshot에 있지만 newSnapshot에 없는 파일 */
    for (const item of lastSnapshot.linkedFiles) {
        if (!newSnapshotPaths.has(item.relativePath)) {
            // 폴더였는지 파일이었는지 확인
            const wasFolder = wasPathDirectory(item);
            
            // external에서 삭제된 항목 분류
            if (wasFolder) {
                externalDeletedFolder.push(item.relativePath);
            } else {
                externalDeletedFile.push(item.relativePath);
            }
            
            // internal 파일/폴더 존재 여부 확인 (internalRootPath와 relativePath가 유효한 경우에만)
            if (item.internalRootPath && item.relativePath !== undefined) {
                // relativePath가 빈 문자열인 경우 internalRootPath를 그대로 사용
                const internalPath = item.relativePath === '' 
                    ? item.internalRootPath 
                    : pathModule.join(item.internalRootPath, item.relativePath);
                
                // Obsidian API를 사용하여 파일인지 폴더인지 확인
                const internalFile = app.vault.getFileByPath(internalPath);
                const internalFolder = app.vault.getFolderByPath(internalPath);
                
                // internal에 존재하면 삭제 처리를 위해 추가
                if (internalFile) {
                    internalDeletedFile.push(item.relativePath);
                } else if (internalFolder) {
                    internalDeletedFolder.push(item.relativePath);
                }
            }
        }
    }

    /* 3. modifiedFile 찾기: lastSnapshot과 newSnapshot 모두에 있는 파일 중 수정된 파일 */
    // newSnapshot과 lastSnapshot의 relativePath가 동일한 파일 중에서 비교
    for (const newItem of newSnapshot) {
        if (lastSnapshotPaths.has(newItem.relativePath)) {
            // 해당 파일의 lastSnapshot 찾기
            const lastItem = lastSnapshot.linkedFiles.find(item => item.relativePath === newItem.relativePath);
            if (!lastItem) continue; // 예외 처리 (이런 경우는 없어야 하지만 안전을 위해)
            
            const externalModified = newItem.externalModified;
            const lastExternalModified = lastItem.externalModified;
            const internalModified = newItem.internalModified;
            const lastInternalModified = lastItem.internalModified;
            
            // externalModified 또는 internalModified 중 하나라도 변경된 경우
            if (
                (externalModified && lastExternalModified && externalModified !== lastExternalModified) || 
                (internalModified && lastInternalModified && internalModified !== lastInternalModified)
            ) {
                // externalModified만 변경된 경우
                if (
                    (externalModified && lastExternalModified && externalModified !== lastExternalModified) && 
                    (!internalModified || !lastInternalModified || internalModified === lastInternalModified)
                ) {
                    externalUpdatedFile.push(newItem.relativePath);
                }
                // internalModified만 변경된 경우 (주석에 따르면 이 케이스는 사실상 없음)
                else if (
                    (!externalModified || !lastExternalModified || externalModified === lastExternalModified) && 
                    (internalModified && lastInternalModified && internalModified !== lastInternalModified)
                ) {
                    internalUpdatedFile.push(newItem.relativePath);
                }
                // externalModified와 internalModified 모두 변경된 경우
                else if (
                    (externalModified && lastExternalModified && externalModified !== lastExternalModified) && 
                    (internalModified && lastInternalModified && internalModified !== lastInternalModified)
                ) {
                    // 최근 수정 시간을 기준으로 판단
                    if (externalModified > internalModified) {
                        externalUpdatedFile.push(newItem.relativePath);
                    } else {
                        internalUpdatedFile.push(newItem.relativePath);
                    }
                }
            }
        }
    }
    
    // 디버깅용 로그
    console.log(`externalNewFile 개수: ${externalNewFile.length}`);
    console.log(`externalDeletedFile 개수: ${externalDeletedFile.length}`);
    console.log(`externalNewFolder 개수: ${externalNewFolder.length}`);
    console.log(`externalDeletedFolder 개수: ${externalDeletedFolder.length}`);
    console.log(`externalUpdatedFile 개수: ${externalUpdatedFile.length}`);
    console.log(`internalNewFile 개수: ${internalNewFile.length}`);
    console.log(`internalDeletedFile 개수: ${internalDeletedFile.length}`);
    console.log(`internalNewFolder 개수: ${internalNewFolder.length}`);
    console.log(`internalDeletedFolder 개수: ${internalDeletedFolder.length}`);
    console.log(`internalUpdatedFile 개수: ${internalUpdatedFile.length}`);

    return;

    if(syncType === SyncType.externalToVault){
        // external 로 시작하는 녀석들 처리 update, add(folder -> file 순서), delete(file -> folder 순서) 순서

        // snapshot 저장 데이터 만들기 : internal을 기준으로 만들어서 저장
    }

    if(syncType === SyncType.vaultToExternal){
        // Internal 로 시작하는 녀석들 처리 update, add(folder -> file 순서), delete(file -> folder 순서) 순서

        // snapshot 저장 데이터 만들기 : external을 기준으로 만들어서 저장
    }

    if(syncType === SyncType.bidirectional){
        // 1. external 로 시작하는 녀석들 처리 update, add(folder -> file 순서), delete(file -> folder 순서) 순서
        // 2. 1완료된 internal을 external에 덮어쓰기

        // snapshot 저장 데이터 만들기 : external을 기준으로 만들어서 저장 (internal 기준으로 해도 같음)
    }
 

}

export function saveSnapshot(
    app: App,
    connection: FolderConnectionSettings,
    snapshot: Snapshot
): void {
    try {
        const basePath = (app.vault.adapter as any).getBasePath?.() || '';
        const pluginDataPath = pathModule.join(basePath, '.obsidian', 'plugins', 'markdown-hijacker', 'data');
        const snapshotPath = pathModule.join(pluginDataPath, `${connection.id}.json`);

        fs.mkdirSync(pluginDataPath, { recursive: true });
        fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2), "utf-8");
        console.log(`[SyncManager] Snapshot 저장 완료: ${snapshotPath}`);
    } catch (err) {
        console.error(`[SyncManager] Snapshot 저장 실패`, err);
    }
}
  
export function loadSnapshot(
    app: App,
    connection: FolderConnectionSettings
): Snapshot {
    const basePath = (app.vault.adapter as any).getBasePath?.() || '';
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

export async function updateSnapshot(app: App, connection: FolderConnectionSettings, path: string){
    const snapShotData = generateSnapshotData(app, connection, path);
    console.log(`[SyncManager] snapShotData: ${JSON.stringify(snapShotData, null, 2)}`);

    const lastSnapShot = loadSnapshot(app, connection);
    console.log(`lastSnapShot: ${lastSnapShot}`);
    console.log(`[SyncManager] lastSnapShot: ${JSON.stringify(lastSnapShot, null, 2)}`);

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
    saveSnapshot(app, connection, lastSnapShot);
    console.log(`[SyncManager] Snapshot updated for: ${relativePath}`);
}

export function generateSnapshotData(app: App, connection: FolderConnectionSettings, path: string, isUnlinked: boolean = false): SnapshotFile {
    const relativePath = path.replace(connection.externalPath, '').replace(connection.internalPath, '');
    const internalFileSystemPath = (app.vault.adapter as any).getBasePath() + '/' + connection.internalPath + '/' + relativePath;
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

export async function deleteSnapShot(
    app: App,
    connection: FolderConnectionSettings,
    relativePath: string
) {
    const lastSnapShot = loadSnapshot(app, connection);
    /* '❌ '가 포함된 경우: 원본/이모지 경로 모두 삭제 및 내부만 존재하면 unlinked 등록 */
    if (relativePath.includes('❌ ')) {
        /* 원본 경로 계산 */
        const originalRelativePath = relativePath.replace(/^\/?❌\s*/, '/');

        /* linkedFiles/unLinkedFiles에서 원본/이모지 경로 모두 삭제 */
        lastSnapShot.linkedFiles = lastSnapShot.linkedFiles.filter((item: any) => item.relativePath !== originalRelativePath && item.relativePath !== relativePath);
        lastSnapShot.unLinkedFiles = lastSnapShot.unLinkedFiles.filter((item: any) => item.relativePath !== originalRelativePath && item.relativePath !== relativePath);

        /* 내부/외부 파일 존재 여부 및 실제 존재하는 경로로 unLinkedFiles 등록 */
        const origInternalAbsolutePath = (app.vault.adapter as any).getBasePath() + '/' + (connection.internalPath ? `${connection.internalPath}/${originalRelativePath}`.replace(/\\/g, '/') : originalRelativePath);
        const origExternalPath = connection.externalPath + originalRelativePath;
        const origInternalExists = fs.existsSync(origInternalAbsolutePath);
        const origExternalExists = fs.existsSync(origExternalPath);
        const emojiInternalAbsolutePath = (app.vault.adapter as any).getBasePath() + '/' + (connection.internalPath ? `${connection.internalPath}/${relativePath}`.replace(/\\/g, '/') : relativePath);
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
        saveSnapshot(app, connection, lastSnapShot);
        return;
    }

    /* 내부/외부 모두 없으면 완전 삭제 */
    const internalAbsolutePath = (app.vault.adapter as any).getBasePath() + '/' + (connection.internalPath ? `${connection.internalPath}/${relativePath}`.replace(/\\/g, '/') : relativePath);
    const externalPath = connection.externalPath + relativePath;
    const internalExists = fs.existsSync(internalAbsolutePath);
    const externalExists = fs.existsSync(externalPath);
    if (!internalExists && !externalExists) {
        lastSnapShot.linkedFiles = lastSnapShot.linkedFiles.filter((item: any) => item.relativePath !== relativePath);
        lastSnapShot.unLinkedFiles = lastSnapShot.unLinkedFiles.filter((item: any) => item.relativePath !== relativePath);
        saveSnapshot(app, connection, lastSnapShot);
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
        saveSnapshot(app, connection, lastSnapShot);
        return;
    }
    const unlinkedIdx = lastSnapShot.unLinkedFiles.findIndex((item: any) => item.relativePath === relativePath);
    if (unlinkedIdx !== -1) {
        lastSnapShot.unLinkedFiles[unlinkedIdx].isUnlinked = true;
        saveSnapshot(app, connection, lastSnapShot);
        return;
    }
}