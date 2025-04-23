import MarkdownHijacker from "main";
import { App } from "obsidian";
import { FolderConnectionSettings } from "reSrc/settings/types";
import * as pathModule from 'path';
import * as fs from 'fs';
import { SnapShotService } from "./SnapShotService";
import { getVaultName } from "./utils";
import matter from "gray-matter";

export class SyncService {
    private app: App;
    private plugin: MarkdownHijacker;
    private connection: FolderConnectionSettings;
    private snapShotService: SnapShotService;

    constructor(app: App, plugin: MarkdownHijacker, connection: FolderConnectionSettings){
        this.app = app;
        this.plugin = plugin;
        this.connection = connection;
        this.snapShotService = new SnapShotService(app, plugin, connection);
    }
    
    public async syncFileToInternal(path: string): Promise<void> {
        const relativePath = path.replace(this.connection.externalPath, '');
        const internalFilePath = this.getInternalPath(relativePath);

        // 타입 단언을 사용하여 컴파일러 경고 해결
        const adapter = this.plugin.app.vault.adapter as any;
        const internalAbsolutePath = pathModule.join(adapter.basePath, internalFilePath);

        try {
            await this.ensureParentFolderExistsInObsidian(internalFilePath);
            fs.copyFileSync(path, internalAbsolutePath);
            console.log(`[SyncService: syncFileToInternal] Copied file to: ${internalAbsolutePath}`);

            const internalFileMtime = fs.statSync(internalAbsolutePath).mtime.getTime();
            fs.utimesSync(path, new Date(), new Date(internalFileMtime));

            console.log('[SyncService: syncFileToInternal] internalFileMtime: ', internalFileMtime);
            console.log('[SyncService: syncFileToInternal] externalFileMtime: ', fs.statSync(path).mtime.getTime());
        } catch (error) {
            console.error(`[SyncService: syncFileToInternal] Error copying file: ${error}`);
        }

        /* SnapShot */
        try {
            console.log(`[SyncService: syncFileToInternal] updateSnapshot: ${path}`);
            this.snapShotService.updateSnapshot(this.connection, path);
        } catch (error) {
            console.error(`[SyncService: syncFileToInternal] Error updating snapshot: ${error}`);
        }
    }

    public generateFrontmatter(path: string, isUnlinked: boolean = false): any {

        const relativePath = this.getRelativePath(path);
        const internalPath = this.getInternalPath(path);
        console.log('[SyncService: generateFrontmatter] internalPath: ', internalPath);

        return {
            externalRoot: this.connection.externalPath,
            internalRoot: this.connection.internalPath,
            relativePath: relativePath,
            internalLink: `obsidian://open?vault=${getVaultName(this.app)}&file=${encodeURIComponent(internalPath)}`,
            externalLink: `file://${path}`,
            isUnlinked: isUnlinked,
            syncType: this.connection.syncType,
            bidirectionalType: this.connection.bidirectionalType,
            deletedFileAction: this.connection.deletedFileAction,
        };
    }

    public async updateExternalFileFrontmatter(path: string, frontmatter: any): Promise<void> {
        try {
            const originalContent = fs.readFileSync(path, 'utf8');
            const { data, content } = this.readFrontmatterAndContent(path);
            const mergedFrontmatter = { ...data, ...frontmatter };
            const updatedContent = matter.stringify(content, mergedFrontmatter);
            if (originalContent !== updatedContent) {
                fs.writeFileSync(path, updatedContent);
            }
        } catch (error) {
            console.error(`Error updating frontmatter: ${error}`);
        }
    }

    public getRelativePath(path: string): string {
        return path
            .replace(this.connection.externalPath, '')
            .replace(this.connection.internalPath, '')
    }

    public getInternalPath(path: string): string {
        const relativePath = this.getRelativePath(path);
        const cleanRelativePath = relativePath.startsWith('/') ? relativePath.substring(1) : relativePath;
        return `${this.connection.internalPath}/${cleanRelativePath}`;
    }

    public getInternalAbsolutePath(relativePath: string): string {
        const internalPath = this.getInternalPath(relativePath);
        return (this.app.vault.adapter as any).getBasePath() + '/' + internalPath;
    }

    public async deleteFileActionProperty(path: string, isMarkdown: boolean = true) {
        /* 경로 계산 */
        let relativePath = this.getRelativePath(path);
        const internalAbsolutePath = this.getInternalAbsolutePath(relativePath);
        let newInternalAbsolutePath = internalAbsolutePath;
        let newRelativePath = relativePath;

        /* 파일 존재 여부 확인 및 파일명 변경 */
        if (fs.existsSync(internalAbsolutePath)) {
            const baseName = pathModule.basename(internalAbsolutePath);
            const newFileName = baseName.startsWith('❌ ') ? baseName : `❌ ${baseName}`;
            newInternalAbsolutePath = pathModule.join(pathModule.dirname(internalAbsolutePath), newFileName);
            fs.renameSync(internalAbsolutePath, newInternalAbsolutePath);
            // relativePath의 파일명 앞에 '❌ '가 추가된 형태로 갱신
            const relativeDir = pathModule.dirname(relativePath);
            const relativeBase = pathModule.basename(relativePath);
            const newRelativeBase = relativeBase.startsWith('❌ ') ? relativeBase : `❌ ${relativeBase}`;
            newRelativePath = relativeDir === '.' ? newRelativeBase : pathModule.join(relativeDir, newRelativeBase);

            /* frontmatter 업데이트 (마크다운 파일인 경우만) */
            if (isMarkdown) {
                const frontmatter = this.generateFrontmatter(newRelativePath, true);
                await this.updateExternalFileFrontmatter(newInternalAbsolutePath, frontmatter);
            }
        }

        /* 스냅샷 삭제 */
        this.snapShotService.deleteSnapShot(this.connection, newRelativePath);
    }

    public async deleteFileActionDelete(path: string) {
        let relativePath = this.getRelativePath(path);
        const internalAbsolutePath = this.getInternalAbsolutePath(relativePath);
        if (fs.existsSync(internalAbsolutePath)) {
            fs.unlinkSync(internalAbsolutePath);
        }
        // 스냅샷 업데이트
        this.snapShotService.deleteSnapShot(this.connection, relativePath);
    }

    public async deleteFolderActionProperty(path: string) {
        /* 경로 계산 */
        const relativePath = this.getRelativePath(path);
        const internalPath = this.getInternalPath(relativePath);
        let internalFolder = this.app.vault.getFolderByPath(internalPath);

        /* 폴더가 없거나 비어있으면 바로 삭제 */
        if (!internalFolder || internalFolder.children.length === 0) {
            if (internalFolder) {
                await this.app.vault.delete(internalFolder, true);
            }
            return;
        }

        /* 폴더 내부 파일/폴더가 모두 '❌ '로 시작할 때까지 polling (최대 20회, 100ms 간격) */
        let retry = 0;
        let allChildrenRenamed = false;
        while (internalFolder && retry < 20) {
            const children = internalFolder.children;
            const notRenamed = children.filter(c => !c.name.startsWith('❌ '));
            if (notRenamed.length === 0) {
                allChildrenRenamed = true;
                break;
            }
            await new Promise(res => setTimeout(res, 100));
            internalFolder = this.app.vault.getFolderByPath(internalPath);
            retry++;
        }

        /* 폴더명 앞에 '❌ ' prefix 추가 */
        if (internalFolder && allChildrenRenamed) {
            const folderName = internalFolder.name;
            if (!folderName.startsWith('❌ ')) {
                const parentPath = internalFolder.parent ? internalFolder.parent.path : '';
                const newFolderName = `❌ ${folderName}`;
                const newFolderPath = parentPath ? `${parentPath}/${newFolderName}` : newFolderName;
                await this.app.fileManager.renameFile(internalFolder, newFolderPath);
            }
        }

        /* (선택) 스냅샷 삭제 : Folder는 Snapshot 없음 */
        // this.snapShotService.deleteSnapShot(this.connection, ...); // 필요시 구현
    }

    public async deleteFolderActionDelete(path: string) {
        /* 경로 계산 */
        const relativePath = this.getRelativePath(path);
        const internalPath = this.getInternalPath(relativePath);
        let internalFolder = this.app.vault.getFolderByPath(internalPath);

        /* 하위 파일/폴더가 모두 삭제될 때까지 polling (최대 20회, 100ms 간격) */
        let retry = 0;
        while (internalFolder && internalFolder.children.length > 0 && retry < 20) {
            await new Promise(res => setTimeout(res, 100));
            internalFolder = this.app.vault.getFolderByPath(internalPath);
            retry++;
        }

        /* 폴더 삭제 */
        if (internalFolder && internalFolder.children.length === 0) {
            await this.app.vault.delete(internalFolder, true);
        }

        /* (선택) 스냅샷 삭제 : Folder는 Snapshot 없음 */
        // this.snapShotService.deleteSnapShot(this.connection, ...); // 필요시 구현
    }

    public isFrontmatterValid(path: string): boolean {
        const toUpdateFrontmatterData = this.generateFrontmatter(path, false) as Record<string, any>;
        const { data: existFrontmatterRaw } = this.readFrontmatterAndContent(path);
        const existFrontmatter = existFrontmatterRaw as Record<string, any>;

        for (const key of Object.keys(toUpdateFrontmatterData)) {
            if (!(key in existFrontmatter)) return false;
            const a = toUpdateFrontmatterData[key];
            const b = existFrontmatter[key];
            if (typeof a === 'object' && a !== null) {
                if (JSON.stringify(a) !== JSON.stringify(b)) return false;
            } else {
                if (a !== b) return false;
            }
        }
        return true;
    }

    /* Private Method */

    private async ensureParentFolderExistsInObsidian(obsidianPath: string): Promise<void> {
        const folderPath = obsidianPath.substring(0, obsidianPath.lastIndexOf('/'));
        if (!folderPath) return; // 루트 경로인 경우
        
        const folder = this.app.vault.getFolderByPath(folderPath);
        if (!folder) {
            // 폴더가 없으면 생성
            try {
                await this.app.vault.createFolder(folderPath);
                console.log(`Created folder: ${folderPath}`);
            } catch (error) {
                // 이미 존재하거나 상위 폴더가 없는 경우
                if (error.message.includes('Folder already exists')) {
                    return; // 이미 존재하면 무시
                }
                
                // 상위 폴더들을 재귀적으로 생성
                const parentFolderPath = folderPath.substring(0, folderPath.lastIndexOf('/'));
                if (parentFolderPath) {
                    await this.ensureParentFolderExistsInObsidian(parentFolderPath);
                    await this.app.vault.createFolder(folderPath);
                    console.log(`Created folder after creating parent: ${folderPath}`);
                }
            }
        }
    }

    private readFrontmatterAndContent(path: string): { data: any; content: string } {
        const content = fs.readFileSync(path, 'utf8');
        const { data } = matter(content);
        return { data, content };
    }
}