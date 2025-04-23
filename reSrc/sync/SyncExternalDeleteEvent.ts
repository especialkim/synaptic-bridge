import { App } from "obsidian";
import { SyncExternalManager } from "./SyncExternalManager";
import MarkdownHijacker from "main";
import { FolderConnectionSettings } from "reSrc/settings/types";
import { SyncService } from "./SyncService";
import { DeletedFileAction } from "reSrc/settings/types";
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
        this.syncService = new SyncService(app, plugin, connection);
    }

    /* Delete File */
    public async handleUserDeleteMd(path: string){
        console.log(`[SyncExternalDeleteEvent] handleUserDeleteMd: ${path}`);

        if(this.connection.deletedFileAction === DeletedFileAction.property){
            await this.syncService.deleteFileActionProperty(path);
        }else{
            await this.syncService.deleteFileActionDelete(path);
        }
    }

    public async handleUserDeleteNotMd(path: string){
        console.log(`[SyncExternalDeleteEvent] handleUserDeleteNotMd: ${path}`);

        if(this.connection.deletedFileAction === DeletedFileAction.property){
            await this.syncService.deleteFileActionProperty(path, false);
        }else{
            await this.syncService.deleteFileActionDelete(path);
        }
    }
    
    public handleSystemDeleteMd(path: string){
        return;
    }

    public handleSystemDeleteNotMd(path: string){
        return;
    }

    /* Delete Folder */
    public async handleUserDeleteFolder(path: string){
        if(this.connection.deletedFileAction === DeletedFileAction.property){
            await this.syncService.deleteFolderActionProperty(path);
        }else{
            await this.syncService.deleteFolderActionDelete(path);
        }
    }

    public handleSystemDeleteFolder(path: string){
        return;
    }
}
