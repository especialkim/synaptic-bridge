import MarkdownHijacker from "main";
import { App } from "obsidian";
import { FolderConnectionSettings } from "reSrc/settings/types";
import { SyncService } from "./SyncService";

export class SyncExternalAddEvent {

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
    
    /* Add File */
    public async handleUserAddFile(path: string) {
        console.log(`[SyncExternalAddEvent] handleUserAddFile: ${path}`);
        await this.syncService.syncFileToInternal(path);
    }

    public async handleUserAddMdBlank(path: string) {
        console.log(`[SyncExternalAddEvent] handleUserAddMdBlank: ${path}`);
        try {
            const frontmatter = this.syncService.generateFrontmatter(path);
            await this.syncService.updateExternalFileFrontmatter(path, frontmatter);
        } catch (error) {
            console.error(`Error generating frontmatter: ${error}`);
            return;
        }
    }

    public async handleUserAddMdContent(path: string) {
        console.log(`[SyncExternalAddEvent] handleUserAddMdContent: ${path}`);
        /* 1. 외부 파일에 frontmatter 추가 */
        try {
            const frontmatter = this.syncService.generateFrontmatter(path);
            await this.syncService.updateExternalFileFrontmatter(path, frontmatter);
        } catch (error) {
            console.error(`Error generating frontmatter: ${error}`);
            return;
        }
    }

    public async handleSystemAddFile(path: string) {
        return;
    }

    public async handleSystemAddMdBlank(path: string) {
        return;
    }

    public async handleSystemAddMdContent(path: string) {
        return;
    }

    /* Add Folder */
    public async handleAddFolder(path: string) {
        console.log(`[SyncExternalAddEvent] handleAddFolder: ${path}`);

        // 상대 경로 계산
        const relativePath = this.syncService.getRelativePath(path);
        const internalPath = this.syncService.getInternalPath(relativePath);
        
        try {
            // 내부 폴더 생성
            await this.app.vault.createFolder(internalPath);
            console.log(`Created internal folder: ${internalPath}`);
        } catch (error) {
            // 이미 폴더가 존재하는 경우 무시
            if (error.message.includes('Folder already exists')) {
                console.log(`Folder already exists: ${internalPath}`);
                return;
            }
            console.error(`Error creating folder: ${error}`);
        }
    }
}