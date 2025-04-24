import { App } from "obsidian";
import { SyncExternalManager } from "./SyncExternalManager";
import MarkdownHijacker from "main";
import { FolderConnectionSettings } from "src/settings/types";
import { SyncService } from "./SyncService";
import { DeletedFileAction } from "src/settings/types";
import * as fs from 'fs';
import * as pathModule from 'path';

export class SyncExternalDeleteEvent {
    private app: App;
    private plugin: MarkdownHijacker;
    private connection: FolderConnectionSettings;
    private syncService: SyncService;

    constructor(app: App, plugin: MarkdownHijacker, connection: FolderConnectionSettings){
        this.app = app;
        this.plugin = plugin;
        this.connection = connection;
        this.syncService = new SyncService(app, plugin);
    }

    /* Delete File */
    public async handleUserDeleteMd(path: string){
        console.log(`[SyncExternalDeleteEvent] handleUserDeleteMd: ${path}`);

        if(this.connection.deletedFileAction === DeletedFileAction.property){
            await this.syncService.deleteFileActionPropertyOnExternal(path, this.connection);
        }else{
            await this.syncService.deleteFileActionDeleteOnExternal(path, this.connection);
        }
    }

    public async handleUserDeleteNotMd(path: string){
        console.log(`[SyncExternalDeleteEvent] handleUserDeleteNotMd: ${path}`);

        if(this.connection.deletedFileAction === DeletedFileAction.property){
            await this.syncService.deleteFileActionPropertyOnExternal(path, this.connection, false);
        }else{
            await this.syncService.deleteFileActionDeleteOnExternal(path, this.connection);
        }
    }
    
    public async handleSystemDeleteMd(path: string){
        if(path.includes('❌ ')){
            this.syncService.deleteFileActionDeleteOnExternal(path, this.connection);
        }
        return;
    }

    public async handleSystemDeleteNotMd(path: string){
        if(path.includes('❌ ')){
            this.syncService.deleteFileActionDeleteOnExternal(path, this.connection);
        }
        return;
    }

    /* Delete Folder */
    public async handleUserDeleteFolder(path: string){
        console.log(`[SyncExternalDeleteEvent] handleUserDeleteFolder: ${path}`);

        if(this.connection.deletedFileAction === DeletedFileAction.property){
            await this.syncService.deleteFolderActionPropertyOnExternal(path, this.connection);
        }else{
            await this.syncService.deleteFolderActionDeleteOnExternal(path, this.connection);
        }
    }

    public handleSystemDeleteFolder(path: string){
        return;
    }
}
