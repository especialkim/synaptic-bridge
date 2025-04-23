/* 
    externalRoot: 
    internalRoot: 
    relativePath: 
    internalLink: 
    externalLink: 
    isDeleted: 
    syncType: 
    bidirectionalType: 
    deletedFileAction: 
*/

import MarkdownHijacker from "main";
import { App } from "obsidian";
import { BidirectionalType, DeletedFileAction, FolderConnectionSettings, SyncType } from "reSrc/settings/types";
import matter from "gray-matter";
import * as fs from "fs";


export type SyncFrontmatter = {
    externalRoot: string;
    internalRoot: string;
    relativePath: string;
    internalLink: string;
    externalLink: string;
    isDeleted: boolean;
    syncType: SyncType;
    bidirectionalType: BidirectionalType;
    deletedFileAction: DeletedFileAction;
}

export class FrontmatterManager {
    private app: App;
    private plugin: MarkdownHijacker;
    private connection: FolderConnectionSettings;

    constructor(app: App, plugin: MarkdownHijacker, connection: FolderConnectionSettings){
        this.app = app;
        this.plugin = plugin;
        this.connection = connection;
    }

    
    
}