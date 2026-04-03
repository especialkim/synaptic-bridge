import MarkdownHijacker from "main";
import { App } from "obsidian";
import { FolderConnectionSettings, FrontmatterPolicy } from "src/settings/types";

export class SyncInternalChangeEvent {

    private app: App;
    private plugin: MarkdownHijacker;

    constructor(app: App, plugin: MarkdownHijacker){
        this.app = app;
        this.plugin = plugin;
    }

    public async handleUserChangeMd(path: string, connection: FolderConnectionSettings){
        const policy = connection.frontmatterPolicy;
        const relativePath = this.plugin.syncService.getRelativePath(path, connection);

        // suppress 체크: Add에서 명시적 sync 호출 후 뒤따르는 Change 이벤트 skip
        const suppressed = this.plugin.syncService.isWriteSuppressed(connection.id, 'internal', relativePath);
        if (suppressed) {
            return;
        }

        if (policy === FrontmatterPolicy.none) {
            // FM 전부 skip, sync만
            await this.plugin.syncService.syncFileToExternal(path, connection);
        } else if (policy === FrontmatterPolicy.internalOnly) {
            // 내부 FM 검증+쓰기, sync
            const isFrontmatterValid = this.plugin.syncService.isFrontmatterValid(path, connection);
            if (!isFrontmatterValid) {
                const frontmatter = this.plugin.syncService.generateFrontmatter(path, connection, false);
                await this.plugin.syncService.updateInternalFileFrontmatter(path, frontmatter, connection);
            }
            await this.plugin.syncService.syncFileToExternal(path, connection);
        } else {
            // both: 현행 유지
            const isFrontmatterValid = this.plugin.syncService.isFrontmatterValid(path, connection);
            if (!isFrontmatterValid) {
                const frontmatter = this.plugin.syncService.generateFrontmatter(path, connection, false);
                await this.plugin.syncService.updateInternalFileFrontmatter(path, frontmatter, connection);
            }
            await this.plugin.syncService.syncFileToExternal(path, connection);
        }
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
