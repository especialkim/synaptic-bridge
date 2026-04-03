import MarkdownHijacker from "main";
import { App } from "obsidian";
import { FolderConnectionSettings, FrontmatterPolicy } from "src/settings/types";
import { SyncService } from "./SyncService";
import * as fs from 'fs/promises';
import * as pathModule from 'path';


export class SyncInternalAddEvent {

    private app: App;
    private plugin: MarkdownHijacker;

    constructor(app: App, plugin: MarkdownHijacker){
        this.app = app;
        this.plugin = plugin;
    }

    public async handleUserAddFile(path: string, connection: FolderConnectionSettings){
        await this.plugin.syncService.syncFileToExternal(path, connection);
    }

    public async handleUserAddMdBlank(path: string, connection: FolderConnectionSettings){
        const policy = connection.frontmatterPolicy;
        const relativePath = this.plugin.syncService.getRelativePath(path, connection);

        try {
            // 출발지(내부) FM 쓰기: both 또는 internalOnly일 때
            if (policy === FrontmatterPolicy.both || policy === FrontmatterPolicy.internalOnly) {
                const frontmatter = this.plugin.syncService.generateFrontmatter(path, connection);
                await this.plugin.syncService.updateInternalFileFrontmatter(path, frontmatter, connection);
                this.plugin.syncService.suppressWrite(connection.id, 'internal', relativePath);
            }

            // sync 호출 — 도착지(외부) FM은 syncFileToExternal 내부에서 처리
            await this.plugin.syncService.syncFileToExternal(path, connection);
        } catch (error) {
            console.error(`Error generating frontmatter: ${error}`);
            return;
        }
    }

    public async handleUserAddMdContent(path: string, connection: FolderConnectionSettings){
        const policy = connection.frontmatterPolicy;
        const relativePath = this.plugin.syncService.getRelativePath(path, connection);

        try {
            // 출발지(내부) FM 쓰기: both 또는 internalOnly일 때
            if (policy === FrontmatterPolicy.both || policy === FrontmatterPolicy.internalOnly) {
                const frontmatter = this.plugin.syncService.generateFrontmatter(path, connection);
                await this.plugin.syncService.updateInternalFileFrontmatter(path, frontmatter, connection);
                this.plugin.syncService.suppressWrite(connection.id, 'internal', relativePath);
            }

            // sync 호출 — 도착지(외부) FM은 syncFileToExternal 내부에서 처리
            await this.plugin.syncService.syncFileToExternal(path, connection);
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

        // 내부 경로를 외부 경로로 변환
        const relativePath = this.plugin.syncService.getRelativePath(path, connection);
        const externalPath = this.plugin.syncService.getExternalPath(relativePath, connection);

        try {
            await fs.mkdir(externalPath, { recursive: true });
        } catch (error) {
            if (this.isNodeError(error) && error.code === 'EEXIST') {
                return;
            }
        }
    }

    private isNodeError(error: unknown): error is NodeJS.ErrnoException {
        return typeof error === 'object' && error !== null && 'code' in error;
    }
}
