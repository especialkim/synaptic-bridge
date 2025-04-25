import MarkdownHijacker from "main";
import { App } from "obsidian";
import { FolderConnectionSettings } from "src/settings/types";
import { SyncService } from "./SyncService";

export class SyncExternalAddEvent {

    private app: App;
    private plugin: MarkdownHijacker;
    private connection: FolderConnectionSettings;

    constructor(app: App, plugin: MarkdownHijacker, connection: FolderConnectionSettings) {
        this.app = app;
        this.plugin = plugin;
        this.connection = connection;
    }
    
    /* Add File */
    public async handleUserAddFile(path: string) {
        await this.plugin.syncService.syncFileToInternal(path, this.connection);
    }

    public async handleUserAddMdBlank(path: string) {
        try {
            const frontmatter = this.plugin.syncService.generateFrontmatter(path, this.connection);
            await this.plugin.syncService.updateExternalFileFrontmatter(path, frontmatter, this.connection);
        } catch (error) {
            console.error(`Error generating frontmatter: ${error}`);
            return;
        }
    }

    public async handleUserAddMdContent(path: string) {
        /* 1. 외부 파일에 frontmatter 추가 */
        try {
            const frontmatter = this.plugin.syncService.generateFrontmatter(path, this.connection);
            await this.plugin.syncService.updateExternalFileFrontmatter(path, frontmatter, this.connection);
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

        // 상대 경로 계산
        const relativePath = this.plugin.syncService.getRelativePath(path, this.connection);
        const internalPath = this.plugin.syncService.getInternalPath(relativePath, this.connection);
        
        try {
            // 내부 폴더 생성
            await this.app.vault.createFolder(internalPath);
        } catch (error) {
            // 이미 폴더가 존재하는 경우 무시
            if (error.message.includes('Folder already exists')) {
                return;
            }
            console.error(`Error creating folder: ${error}`);
        }
    }
}