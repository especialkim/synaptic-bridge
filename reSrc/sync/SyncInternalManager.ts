import MarkdownHijacker from "main";
import { App, TFile } from "obsidian";
import { FolderConnectionSettings } from "reSrc/settings/types";
import { FrontmatterManager } from "reSrc/frontmatter/FrontmatterManager";
import { getVaultName } from "./utils";
import matter from "gray-matter";
import * as fs from 'fs';
import * as pathModule from 'path';
import { loadSnapshot, saveSnapshot } from "./SyncManager";
import { delay } from "reSrc/utils/delay";
import { AddFileType } from "./types/internalSyncTypes";
import { SyncService } from "./SyncService";

type SyncEvent = {
    createdAt: number;
    modifiedAt: number;
    renamedAt: number;
    deletedAt: number;
}

type SyncInternalManagerState = {
    [path: string]: SyncEvent;
}

// 내부/외부 경로 매핑을 위한 전역 캐시 (파일 변경 타임스탬프 추적)
const globalSyncCache = new Map<string, {
    internalPath: string;
    externalPath: string;
    lastSyncTimestamp: number; // 마지막 동기화 타임스탬프
    lastContent: string; // 마지막 파일 내용 (내용 비교용)
}>();

// 파일의 전체 경로(내부 또는 외부)로부터 캐시 키 생성
function getCacheKey(path: string, connection: FolderConnectionSettings): string {
    const isInternalPath = path.startsWith(connection.internalPath);
    const relativePath = isInternalPath 
        ? path.replace(connection.internalPath, '') 
        : path.replace(connection.externalPath, '');
    
    // 상대 경로 기반 고유 키 생성
    return `${connection.id}:${relativePath}`;
}

export class SyncInternalManager {

    private app: App;
    private plugin: MarkdownHijacker;
    private connection: FolderConnectionSettings;
    private isReady: boolean = false;
    private state: SyncInternalManagerState = {};
    private syncingFiles: Set<string> = new Set(); // 동기화 중인 파일 추적
    private syncService: SyncService;
    // 최소 동기화 간격 (밀리초)
    private readonly MIN_SYNC_INTERVAL = 2000; 

    constructor(app: App, plugin: MarkdownHijacker, connection: FolderConnectionSettings){
        this.app = app;
        this.plugin = plugin;
        this.connection = connection;
        this.state = {};
        this.syncService = new SyncService(app, plugin, connection);
    }

    /* Obsidian 에서는 파일 추가의 의미가 없음. */
    public async handleAddFile(path: string, connection: FolderConnectionSettings){

        console.log(`[SyncInternalManager] 파일 추가됨: ${path}`);

        /* State 초기화 */
        const createdAt = Date.now();

        if(this.state[path]) return;

        this.state[path] = {
            createdAt: createdAt,
            modifiedAt: 0,
            renamedAt: 0,
            deletedAt: 0,
        }
        const getState = () => this.state[path];

        /* Event 처리 대기 */
        await delay(500);
        if(getState().modifiedAt !== 0 && getState().renamedAt !== 0 && getState().deletedAt !== 0) return;

        /* Check Add Type */
        const addFileType = this.checkAddFileType(path);
        console.log(`[SyncInternalManager] AddFileType: ${addFileType}`);
        /* Handle by AddFileType : System Event 처리 불필요함 */
        switch(addFileType){
            case AddFileType.USER_ADD_FILE:
                // await this.syncInternalAddEvent.handleUserAddFile(path);
                break;
            case AddFileType.USER_ADD_MD_BLANK:
                // await this.syncInternalAddEvent.handleUserAddMdBlank(path);
                break;
            case AddFileType.USER_ADD_MD_CONTENT:
                // await this.syncInternalAddEvent.handleUserAddMdContent(path);
                break;
            case AddFileType.SYSTEM_ADD_FILE:
                // await this.syncInternalAddEvent.handleSystemAddFile(path);
                break;
            case AddFileType.SYSTEM_ADD_MD_BLANK:
                // await this.syncInternalAddEvent.handleSystemAddMdBlank(path);
                break;
            case AddFileType.SYSTEM_ADD_MD_CONTENT:
                // await this.syncInternalAddEvent.handleSystemAddMdContent(path);
                break;
        }
        return;

        return;

        if(this.state[path]) return;

        this.state[path] = {
            createdAt: createdAt,
            modifiedAt: 0,
            renamedAt: 0,
            deletedAt: 0,
        }
        const state = this.state[path];
        console.log(`[SyncInternalManager] 파일 추가됨: ${path}`);

        // const connection = this.findConnection(path);
        // if (!connection) return;

        const tFile = this.app.vault.getFileByPath(path);
        if (!tFile) return;

        const toUpdatedYaml = this.makeSyncFrontmatter(path, connection);
        const context = await this.app.vault.read(tFile);
        const { data, content } = matter(context);
        const mergedYaml = { ...data, ...toUpdatedYaml };
        const updatedContent = matter.stringify(content, mergedYaml);

        if (context !== updatedContent) {
            if(state.renamedAt === 0 && state.deletedAt === 0){
                await this.app.vault.modify(tFile, updatedContent);
            }
        }
    }

    private checkAddFileType(path: string, connection: FolderConnectionSettings){
        const internalPath = path;
        const 
    }

    public async handleChangeFile(path: string){
        console.log(`[SyncInternalManager] 파일 변경됨: ${path}`);

        // 이미 동기화 중인 파일이면 루프 방지를 위해 리턴
        if (this.syncingFiles.has(path)) {
            console.log(`[SyncInternalManager] 파일이 이미 동기화 중입니다: ${path}`);
            return;
        }

        // 연결 설정 확인
        const connection = this.findConnection(path);
        if (!connection) {
            return;
        }

        // 캐시 키 생성
        const cacheKey = getCacheKey(path, connection);
        
        // 캐시 확인 - 최근에 동기화된 파일이면 건너뛰기
        const now = Date.now();
        const cachedData = globalSyncCache.get(cacheKey);
        
        if (cachedData) {
            // 시간 기반 디바운싱: 마지막 동기화 이후 MIN_SYNC_INTERVAL 이내면 무시
            if (now - cachedData.lastSyncTimestamp < this.MIN_SYNC_INTERVAL) {
                console.log(`[SyncInternalManager] 최근에 동기화된 파일, 건너뜀: ${path} (${now - cachedData.lastSyncTimestamp}ms 전)`);
                return;
            }
        }

        // 동기화 중인 파일로 표시
        this.syncingFiles.add(path);
        
        try {
            /* frontmatter validation */
            const tFile = this.app.vault.getFileByPath(path);
            if (!tFile) {
                return;
            }

            // 내부 파일 읽기
            const context = await this.app.vault.read(tFile);

            // 캐시와 내용 비교
            if (cachedData && cachedData.lastContent === context) {
                console.log(`[SyncInternalManager] 파일 내용이 변경되지 않았습니다: ${path}`);
                return;
            }

            /* state */
            const modifiedAt = Date.now();
            let state = this.state[path];
            if (!state) {
                this.state[path] = {
                    createdAt: 0,
                    modifiedAt: 0,
                    renamedAt: 0,
                    deletedAt: 0,
                }
                state = this.state[path]; // 재할당 필요
            }
            state.modifiedAt = modifiedAt;

            const toUpdatedYaml = this.makeSyncFrontmatter(path, connection);
            const { data, content } = matter(context);
            const mergedYaml = { ...data, ...toUpdatedYaml };
            const updatedContent = matter.stringify(content, mergedYaml);

            // 외부 파일 경로 계산
            const externalFilePath = pathModule.join(connection.externalPath, path.replace(connection.internalPath, ''));
            
            // 외부 파일 존재 여부 확인 및 내용 비교
            let shouldWrite = true;
            if (fs.existsSync(externalFilePath)) {
                try {
                    const existingContent = fs.readFileSync(externalFilePath, 'utf8');
                    if (existingContent === updatedContent) {
                        console.log(`[SyncInternalManager] 파일 내용이 동일합니다. 동기화 건너뜀: ${externalFilePath}`);
                        shouldWrite = false;
                    }
                } catch (error) {
                    console.error(`외부 파일 읽기 오류: ${externalFilePath}`, error);
                }
            }

            if (shouldWrite) {
                const externalFolderPath = pathModule.dirname(externalFilePath);

                // Ensure external folder exists
                fs.mkdirSync(externalFolderPath, { recursive: true });

                // Write the file to external path
                fs.writeFileSync(externalFilePath, updatedContent, 'utf8');
                const externalFileStat = fs.statSync(externalFilePath);
                console.log(`[SyncInternalManager] 외부 경로에 파일 작성됨: ${externalFilePath}`);

                const getSnapShot = this.getObjSnapShot(tFile, externalFileStat, connection);

                const lastSnapShot = loadSnapshot(this.app, connection);
                lastSnapShot.push(getSnapShot);
                saveSnapshot(this.app, connection, lastSnapShot);
                
                // 캐시 업데이트
                globalSyncCache.set(cacheKey, {
                    internalPath: path,
                    externalPath: externalFilePath,
                    lastSyncTimestamp: now,
                    lastContent: updatedContent
                });
                
                console.log(`[SyncInternalManager] 캐시 업데이트 완료: ${cacheKey}`);
            }
        } finally {
            // 작업 완료 후 항상 Set에서 제거
            this.syncingFiles.delete(path);
        }
    }
    
    public handleDeleteFile(path: string){
        console.log(`[SyncInternalManager] 파일 삭제됨: ${path}`);
    }
    public handleAddFolder(path: string){
        console.log(`[SyncInternalManager] 폴더 추가됨: ${path}`);
    }
    public handleDeleteFolder(path: string){
        console.log(`[SyncInternalManager] 폴더 삭제됨: ${path}`);
    }
    public async handleRenameFile(path: string, oldPath: string){

        /* 

            rename 일때 

            oldPath -> Deleted 
            newPath -> Created or NewExisting
        
        
        
        */

        // console.log(`[SyncInternalManager] 파일 이름 변경됨: ${path} -> ${oldPath}`);
        // const connection = this.findConnection(path);
        // if (!connection) return;

        // const tFile = this.app.vault.getFileByPath(path);
        // if (!tFile) return;

        // const toUpdatedYaml = this.makeSyncFrontmatter(path, connection);
        // const context = await this.app.vault.read(tFile);
        // const { data, content } = matter(context);
        // const mergedYaml = { ...data, ...toUpdatedYaml };
        // const updatedContent = matter.stringify(content, mergedYaml);

        // if (context !== updatedContent) {
        //     await this.app.vault.modify(tFile, updatedContent);
        // }
    }
    public handleRenameFolder(path: string, oldPath: string){
        console.log(`[SyncInternalManager] 폴더 이름 변경됨: ${path} -> ${oldPath}`);
    }

    private findConnection(path: string): FolderConnectionSettings | undefined {
        return this.connections.find(connection => {
            return path.startsWith(connection.internalPath);
        });
    }

    private makeSyncFrontmatter(path: string, connection: FolderConnectionSettings, isUnlinked: boolean = false) {
        return {
            externalRoot: connection.externalPath,
            internalRoot: connection.internalPath,
            relativePath: path.replace(connection.internalPath, ''),
            internalLink: `obsidian://open?vault=${getVaultName(this.app)}&file=${encodeURIComponent(path)}`,
            externalLink: `file://${encodeURIComponent(path.replace(connection.internalPath, connection.externalPath))}`,
            isUnlinked: isUnlinked,
            syncType: connection.syncType,
            bidirectionalType: connection.bidirectionalType,
            deletedFileAction: connection.deletedFileAction,
        }
    }

    private getObjSnapShot(internalFile: TFile, externalFile: fs.Stats, connection: FolderConnectionSettings){
        return {
            externalRootPath: connection.externalPath,
            internalRootPath: connection.internalPath,
            relativePath: internalFile.path.replace(connection.internalPath, ''),
            externalModified: externalFile.mtime.getTime(),
            internalModified: internalFile.stat.mtime,
            isUnlinked: false,
            syncType: connection.syncType,
            bidirectionalType: connection.bidirectionalType,
            deletedFileAction: connection.deletedFileAction,
        }
    }
}