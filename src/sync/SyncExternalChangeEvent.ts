import MarkdownHijacker from "main";
import { App } from "obsidian";
import { FolderConnectionSettings, FrontmatterPolicy } from "src/settings/types";
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
        const policy = this.connection.frontmatterPolicy;
        const relativePath = this.plugin.syncService.getRelativePath(path, this.connection);

        // suppress 체크: Add에서 명시적 sync 호출 후 뒤따르는 Change 이벤트 skip
        const suppressed = this.plugin.syncService.isWriteSuppressed(this.connection.id, 'external', relativePath);
        if (suppressed) {
            return;
        }

        if (policy === FrontmatterPolicy.none) {
            // FM 전부 skip, sync만
            await this.plugin.syncService.syncFileToInternal(path, this.connection);
        } else if (policy === FrontmatterPolicy.internalOnly) {
            // 외부 FM skip. 내부 FM reapply는 syncFileToInternal 내부에서 처리
            await this.plugin.syncService.syncFileToInternal(path, this.connection);
        } else {
            // both: 현행 유지
            const isFrontmatterValid = this.plugin.syncService.isFrontmatterValid(path, this.connection);
            if (!isFrontmatterValid) {
                const frontmatter = this.plugin.syncService.generateFrontmatter(path, this.connection, false);
                await this.plugin.syncService.updateExternalFileFrontmatter(path, frontmatter, this.connection);
            }
            await this.plugin.syncService.syncFileToInternal(path, this.connection);
        }
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
