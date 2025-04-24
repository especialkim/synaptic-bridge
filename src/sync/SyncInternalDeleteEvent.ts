import MarkdownHijacker from "main";
import { App } from "obsidian";
import { DeletedFileAction, FolderConnectionSettings } from "src/settings/types";
import { SyncService } from "./SyncService";

export class SyncInternalDeleteEvent {

    private app: App;
    private plugin: MarkdownHijacker;
    private syncService: SyncService;
    
    constructor(app: App, plugin: MarkdownHijacker){
        this.app = app;
        this.plugin = plugin;
        this.syncService = new SyncService(app, plugin);
    }
    
    /* User Delete File */
    public async handleUserDeleteMd(path: string, connection: FolderConnectionSettings){
        console.log(`[SyncInternalDeleteEvent] handleUserDeleteMd: ${path}`);

        if(connection.deletedFileAction === DeletedFileAction.property){
            await this.syncService.deleteFileActionPropertyOnInternal(path, connection);
        }else{
            await this.syncService.deleteFileActionDeleteOnInternal(path, connection);
        }
    }

    public async handleUserDeleteNotMd(path: string, connection: FolderConnectionSettings){
        console.log(`[SyncInternalDeleteEvent] handleUserDeleteNotMd: ${path}`);

        if(connection.deletedFileAction === DeletedFileAction.property){
            await this.syncService.deleteFileActionPropertyOnInternal(path, connection, false);
        }else{
            await this.syncService.deleteFileActionDeleteOnInternal(path, connection);
        }
    }

    /* System Delete File : '❌ '옵션일때만 처리 */
    public async handleSystemDeleteMd(path: string, connection: FolderConnectionSettings){
        if(path.includes('❌ ')){
            this.syncService.deleteFileActionDeleteOnInternal(path, connection);
        }
        return;
    }

    public async handleSystemDeleteNotMd(path: string, connection: FolderConnectionSettings){
        if(path.includes('❌ ')){
            this.syncService.deleteFileActionDeleteOnInternal(path, connection);
        }
        return;
    }

    /* User Delete Folder */
    public async handleUserDeleteFolder(path: string, connection: FolderConnectionSettings){
        console.log(`[SyncInternalDeleteEvent] handleUserDeleteFolder: ${path}`);
        
        if(connection.deletedFileAction === DeletedFileAction.property){
            await this.syncService.deleteFolderActionPropertyOnInternal(path, connection);
        }else{
            await this.syncService.deleteFolderActionDeleteOnInternal(path, connection);
        }
    }

    /* System Delete Folder 처리 불필요 */
    public async handleSystemDeleteFolder(path: string, connection: FolderConnectionSettings){
        console.log(`[SyncInternalDeleteEvent] handleSystemDeleteFolder: ${path}`);
        return;
    }

    /* Force Delete */
    public async forceDeleteFile(path: string, connection: FolderConnectionSettings){
        console.log(`[SyncInternalDeleteEvent] forceDeleteFile: ${path}`);
        await this.syncService.deleteFileActionDeleteOnInternal(path, connection);
    }

    public async forceDeleteFolder(path: string, connection: FolderConnectionSettings){
        console.log(`[SyncInternalDeleteEvent] forceDeleteFolder: ${path}`);
        await this.syncService.deleteFolderActionDeleteOnInternal(path, connection);
    }
}