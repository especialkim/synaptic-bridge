import MarkdownHijacker from "main";
import { App } from "obsidian";
import { DeletedFileAction, FolderConnectionSettings } from "src/settings/types";

export class SyncInternalDeleteEvent {

    private app: App;
    private plugin: MarkdownHijacker;
    
    constructor(app: App, plugin: MarkdownHijacker){
        this.app = app;
        this.plugin = plugin;
    }
    
    /* User Delete File */
    public async handleUserDeleteMd(path: string, connection: FolderConnectionSettings){

        if(connection.deletedFileAction === DeletedFileAction.property){
            await this.plugin.syncService.deleteFileActionPropertyOnInternal(path, connection);
        }else{
            await this.plugin.syncService.deleteFileActionDeleteOnInternal(path, connection);
        }
    }

    public async handleUserDeleteNotMd(path: string, connection: FolderConnectionSettings){

        if(connection.deletedFileAction === DeletedFileAction.property){
            await this.plugin.syncService.deleteFileActionPropertyOnInternal(path, connection, false);
        }else{
            await this.plugin.syncService.deleteFileActionDeleteOnInternal(path, connection);
        }
    }

    /* System Delete File : '❌ '옵션일때만 처리 */
    public async handleSystemDeleteMd(path: string, connection: FolderConnectionSettings){
        if(path.includes('❌ ')){
            this.plugin.syncService.deleteFileActionDeleteOnInternal(path, connection);
        }
        return;
    }

    public async handleSystemDeleteNotMd(path: string, connection: FolderConnectionSettings){
        if(path.includes('❌ ')){
            this.plugin.syncService.deleteFileActionDeleteOnInternal(path, connection);
        }
        return;
    }

    /* User Delete Folder */
    public async handleUserDeleteFolder(path: string, connection: FolderConnectionSettings){
        
        if(connection.deletedFileAction === DeletedFileAction.property){
            await this.plugin.syncService.deleteFolderActionPropertyOnInternal(path, connection);
        }else{
            await this.plugin.syncService.deleteFolderActionDeleteOnInternal(path, connection);
        }
    }

    /* System Delete Folder 처리 불필요 */
    public async handleSystemDeleteFolder(path: string, connection: FolderConnectionSettings){
        return;
    }

    /* Force Delete */
    public async forceDeleteFile(path: string, connection: FolderConnectionSettings){
        await this.plugin.syncService.deleteFileActionDeleteOnInternal(path, connection);
    }

    public async forceDeleteFolder(path: string, connection: FolderConnectionSettings){
        await this.plugin.syncService.deleteFolderActionDeleteOnInternal(path, connection);
    }
}