import MarkdownHijacker from "main";
import { App } from "obsidian";
import { FolderConnectionSettings } from "src/settings/types";
import { SyncService } from "./SyncService";

export class SyncExternalChangeEvent {

    private app: App;
    private plugin: MarkdownHijacker;
    private connection: FolderConnectionSettings;

    constructor(app: App, plugin: MarkdownHijacker, connection: FolderConnectionSettings) {
        this.app = app;
        this.plugin = plugin;
        this.connection = connection;
    }

    public async handleUserChangeMd(path: string){
        
        const isFrontmatterValid = this.plugin.syncService.isFrontmatterValid(path, this.connection);
        if(!isFrontmatterValid){
            const frontmatter = this.plugin.syncService.generateFrontmatter(path, this.connection, false);
            await this.plugin.syncService.updateExternalFileFrontmatter(path, frontmatter, this.connection);
        }

        /* Internal File 업데이트 */
        await this.plugin.syncService.syncFileToInternal(path, this.connection);
        return;
    }

    public async handleUserChangeNotMd(path: string){
        await this.plugin.syncService.syncFileToInternal(path, this.connection);
    }

    public async handleSystemChangeMd(path: string){
        return;
    }

    public async handleSystemChangeNotMd(path: string){
        return;
    }
}