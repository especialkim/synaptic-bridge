import MarkdownHijacker from "main";
import { App, FileSystemAdapter, TFile, TFolder } from "obsidian";
import { FolderConnectionSettings, FrontmatterPolicy } from "src/settings/types";
import * as pathModule from 'path';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import { getVaultName } from "./utils";
import matter from "gray-matter";
import { Frontmatter } from "./types/frontmatter";
import { normalizePath, pathStartsWith, getRelativePathFromBase } from "src/utils/pathUtils";

export class SyncService {
    private app: App;
    private plugin: MarkdownHijacker;
    private writeSuppressSet: Set<string> = new Set();

    constructor(app: App, plugin: MarkdownHijacker){
        this.app = app;
        this.plugin = plugin;
    }

    public suppressWrite(connectionId: string, direction: 'external' | 'internal', relativePath: string): void {
        this.writeSuppressSet.add(`${connectionId}::${direction}::${relativePath}`);
    }

    public isWriteSuppressed(connectionId: string, direction: 'external' | 'internal', relativePath: string): boolean {
        const key = `${connectionId}::${direction}::${relativePath}`;
        if (this.writeSuppressSet.has(key)) {
            this.writeSuppressSet.delete(key);
            return true;
        }
        return false;
    }

    public async syncFileToInternal(path: string, connection: FolderConnectionSettings): Promise<void> {
        const relativePath = this.getRelativePath(path, connection);
        const internalFilePath = this.getInternalPath(relativePath, connection);

        // 타입 단언을 사용하여 컴파일러 경고 해결
        const internalAbsolutePath = this.getInternalAbsolutePath(relativePath, connection);

        try {
            await this.ensureParentFolderExistsInObsidian(internalFilePath);
            fsSync.copyFileSync(path, internalAbsolutePath);

            // policy가 internalOnly이고 md 파일이면 bridge FM reapply
            if (connection.frontmatterPolicy === FrontmatterPolicy.internalOnly && path.endsWith('.md')) {
                const frontmatter = this.generateFrontmatter(relativePath, connection);
                await this.updateExternalFileFrontmatter(internalAbsolutePath, frontmatter, connection);
                this.suppressWrite(connection.id, 'internal', relativePath);
            }

            const internalFileMtime = fsSync.statSync(internalAbsolutePath).mtime.getTime();
            fsSync.utimesSync(path, new Date(), new Date(internalFileMtime));

        } catch (error) {
            console.error(`[SyncService: syncFileToInternal] Error copying file: ${error}`);
        }

        /* SnapShot */
        try {
            this.plugin.snapShotService.updateSnapshot(connection, path);
        } catch (error) {
            console.error(`[SyncService: syncFileToInternal] Error updating snapshot: ${error}`);
        }
    }

    public async syncFileToExternal(path: string, connection: FolderConnectionSettings): Promise<void> {
        const relativePath = this.getRelativePath(path, connection);
        const externalFilePath = this.getExternalPath(relativePath, connection);
        const internalAbsolutePath = this.getInternalAbsolutePath(relativePath, connection);

        try {
            await this.ensureParentFolderExistsInExternal(externalFilePath);

            // policy가 internalOnly이고 md 파일이면 bridge FM을 strip해서 외부에 write
            if (connection.frontmatterPolicy === FrontmatterPolicy.internalOnly && path.endsWith('.md')) {
                const internalContent = fsSync.readFileSync(internalAbsolutePath, 'utf8');
                const strippedContent = this.stripBridgeFrontmatter(internalContent);
                fsSync.writeFileSync(externalFilePath, strippedContent);
                this.suppressWrite(connection.id, 'external', relativePath);
            } else {
                // 기존: 내부 파일을 외부 파일로 복사
                fsSync.copyFileSync(internalAbsolutePath, externalFilePath);
            }

            // 내부 파일의 mtime을 외부 파일에 동기화
            const internalFileMtime = fsSync.statSync(internalAbsolutePath).mtime;
            fsSync.utimesSync(externalFilePath, new Date(), internalFileMtime);

        } catch (error) {
            console.error(`[SyncService: syncFileToExternal] Error copying file: ${error}`);
        }

        // SnapShot
        try {
            this.plugin.snapShotService.updateSnapshot(connection, externalFilePath);
        } catch (error) {
            console.error(`[SyncService: syncFileToExternal] Error updating snapshot: ${error}`);
        }
    }

    public generateFrontmatter(path: string, connection: FolderConnectionSettings, isUnlinked: boolean = false): Frontmatter {

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
            const relativePath = this.getRelativePath(path, connection);
            const internalAbsolutePath = this.getInternalAbsolutePath(relativePath, connection);
            await this.updateExternalFileFrontmatter(internalAbsolutePath, frontmatter, connection);
        } catch(error) {
            console.error(`Error updating internal file frontmatter: ${error}`);
        }
    }

    public async updateExternalFileFrontmatter(path: string, frontmatter: any, connection: FolderConnectionSettings): Promise<void> {
        try {
            const originalContent = fsSync.readFileSync(path, 'utf8');
            const { data, content } = this.readFrontmatterAndContent(path);
            const mergedFrontmatter = { ...data, ...frontmatter };
            const updatedContent = matter.stringify(content, mergedFrontmatter);
            
            fsSync.writeFileSync(path, updatedContent);

            // if (originalContent !== updatedContent) {
            //     fsSync.writeFileSync(path, updatedContent);
            //     console.log('[updateExternalFileFrontmatter] 파일 업데이트 완료:', path);
            // } else {
            //     console.log('[updateExternalFileFrontmatter] 변경사항 없음:', path);
            // }
        } catch (error) {
            console.error(`Error updating frontmatter: ${error}`);
        }
    }

    public getRelativePath(path: string, connection: FolderConnectionSettings): string {
        const normalizedPath = normalizePath(path);

        // 외부 절대 경로인 경우 (Windows 대소문자 무시)
        if (pathStartsWith(path, connection.externalPath)) {
            return getRelativePathFromBase(path, connection.externalPath);
        }
        // 내부 상대 경로인 경우 (폴더 경로로 정확히 시작하는지 체크)
        if (pathStartsWith(path, connection.internalPath + '/')) {
            return getRelativePathFromBase(path, connection.internalPath);
        }
        // 이미 상대 경로인 경우 정규화해서 반환
        return normalizedPath;
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
        return (this.app.vault.adapter as FileSystemAdapter).getBasePath() + '/' + internalPath;
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
    
            // frontmatter 업데이트 (마크다운 파일인 경우만, 정책에 따라 gate)
            if (isMarkdown) {
                const policy = connection.frontmatterPolicy;
                // targetPath가 internal인지 external인지 판별
                const basePath = (this.app.vault.adapter as FileSystemAdapter).getBasePath();
                const internalRoot = `${basePath}/${connection.internalPath}`;
                const isInternal = pathStartsWith(targetPath, internalRoot);
                const shouldWriteFm = isInternal
                    ? (policy === FrontmatterPolicy.both || policy === FrontmatterPolicy.internalOnly)
                    : (policy === FrontmatterPolicy.both);

                if (shouldWriteFm) {
                    const frontmatter = this.generateFrontmatter(newRelativePath, connection, true);
                    await this.updateExternalFileFrontmatter(newTargetPath, frontmatter, connection);
                }
            }
        }
        this.plugin.snapShotService.deleteSnapShot(connection, relativePath);
        this.plugin.snapShotService.deleteSnapShot(connection, newRelativePath);
    }

    public async deleteFileActionDeleteOnExternal(path: string, connection: FolderConnectionSettings) {
        let relativePath = this.getRelativePath(path, connection);
        const internalAbsolutePath = this.getInternalAbsolutePath(relativePath, connection);
        if (fsSync.existsSync(internalAbsolutePath)) {
            fsSync.unlinkSync(internalAbsolutePath);
        }
        // 스냅샷 업데이트
        this.plugin.snapShotService.deleteSnapShot(connection, relativePath);
    }

    public async deleteFileActionDeleteOnInternal(path: string, connection: FolderConnectionSettings) {
        let relativePath = this.getRelativePath(path, connection);
        const externalPath = this.getExternalPath(relativePath, connection);
        if (fsSync.existsSync(externalPath)) {
            fsSync.unlinkSync(externalPath);
        }
        // 스냅샷 업데이트
        this.plugin.snapShotService.deleteSnapShot(connection, relativePath);
    }

    public async deleteFolderActionPropertyOnExternal(path: string, connection: FolderConnectionSettings) {
        /* 경로 계산 */
        const relativePath = this.getRelativePath(path, connection);
        const internalPath = this.getInternalPath(relativePath, connection);
        let internalFolder = this.app.vault.getFolderByPath(internalPath);

        /* 폴더가 없거나 비어있으면 바로 삭제 */
        if (!internalFolder || internalFolder.children.length === 0) {
            if (internalFolder) {
                await this.app.fileManager.trashFile(internalFolder);
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
            await this.app.fileManager.trashFile(internalFolder);
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
            } catch (error) {
                console.error(`Error deleting external folder: ${error}`);
            }
        }
        // (폴더 스냅샷 삭제 등은 필요시 추가)
    }

    public isFrontmatterValid(path: string, connection: FolderConnectionSettings): boolean {
        const toUpdateFrontmatterData = this.generateFrontmatter(path, connection, false) as Record<string, any>;
        // 내부 경로인지 확인 (includes 대신 pathStartsWith 사용하여 오탐 방지)
        if (pathStartsWith(path, connection.internalPath + '/') || path.startsWith(connection.internalPath + '/')) {
            path = this.getInternalAbsolutePath(path, connection);
        }

        // 파일이 존재하지 않으면 유효하지 않음
        if (!fsSync.existsSync(path)) {
            return false;
        }

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

    public stripBridgeFrontmatter(content: string): string {
        const BRIDGE_KEYS = [
            'externalRoot', 'internalRoot', 'relativePath',
            'internalLink', 'externalLink', 'isUnlinked',
            'syncType', 'bidirectionalType', 'deletedFileAction'
        ];

        const parsed = matter(content);
        const data = { ...parsed.data };
        let hadBridgeKey = false;

        for (const key of BRIDGE_KEYS) {
            if (key in data) {
                delete data[key];
                hadBridgeKey = true;
            }
        }

        if (!hadBridgeKey) return content;

        // 남은 키가 없으면 frontmatter 블록 자체 제거
        if (Object.keys(data).length === 0) {
            return parsed.content.startsWith('\n') ? parsed.content.substring(1) : parsed.content;
        }

        return matter.stringify(parsed.content, data);
    }

    public async cleanupFrontmatterForPolicyChange(
        connection: FolderConnectionSettings,
        oldPolicy: FrontmatterPolicy,
        newPolicy: FrontmatterPolicy
    ): Promise<void> {
        const basePath = (this.app.vault.adapter as FileSystemAdapter).getBasePath();
        const targetRelativePaths = this.collectCleanupTargetRelativePaths(connection);
        const shouldWriteInternal = newPolicy === FrontmatterPolicy.both || newPolicy === FrontmatterPolicy.internalOnly;
        const shouldWriteExternal = newPolicy === FrontmatterPolicy.both;
        const failedPaths: string[] = [];

        for (const relativePath of targetRelativePaths) {
            const cleanRelativePath = relativePath.startsWith('/') ? relativePath.substring(1) : relativePath;
            const internalAbsolutePath = `${basePath}/${connection.internalPath}/${cleanRelativePath}`;
            const externalAbsolutePath = `${connection.externalPath}/${cleanRelativePath}`;

            try {
                const internalExists = fsSync.existsSync(internalAbsolutePath);
                const externalExists = fsSync.existsSync(externalAbsolutePath);
                const isUnlinked = !(internalExists && externalExists);

                if (internalExists) {
                    if (shouldWriteInternal) {
                        const frontmatter = this.generateFrontmatter(relativePath, connection, isUnlinked);
                        this.updateFileFrontmatterPreservingMtime(internalAbsolutePath, frontmatter);
                    } else {
                        const content = fsSync.readFileSync(internalAbsolutePath, 'utf8');
                        const stripped = this.stripBridgeFrontmatter(content);
                        if (content !== stripped) {
                            this.writeFilePreservingMtime(internalAbsolutePath, stripped);
                        }
                    }
                }

                if (externalExists) {
                    if (shouldWriteExternal) {
                        const frontmatter = this.generateFrontmatter(relativePath, connection, isUnlinked);
                        this.updateFileFrontmatterPreservingMtime(externalAbsolutePath, frontmatter);
                    } else {
                        const content = fsSync.readFileSync(externalAbsolutePath, 'utf8');
                        const stripped = this.stripBridgeFrontmatter(content);
                        if (content !== stripped) {
                            this.writeFilePreservingMtime(externalAbsolutePath, stripped);
                        }
                    }
                }
            } catch (error) {
                console.error(`[SyncService: cleanupFrontmatter] Error processing ${relativePath}:`, error);
                failedPaths.push(relativePath);
            }
        }

        if (failedPaths.length > 0) {
            throw new Error(`Frontmatter cleanup failed for ${failedPaths.length} file(s): ${failedPaths.join(', ')}`);
        }
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

    private normalizeCleanupRelativePath(relativePath: string): string {
        const normalized = normalizePath(relativePath || '');
        if (!normalized) {
            return '/';
        }

        return normalized.startsWith('/') ? normalized : `/${normalized}`;
    }

    private matchCleanupPattern(filename: string, pattern: string): boolean {
        if (pattern.includes('*') || pattern.includes('?') || pattern.includes('[')) {
            const regexPattern = pattern
                .replace(/\./g, '\\.')
                .replace(/\*/g, '.*')
                .replace(/\?/g, '.')
                .replace(/\[([^\]]+)\]/g, '[$1]');

            return new RegExp(`^${regexPattern}$`, 'i').test(filename);
        }

        return filename.toLowerCase() === pattern.toLowerCase();
    }

    private getCleanupCandidateFileNames(filename: string): string[] {
        const stripped = filename.replace(/^❌\s*/, '');
        return Array.from(new Set([filename, stripped].filter(Boolean)));
    }

    private shouldSkipCleanupRelativePath(
        relativePath: string,
        connection: FolderConnectionSettings,
        isFile: boolean
    ): boolean {
        const normalized = this.normalizeCleanupRelativePath(relativePath).replace(/^\/+/, '');
        if (!normalized) {
            return false;
        }

        const parts = normalized.split('/').filter(Boolean).map(part => part.toLowerCase());
        const loweredExcludes = connection.excludeFolders.map(folder => folder.toLowerCase());
        const loweredIncludes = connection.includeFolders.map(folder => folder.toLowerCase());

        if (connection.ignoreHiddenFiles && parts.some(part => part.startsWith('.'))) {
            return true;
        }

        if (loweredExcludes.length > 0 && parts.some(part => loweredExcludes.includes(part))) {
            return true;
        }

        if (loweredIncludes.length > 0) {
            const allowed = parts.slice(0, 2);
            if (!allowed.some(part => loweredIncludes.includes(part))) {
                return true;
            }
        }

        if (!isFile) {
            return false;
        }

        const loweredExtensions = connection.extensions.map(ext => ext.replace(/^\./, '').toLowerCase());
        const filename = parts[parts.length - 1] || '';
        if (loweredExtensions.length > 0 && !loweredExtensions.some(ext => filename.endsWith(`.${ext}`))) {
            return true;
        }
        if (!filename.endsWith('.md')) {
            return true;
        }

        const candidateNames = this.getCleanupCandidateFileNames(filename);
        const includePatterns = connection.includeFileNames || [];
        const excludePatterns = connection.excludeFileNames || [];

        if (includePatterns.length > 0) {
            const matchesInclude = includePatterns.some(pattern =>
                candidateNames.some(candidate => this.matchCleanupPattern(candidate, pattern))
            );
            if (!matchesInclude) {
                return true;
            }
        }

        if (excludePatterns.length > 0) {
            const matchesExclude = excludePatterns.some(pattern =>
                candidateNames.some(candidate => this.matchCleanupPattern(candidate, pattern))
            );
            if (matchesExclude) {
                return true;
            }
        }

        return false;
    }

    private collectInternalCleanupRelativePaths(connection: FolderConnectionSettings): string[] {
        const internalRoot = this.app.vault.getFolderByPath(connection.internalPath);
        if (!internalRoot) {
            return [];
        }

        const collected = new Set<string>();
        const visit = (folder: TFolder) => {
            for (const child of folder.children) {
                const relativePath = this.normalizeCleanupRelativePath(this.getRelativePath(child.path, connection));

                if (child instanceof TFolder) {
                    if (this.shouldSkipCleanupRelativePath(relativePath, connection, false)) {
                        continue;
                    }
                    visit(child);
                    continue;
                }

                if (!(child instanceof TFile)) {
                    continue;
                }

                if (!this.shouldSkipCleanupRelativePath(relativePath, connection, true)) {
                    collected.add(relativePath);
                }
            }
        };

        visit(internalRoot);
        return [...collected];
    }

    private collectExternalCleanupRelativePaths(connection: FolderConnectionSettings): string[] {
        const collected = new Set<string>();

        const visit = (dirPath: string) => {
            if (!fsSync.existsSync(dirPath)) {
                return;
            }

            for (const entry of fsSync.readdirSync(dirPath, { withFileTypes: true })) {
                const fullPath = pathModule.join(dirPath, entry.name);
                const relativePath = this.normalizeCleanupRelativePath(this.getRelativePath(fullPath, connection));

                if (entry.isDirectory()) {
                    if (this.shouldSkipCleanupRelativePath(relativePath, connection, false)) {
                        continue;
                    }
                    visit(fullPath);
                    continue;
                }

                if (entry.isFile() && !this.shouldSkipCleanupRelativePath(relativePath, connection, true)) {
                    collected.add(relativePath);
                }
            }
        };

        visit(connection.externalPath);
        return [...collected];
    }

    private collectCleanupTargetRelativePaths(connection: FolderConnectionSettings): string[] {
        const snapshot = this.plugin.snapShotService.loadSnapshot(connection);
        const collected = new Set<string>();

        for (const file of [...snapshot.linkedFiles, ...snapshot.unLinkedFiles]) {
            if (file.relativePath.endsWith('.md')) {
                collected.add(this.normalizeCleanupRelativePath(file.relativePath));
            }
        }

        for (const relativePath of this.collectInternalCleanupRelativePaths(connection)) {
            collected.add(relativePath);
        }

        for (const relativePath of this.collectExternalCleanupRelativePaths(connection)) {
            collected.add(relativePath);
        }

        return [...collected];
    }

    private writeFilePreservingMtime(filePath: string, content: string): void {
        const fileStat = fsSync.statSync(filePath);
        fsSync.writeFileSync(filePath, content);
        fsSync.utimesSync(filePath, fileStat.atime, fileStat.mtime);
    }

    private updateFileFrontmatterPreservingMtime(filePath: string, frontmatter: Record<string, any>): void {
        const originalContent = fsSync.readFileSync(filePath, 'utf8');
        const { data, content } = this.readFrontmatterAndContent(filePath);
        const mergedFrontmatter = { ...data, ...frontmatter };
        const updatedContent = matter.stringify(content, mergedFrontmatter);

        if (originalContent === updatedContent) {
            return;
        }

        this.writeFilePreservingMtime(filePath, updatedContent);
    }

    private async ensureParentFolderExistsInObsidian(obsidianPath: string): Promise<void> {
        const folderPath = obsidianPath.substring(0, obsidianPath.lastIndexOf('/'));
        if (!folderPath) return; // 루트 경로인 경우
        
        const folder = this.app.vault.getFolderByPath(folderPath);
        if (!folder) {
            // 폴더가 없으면 생성
            try {
                await this.app.vault.createFolder(folderPath);
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
            } catch (mkdirError) {
                if (isNodeError(mkdirError) && mkdirError.code !== "EEXIST") {
                    throw mkdirError;
                }
            }
        }
    }

    private readFrontmatterAndContent(path: string): { data: any; content: string } {
        const fileContent = fsSync.readFileSync(path, 'utf8');
        const parsed = matter(fileContent);
        return { data: parsed.data, content: parsed.content };
    }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
    return typeof error === 'object' && error !== null && 'code' in error;
}
