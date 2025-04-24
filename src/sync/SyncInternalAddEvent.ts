import MarkdownHijacker from "main";
import { App } from "obsidian";
import { FolderConnectionSettings } from "src/settings/types";
import { SyncService } from "./SyncService";
import * as fs from 'fs/promises';
import * as pathModule from 'path';


export class SyncInternalAddEvent {

    private app: App;
    private plugin: MarkdownHijacker;
    private syncService: SyncService;

    constructor(app: App, plugin: MarkdownHijacker){
        this.app = app;
        this.plugin = plugin;
        this.syncService = new SyncService(app, plugin);
    }

    public async handleUserAddFile(path: string, connection: FolderConnectionSettings){
        console.log(`[SyncInternalAddEvent] handleUserAddFile: ${path}`);
        await this.syncService.syncFileToExternal(path, connection);
    }

    public async handleUserAddMdBlank(path: string, connection: FolderConnectionSettings){
        console.log(`[SyncInternalAddEvent] handleUserAddMdBlank: ${path}`);

        try {
            const frontmatter = this.syncService.generateFrontmatter(path, connection);
            await this.syncService.updateInternalFileFrontmatter(path, frontmatter, connection);
        } catch (error) {
            console.error(`Error generating frontmatter: ${error}`);
            return;
        }
    }

    public async handleUserAddMdContent(path: string, connection: FolderConnectionSettings){
        console.log(`[SyncInternalAddEvent] handleUserAddMdContent: ${path}`);

        try {
            const frontmatter = this.syncService.generateFrontmatter(path, connection);
            await this.syncService.updateInternalFileFrontmatter(path, frontmatter, connection);
        } catch (error) {
            console.error(`Error generating frontmatter: ${error}`);
            return;
        }
    }

    /* System Event 처리 불필요 */
    public async handleSystemAddFile(path: string, connection: FolderConnectionSettings){
        return;
    }
    public async handleSystemAddMdBlank(path: string, connection: FolderConnectionSettings){
        return;
    }
    public async handleSystemAddMdContent(path: string, connection: FolderConnectionSettings){
        return;
    }

    /* Add Folder */
    public async handleAddFolder(path: string, connection: FolderConnectionSettings) {
        console.log(`[SyncInternalAddEvent] handleAddFolder: ${path}`);

        // 내부 경로를 외부 경로로 변환
        const relativePath = this.syncService.getRelativePath(path, connection);
        const externalPath = this.syncService.getExternalPath(relativePath, connection);

        try {
            // 외부 폴더 생성 (상위 폴더까지 재귀적으로 생성)
            await fs.mkdir(externalPath, { recursive: true });
            console.log(`Created external folder: ${externalPath}`);
        } catch (error: any) {
            // 이미 폴더가 존재하는 경우 무시
            if (error.code === 'EEXIST') {
                console.log(`Folder already exists: ${externalPath}`);
                return;
            }
            console.error(`Error creating external folder: ${error}`);
        }
    }
}