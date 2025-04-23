import MarkdownHijacker from "main";
import { App } from "obsidian";
import { FolderConnectionSettings } from "reSrc/settings/types";
import { SyncService } from "./SyncService";

export class SyncExternalChangeEvent {

    private app: App;
    private plugin: MarkdownHijacker;
    private connection: FolderConnectionSettings;
    private syncService: SyncService;

    constructor(app: App, plugin: MarkdownHijacker, connection: FolderConnectionSettings) {
        this.app = app;
        this.plugin = plugin;
        this.connection = connection;
        this.syncService = new SyncService(app, plugin, connection);
    }

    public async handleUserChangeMd(path: string){
        
        const isFrontmatterValid = this.syncService.isFrontmatterValid(path);
        if(!isFrontmatterValid){
            const frontmatter = this.syncService.generateFrontmatter(path, false);
            await this.syncService.updateExternalFileFrontmatter(path, frontmatter);
        }

        /* Internal File 업데이트 */
        await this.syncService.syncFileToInternal(path);
        return;
    }

    public async handleUserChangeNotMd(path: string){
        await this.syncService.syncFileToInternal(path);
    }

    public async handleSystemChangeMd(path: string){
        return;
    }

    public async handleSystemChangeNotMd(path: string){
        return;
    }
}