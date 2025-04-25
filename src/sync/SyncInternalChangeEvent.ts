import MarkdownHijacker from "main";
import { App } from "obsidian";
import { FolderConnectionSettings } from "src/settings/types";

export class SyncInternalChangeEvent {

    private app: App;
    private plugin: MarkdownHijacker;

    constructor(app: App, plugin: MarkdownHijacker){
        this.app = app;
        this.plugin = plugin;
    }
    
    public async handleUserChangeMd(path: string, connection: FolderConnectionSettings){

        const isFrontmatterValid = this.plugin.syncService.isFrontmatterValid(path, connection);
        if(!isFrontmatterValid){
            const frontmatter = this.plugin.syncService.generateFrontmatter(path, connection, false);
            await this.plugin.syncService.updateInternalFileFrontmatter(path, frontmatter, connection);
        }

        /* Internal File 업데이트 */
        await this.plugin.syncService.syncFileToExternal(path, connection);
        return;
    }

    public async handleUserChangeNotMd(path: string, connection: FolderConnectionSettings){
        await this.plugin.syncService.syncFileToExternal(path, connection);
    }

    /* System Change 처리 불필요 */
    public async handleSystemChangeMd(path: string, connection: FolderConnectionSettings){
        return;
    }

    public async handleSystemChangeNotMd(path: string, connection: FolderConnectionSettings){
        return;
    }
}   