import MarkdownHijacker from "main";
import { App } from "obsidian";
import { FolderConnectionSettings } from "src/settings/types";
import { SyncService } from "./SyncService";

export class SyncInternalChangeEvent {

    private app: App;
    private plugin: MarkdownHijacker;
    private syncService: SyncService;

    constructor(app: App, plugin: MarkdownHijacker){
        this.app = app;
        this.plugin = plugin;
        this.syncService = new SyncService(app, plugin);
    }
    
    public async handleUserChangeMd(path: string, connection: FolderConnectionSettings){
        console.log(`[SyncInternalChangeEvent] handleUserChangeMd: ${path}`);

        const isFrontmatterValid = this.syncService.isFrontmatterValid(path, connection);
        if(!isFrontmatterValid){
            const frontmatter = this.syncService.generateFrontmatter(path, connection, false);
            await this.syncService.updateInternalFileFrontmatter(path, frontmatter, connection);
        }

        /* Internal File 업데이트 */
        await this.syncService.syncFileToExternal(path, connection);
        return;
    }

    public async handleUserChangeNotMd(path: string, connection: FolderConnectionSettings){
        await this.syncService.syncFileToExternal(path, connection);
    }

    /* System Change 처리 불필요 */
    public async handleSystemChangeMd(path: string, connection: FolderConnectionSettings){
        return;
    }

    public async handleSystemChangeNotMd(path: string, connection: FolderConnectionSettings){
        return;
    }
}   