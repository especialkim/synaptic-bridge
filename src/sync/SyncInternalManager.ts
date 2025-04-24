import MarkdownHijacker from "main";
import { App, TFile } from "obsidian";
import { FolderConnectionSettings } from "src/settings/types";
import { FrontmatterManager } from "src/frontmatter/FrontmatterManager";
import { getVaultName } from "./utils";
import matter from "gray-matter";
import * as fs from 'fs';
import * as pathModule from 'path';
import { delay } from "src/utils/delay";
import { AddFileType, ChangeFileType, DeleteFileType, DeleteFolderType, SyncInternalManagerState } from "./types/internalSyncTypes";
import { SyncService } from "./SyncService";
import { SyncInternalAddEvent } from "./SyncInternalAddEvent";
import { SyncInternalChangeEvent } from "./SyncInternalChangeEvent";
import { SyncInternalDeleteEvent } from "./SyncInternalDeleteEvent";


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
    private connections: FolderConnectionSettings[];
    private state: SyncInternalManagerState = {};
    private syncingFiles: Set<string> = new Set(); // 동기화 중인 파일 추적
    private syncService: SyncService;
    private syncInternalAddEvent: SyncInternalAddEvent;
    private syncInternalChangeEvent: SyncInternalChangeEvent;
    private syncInternalDeleteEvent: SyncInternalDeleteEvent;

    // 최소 동기화 간격 (밀리초)
    private readonly MIN_SYNC_INTERVAL = 2000; 

    constructor(app: App, plugin: MarkdownHijacker){
        this.app = app;
        this.plugin = plugin;
        this.connections = plugin.settings.connections;
        this.state = {};
        this.syncService = new SyncService(app, plugin);
        this.syncInternalAddEvent = new SyncInternalAddEvent(app, plugin);
        this.syncInternalChangeEvent = new SyncInternalChangeEvent(app, plugin);
        this.syncInternalDeleteEvent = new SyncInternalDeleteEvent(app, plugin);
    }

    /* Add File */
    public async handleAddFiles(paths: string[], connection: FolderConnectionSettings){
        for(const path of paths){
            await this.handleAddFile(path, connection);
        }
    }

    public async handleAddFile(path: string, connection: FolderConnectionSettings){

        console.log(`[SyncInternalManager] 파일 추가됨: ${path}`);

        /* State 초기화 */
        // const createdAt = Date.now();

        // if(this.state[path]) return;

        // this.state[path] = {
        //     createdAt: createdAt,
        //     modifiedAt: 0,
        //     renamedAt: 0,
        //     deletedAt: 0,
        // }
        // const getState = () => this.state[path];

        /* Event 처리 대기 */
        // await delay(500);
        // if(getState().modifiedAt !== 0 && getState().renamedAt !== 0 && getState().deletedAt !== 0) return;


        /* Check Add Type */
        const addFileType = await this.checkAddFileType(path, connection);

        /* Handle by AddFileType : System Event 처리 불필요함 */
        switch(addFileType){
            case AddFileType.USER_ADD_FILE:
                await this.syncInternalAddEvent.handleUserAddFile(path, connection);
                break;
            case AddFileType.USER_ADD_MD_BLANK:
                await this.syncInternalAddEvent.handleUserAddMdBlank(path, connection);
                break;
            case AddFileType.USER_ADD_MD_CONTENT:
                await this.syncInternalAddEvent.handleUserAddMdContent(path, connection);
                break;
            case AddFileType.SYSTEM_ADD_FILE:
                await this.syncInternalAddEvent.handleSystemAddFile(path, connection);
                break;
            case AddFileType.SYSTEM_ADD_MD_BLANK:
                await this.syncInternalAddEvent.handleSystemAddMdBlank(path, connection);
                break;
            case AddFileType.SYSTEM_ADD_MD_CONTENT:
                await this.syncInternalAddEvent.handleSystemAddMdContent(path, connection);
                break;
        }
        return;
    }

    /* Add Folder */
    public async handleAddFolder(path: string, connection: FolderConnectionSettings){
        await this.syncInternalAddEvent.handleAddFolder(path, connection);
    }

    /* Change File */
    public async handleChangeFiles(paths: string[], connection: FolderConnectionSettings){
        for(const path of paths){
            await this.handleChangeFile(path, connection);
        }
    }

    public async handleChangeFile(path: string, connection: FolderConnectionSettings){

        console.log(`[SyncInternalManager] 파일 변경됨: ${path}`);
        // const modifiedAt = Date.now();
        //     // state[path]가 없으면 초기화
        // if (!this.state[path]) {
        //     this.state[path] = {
        //         createdAt: 0,
        //         modifiedAt: 0,
        //         renamedAt: 0,
        //         deletedAt: 0,
        //     };
        // }
        // this.state[path].modifiedAt = modifiedAt;

        const changeFileType = await this.checkChangeFileType(path, connection);

        switch(changeFileType){
            case ChangeFileType.USER_CHANGE_MD:
                await this.syncInternalChangeEvent.handleUserChangeMd(path, connection);
                break;
            case ChangeFileType.USER_CHANGE_NOT_MD:
                await this.syncInternalChangeEvent.handleUserChangeNotMd(path, connection);
                break;
            case ChangeFileType.SYSTEM_CHANGE_MD:
                await this.syncInternalChangeEvent.handleSystemChangeMd(path, connection);
                break;
            case ChangeFileType.SYSTEM_CHANGE_NOT_MD:
                await this.syncInternalChangeEvent.handleSystemChangeNotMd(path, connection);
                break;
        }
        return;
    }
    
    /* Delete File */
    public async handleDeleteFiles(paths: string[], connection: FolderConnectionSettings){
        for(const path of paths){
            await this.handleDeleteFile(path, connection);
        }
    }

    public async handleDeleteFile(path: string, connection: FolderConnectionSettings){
        console.log(`[SyncInternalManager] 파일 삭제됨: ${path}`);

        // const deletedAt = Date.now();
        // if (!this.state[path]) {
        //     this.state[path] = {
        //         createdAt: 0,
        //         modifiedAt: 0,
        //         renamedAt: 0,
        //         deletedAt: 0,
        //     };
        // }
        // this.state[path].deletedAt = deletedAt; 

        const deleteFileType = await this.checkDeleteFileType(path, connection);
        console.log(`[SyncInternalManager] deleteFileType: ${deleteFileType}`);

        switch(deleteFileType){
            case DeleteFileType.USER_DELETE_MD:
                await this.syncInternalDeleteEvent.handleUserDeleteMd(path, connection);
                break;
            case DeleteFileType.USER_DELETE_NOT_MD:
                await this.syncInternalDeleteEvent.handleUserDeleteNotMd(path, connection);
                break;
            case DeleteFileType.SYSTEM_DELETE_MD:
                await this.syncInternalDeleteEvent.handleSystemDeleteMd(path, connection);
                break;
            case DeleteFileType.SYSTEM_DELETE_NOT_MD:
                await this.syncInternalDeleteEvent.handleSystemDeleteNotMd(path, connection);
                break;
        }

    }

    /* Delete Folder */
    public async handleDeleteFolder(path: string, connection: FolderConnectionSettings){
        console.log(`[SyncInternalManager] 폴더 삭제됨: ${path}`);

        const deleteFolderType = await this.checkDeleteFolderType(path, connection);
        console.log(`[SyncInternalManager] deleteFolderType: ${deleteFolderType}`);

        switch(deleteFolderType){
            case DeleteFolderType.USER_DELETE_FOLDER:
                await this.syncInternalDeleteEvent.handleUserDeleteFolder(path, connection);
                break;
            case DeleteFolderType.SYSTEM_DELETE_FOLDER:
                await this.syncInternalDeleteEvent.handleSystemDeleteFolder(path, connection);
                break;
        }
    }

    private async checkDeleteFolderType(path: string, connection: FolderConnectionSettings){
        const internalPath = path;
        const relativePath = this.syncService.getRelativePath(path, connection);
        const externalPath = this.syncService.getExternalPath(relativePath, connection);

        if(!fs.existsSync(externalPath)) return DeleteFolderType.SYSTEM_DELETE_FOLDER;
        return DeleteFolderType.USER_DELETE_FOLDER;
    }
    
    /* Rename Handler */
    public async handleRenameFolder(path: string, oldPath: string, connection: FolderConnectionSettings){
        await this.syncInternalDeleteEvent.forceDeleteFolder(oldPath, connection);
        await this.handleAddFolder(path, connection);
    }

    public async handleRenameFile(path: string, oldPath: string, connection: FolderConnectionSettings){
        await this.syncInternalDeleteEvent.forceDeleteFile(oldPath, connection);
        await this.handleAddFile(path, connection);
    }

    /* ======================= Private Methods ======================= */

    private async checkAddFileType(path: string, connection: FolderConnectionSettings){
        const internalPath = path;
        const relativePath = this.syncService.getRelativePath(path, connection);
        const externalPath = pathModule.join(connection.externalPath, relativePath);

        let didUserAdd = true;
        const externalFile = fs.existsSync(externalPath);
        if(externalFile) didUserAdd = false;

        const isMarkdown = path.endsWith('.md');
        
        if(!isMarkdown && didUserAdd) return AddFileType.USER_ADD_FILE;
        if(!isMarkdown && !didUserAdd) return AddFileType.SYSTEM_ADD_FILE;
        
        const isBlank = await this.isBlankFile(path);

        if(didUserAdd && isBlank) return AddFileType.USER_ADD_MD_BLANK;
        if(didUserAdd && !isBlank) return AddFileType.USER_ADD_MD_CONTENT;
        if(!didUserAdd && isBlank) return AddFileType.SYSTEM_ADD_MD_BLANK;
        if(!didUserAdd && !isBlank) return AddFileType.SYSTEM_ADD_MD_CONTENT;
    }

    private async checkChangeFileType(path: string, connection: FolderConnectionSettings){
        
        const internalPath = path;
        const relativePath = this.syncService.getRelativePath(internalPath, connection);
        const internalAbsolutePath = this.syncService.getInternalAbsolutePath(relativePath, connection);
        const externalPath = this.syncService.getExternalPath(relativePath, connection);

        const didChangeUser = !(await this.syncService.isSameFile(internalAbsolutePath, externalPath));
        const isMarkdown = internalPath.endsWith('.md');

        if(isMarkdown && didChangeUser) return ChangeFileType.USER_CHANGE_MD;
        if(isMarkdown && !didChangeUser) return ChangeFileType.SYSTEM_CHANGE_MD;
        if(!isMarkdown && didChangeUser) return ChangeFileType.USER_CHANGE_NOT_MD;
        if(!isMarkdown && !didChangeUser) return ChangeFileType.SYSTEM_CHANGE_NOT_MD;
    }

    private async isBlankFile(path: string){
        const tFile = this.app.vault.getFileByPath(path);
        if(!tFile) return;
        
        const context = await this.app.vault.read(tFile);
        console.log(`[SyncInternalManager] context: ${context}`);
        return context.trim() === '';
    }

    private async checkDeleteFileType(path: string, connection: FolderConnectionSettings){
        let didUserDelete = true;
        const isMarkdown = path.endsWith('.md');

        const relativePath = this.syncService.getRelativePath(path, connection);
        const externalPath = pathModule.join(connection.externalPath, relativePath);

        const externalFileExists = fs.existsSync(externalPath);
        if(!externalFileExists) didUserDelete = false;

        if(isMarkdown && didUserDelete) return DeleteFileType.USER_DELETE_MD;
        if(isMarkdown && !didUserDelete) return DeleteFileType.SYSTEM_DELETE_MD;
        if(!isMarkdown && didUserDelete) return DeleteFileType.USER_DELETE_NOT_MD;
        if(!isMarkdown && !didUserDelete) return DeleteFileType.SYSTEM_DELETE_NOT_MD;
    }
}