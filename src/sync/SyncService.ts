import MarkdownHijacker from "main";
import { App } from "obsidian";
import { FolderConnectionSettings } from "src/settings/types";
import * as pathModule from 'path';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import { SnapShotService } from "./SnapShotService";
import { getVaultName } from "./utils";
import matter from "gray-matter";

export class SyncService {
    private app: App;
    private plugin: MarkdownHijacker;
    private snapShotService: SnapShotService;

    constructor(app: App, plugin: MarkdownHijacker){
        this.app = app;
        this.plugin = plugin;
        this.snapShotService = new SnapShotService(app, plugin);
    }
    
    public async syncFileToInternal(path: string, connection: FolderConnectionSettings): Promise<void> {
        const relativePath = path.replace(connection.externalPath, '');
        const internalFilePath = this.getInternalPath(relativePath, connection);

        // 타입 단언을 사용하여 컴파일러 경고 해결
        const internalAbsolutePath = this.getInternalAbsolutePath(relativePath, connection);

        try {
            await this.ensureParentFolderExistsInObsidian(internalFilePath);
            fsSync.copyFileSync(path, internalAbsolutePath);
            console.log(`[SyncService: syncFileToInternal] Copied file to: ${internalAbsolutePath}`);

            const internalFileMtime = fsSync.statSync(internalAbsolutePath).mtime.getTime();
            fsSync.utimesSync(path, new Date(), new Date(internalFileMtime));

            console.log('[SyncService: syncFileToInternal] internalFileMtime: ', internalFileMtime);
            console.log('[SyncService: syncFileToInternal] externalFileMtime: ', fsSync.statSync(path).mtime.getTime());
        } catch (error) {
            console.error(`[SyncService: syncFileToInternal] Error copying file: ${error}`);
        }

        /* SnapShot */
        try {
            console.log(`[SyncService: syncFileToInternal] updateSnapshot: ${path}`);
            this.snapShotService.updateSnapshot(connection, path);
        } catch (error) {
            console.error(`[SyncService: syncFileToInternal] Error updating snapshot: ${error}`);
        }
    }

    public async syncFileToExternal(path: string, connection: FolderConnectionSettings): Promise<void> {
        const relativePath = path.replace(connection.internalPath, '');
        const externalFilePath = this.getExternalPath(relativePath, connection);
        const internalAbsolutePath = this.getInternalAbsolutePath(relativePath, connection);

        try {
            await this.ensureParentFolderExistsInExternal(externalFilePath);

            // 내부 파일을 외부 파일로 복사
            fsSync.copyFileSync(internalAbsolutePath, externalFilePath);
            console.log(`[SyncService: syncFileToExternal] Copied file to: ${externalFilePath}`);

            // 내부 파일의 mtime을 외부 파일에 동기화
            const internalFileMtime = fsSync.statSync(internalAbsolutePath).mtime;
            fsSync.utimesSync(externalFilePath, new Date(), internalFileMtime);

            console.log('[SyncService: syncFileToExternal] internalFileMtime: ', internalFileMtime.getTime());
            console.log('[SyncService: syncFileToExternal] externalFileMtime: ', fsSync.statSync(externalFilePath).mtime.getTime());
        } catch (error) {
            console.error(`[SyncService: syncFileToExternal] Error copying file: ${error}`);
        }

        // SnapShot
        try {
            console.log(`[SyncService: syncFileToExternal] updateSnapshot: ${externalFilePath}`);
            this.snapShotService.updateSnapshot(connection, externalFilePath);
        } catch (error) {
            console.error(`[SyncService: syncFileToExternal] Error updating snapshot: ${error}`);
        }
    }

    public generateFrontmatter(path: string, connection: FolderConnectionSettings, isUnlinked: boolean = false): any {

        const relativePath = this.getRelativePath(path, connection);
        const internalPath = this.getInternalPath(relativePath, connection);
        const externalPath = this.getExternalPath(relativePath, connection);

        return {
            externalRoot: connection.externalPath,
            internalRoot: connection.internalPath,
            relativePath: relativePath,
            internalLink: `obsidian://open?vault=${getVaultName(this.app)}&file=${encodeURIComponent(internalPath)}`,
            externalLink: `file://${externalPath}`,
            isUnlinked: isUnlinked,
            syncType: connection.syncType,
            bidirectionalType: connection.bidirectionalType,
            deletedFileAction: connection.deletedFileAction,
        };
    }

    public async updateInternalFileFrontmatter(path: string, frontmatter: any, connection: FolderConnectionSettings): Promise<void> {
        try {
            console.log('[updateInternalFileFrontmatter] 입력 path:', path);
            console.log('[updateInternalFileFrontmatter] frontmatter:', frontmatter);
            const relativePath = this.getRelativePath(path, connection);
            const internalAbsolutePath = this.getInternalAbsolutePath(relativePath, connection);
            console.log('[updateInternalFileFrontmatter] internalAbsolutePath:', internalAbsolutePath);
            await this.updateExternalFileFrontmatter(internalAbsolutePath, frontmatter, connection);
        } catch(error) {
            console.error(`Error updating internal file frontmatter: ${error}`);
        }
    }

    public async updateExternalFileFrontmatter(path: string, frontmatter: any, connection: FolderConnectionSettings): Promise<void> {
        try {
            console.log('[updateExternalFileFrontmatter] 입력 path:', path);
            console.log('[updateExternalFileFrontmatter] frontmatter:', frontmatter);
            const originalContent = fsSync.readFileSync(path, 'utf8');
            const { data, content } = this.readFrontmatterAndContent(path);
            const mergedFrontmatter = { ...data, ...frontmatter };
            const updatedContent = matter.stringify(content, mergedFrontmatter);
            if (originalContent !== updatedContent) {
                fsSync.writeFileSync(path, updatedContent);
                console.log('[updateExternalFileFrontmatter] 파일 업데이트 완료:', path);
            } else {
                console.log('[updateExternalFileFrontmatter] 변경사항 없음:', path);
            }
        } catch (error) {
            console.error(`Error updating frontmatter: ${error}`);
        }
    }

    public getRelativePath(path: string, connection: FolderConnectionSettings): string {
        return path
            .replace(connection.externalPath, '')
            .replace(connection.internalPath, '')
    }

    public getInternalPath(path: string, connection: FolderConnectionSettings): string {
        const relativePath = this.getRelativePath(path, connection);
        const cleanRelativePath = relativePath.startsWith('/') ? relativePath.substring(1) : relativePath;
        return `${connection.internalPath}/${cleanRelativePath}`;
    }

    public getExternalPath(path: string, connection: FolderConnectionSettings): string {
        const relativePath = this.getRelativePath(path, connection);
        const cleanRelativePath = relativePath.startsWith('/') ? relativePath.substring(1) : relativePath;
        return `${connection.externalPath}/${cleanRelativePath}`;
    }

    public getInternalAbsolutePath(relativePath: string, connection: FolderConnectionSettings): string {
        const internalPath = this.getInternalPath(relativePath, connection);
        return (this.app.vault.adapter as any).getBasePath() + '/' + internalPath;
    }

    public async deleteFileActionPropertyOnExternal(path: string, connection: FolderConnectionSettings, isMarkdown: boolean = true) {
        let relativePath = this.getRelativePath(path, connection);
        const internalAbsolutePath = this.getInternalAbsolutePath(relativePath, connection);
        await this.deleteFileActionPropertyCore(internalAbsolutePath, relativePath, connection, isMarkdown);
    }
    
    public async deleteFileActionPropertyOnInternal(path: string, connection: FolderConnectionSettings, isMarkdown: boolean = true) {
        let relativePath = this.getRelativePath(path, connection);
        const externalPath = this.getExternalPath(relativePath, connection);
        await this.deleteFileActionPropertyCore(externalPath, relativePath, connection, isMarkdown);
    }

    private async deleteFileActionPropertyCore(
        targetPath: string,
        relativePath: string,
        connection: FolderConnectionSettings,
        isMarkdown: boolean = true
    ) {
        let newTargetPath = targetPath;
        let newRelativePath = relativePath;
    
        if (fsSync.existsSync(targetPath)) {
            const baseName = pathModule.basename(targetPath);
            const newFileName = baseName.startsWith('❌ ') ? baseName : `❌ ${baseName}`;
            newTargetPath = pathModule.join(pathModule.dirname(targetPath), newFileName);
    
            fsSync.renameSync(targetPath, newTargetPath);
    
            // relativePath의 파일명 앞에 '❌ '가 추가된 형태로 갱신
            const relativeDir = pathModule.dirname(relativePath);
            const relativeBase = pathModule.basename(relativePath);
            const newRelativeBase = relativeBase.startsWith('❌ ') ? relativeBase : `❌ ${relativeBase}`;
            newRelativePath = relativeDir === '.' ? newRelativeBase : pathModule.join(relativeDir, newRelativeBase);
    
            // frontmatter 업데이트 (마크다운 파일인 경우만)
            if (isMarkdown) {
                const frontmatter = this.generateFrontmatter(newRelativePath, connection, true);
                await this.updateExternalFileFrontmatter(newTargetPath, frontmatter, connection);
            }
        }
        this.snapShotService.deleteSnapShot(connection, relativePath);
        this.snapShotService.deleteSnapShot(connection, newRelativePath);
    }

    public async deleteFileActionDeleteOnExternal(path: string, connection: FolderConnectionSettings) {
        let relativePath = this.getRelativePath(path, connection);
        const internalAbsolutePath = this.getInternalAbsolutePath(relativePath, connection);
        if (fsSync.existsSync(internalAbsolutePath)) {
            fsSync.unlinkSync(internalAbsolutePath);
        }
        // 스냅샷 업데이트
        this.snapShotService.deleteSnapShot(connection, relativePath);
    }

    public async deleteFileActionDeleteOnInternal(path: string, connection: FolderConnectionSettings) {
        let relativePath = this.getRelativePath(path, connection);
        const externalPath = this.getExternalPath(relativePath, connection);
        if (fsSync.existsSync(externalPath)) {
            fsSync.unlinkSync(externalPath);
        }
        // 스냅샷 업데이트
        this.snapShotService.deleteSnapShot(connection, relativePath);
    }

    public async deleteFolderActionPropertyOnExternal(path: string, connection: FolderConnectionSettings) {
        /* 경로 계산 */
        const relativePath = this.getRelativePath(path, connection);
        const internalPath = this.getInternalPath(relativePath, connection);
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

    public async deleteFolderActionPropertyOnInternal(path: string, connection: FolderConnectionSettings) {
        // 외부 폴더 경로 계산
        const relativePath = this.getRelativePath(path, connection);
        const externalFolderPath = this.getExternalPath(relativePath, connection);
    
        // 폴더 존재 여부 확인
        if (fsSync.existsSync(externalFolderPath)) {
            const baseName = pathModule.basename(externalFolderPath);
            const newFolderName = baseName.startsWith('❌ ') ? baseName : `❌ ${baseName}`;
            const newExternalFolderPath = pathModule.join(pathModule.dirname(externalFolderPath), newFolderName);
    
            try {
                await fs.rename(externalFolderPath, newExternalFolderPath);
                console.log(`Renamed external folder: ${externalFolderPath} -> ${newExternalFolderPath}`);
            } catch (error) {
                console.error(`Error renaming external folder: ${error}`);
            }
        }
        // (폴더 스냅샷 삭제 등은 필요시 추가)
    }

    public async deleteFolderActionDeleteOnExternal(path: string, connection: FolderConnectionSettings) {
        /* 경로 계산 */
        const relativePath = this.getRelativePath(path, connection);
        const internalPath = this.getInternalPath(relativePath, connection);
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

    public async deleteFolderActionDeleteOnInternal(path: string, connection: FolderConnectionSettings) {
        // 외부 폴더 경로 계산
        const relativePath = this.getRelativePath(path, connection);
        const externalFolderPath = this.getExternalPath(relativePath, connection);
    
        // 폴더 존재 여부 확인
        if (fsSync.existsSync(externalFolderPath)) {
            try {
                // fs.rm (Node 14.14+) 또는 fs.rmdir (구버전) 사용
                await fs.rm(externalFolderPath, { recursive: true, force: true });
                console.log(`Deleted external folder: ${externalFolderPath}`);
            } catch (error) {
                console.error(`Error deleting external folder: ${error}`);
            }
        }
        // (폴더 스냅샷 삭제 등은 필요시 추가)
    }

    public isFrontmatterValid(path: string, connection: FolderConnectionSettings): boolean {
        console.log(`[SyncService: isFrontmatterValid] generating frontmatter`);
        const toUpdateFrontmatterData = this.generateFrontmatter(path, connection, false) as Record<string, any>;
        console.log(`[SyncService: isFrontmatterValid] toUpdateFrontmatterData: ${JSON.stringify(toUpdateFrontmatterData, null, 2)}`);
        if(path.includes(connection.internalPath)){
            path = this.getInternalAbsolutePath(path, connection);
        }
        console.log(`[SyncService: isFrontmatterValid] path: ${path}`);
        const { data: existFrontmatterRaw } = this.readFrontmatterAndContent(path);
        const existFrontmatter = existFrontmatterRaw as Record<string, any>;
        console.log(`[SyncService: isFrontmatterValid] existFrontmatter: ${JSON.stringify(existFrontmatter)}`);
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

    public async isSameFile(internalFilePath: string, externalFilePath: string) {
        if (!fsSync.existsSync(internalFilePath) || !fsSync.existsSync(externalFilePath)) {
            return false;
        }
        const internalContentMtime = fsSync.statSync(internalFilePath).mtime.getTime();
        const externalContentMtime = fsSync.statSync(externalFilePath).mtime.getTime();
        return internalContentMtime === externalContentMtime;
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

    private async ensureParentFolderExistsInExternal(externalFilePath: string): Promise<void> {
        const folderPath = pathModule.dirname(externalFilePath);
        if (!folderPath || folderPath === "." || folderPath === "/") return; // 루트면 종료
    
        try {
            await fs.access(folderPath);
            // 폴더가 이미 존재하면 종료
            return;
        } catch (error) {
            // 폴더가 없으면 상위 폴더부터 재귀적으로 생성
            const parentFolderPath = pathModule.dirname(folderPath);
            if (parentFolderPath && parentFolderPath !== folderPath) {
                await this.ensureParentFolderExistsInExternal(parentFolderPath);
            }
            try {
                await fs.mkdir(folderPath);
                console.log(`Created external folder: ${folderPath}`);
            } catch (mkdirError: any) {
                // 이미 존재하는 경우 무시
                if ((mkdirError as any).code !== "EEXIST") {
                    throw mkdirError;
                }
            }
        }
    }

    private readFrontmatterAndContent(path: string): { data: any; content: string } {
        const content = fsSync.readFileSync(path, 'utf8');
        const { data } = matter(content);
        return { data, content };
    }
}