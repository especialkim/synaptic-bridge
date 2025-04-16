import { App, TFile, TFolder, normalizePath, Notice } from 'obsidian';
import * as fs from 'fs';
import * as path from 'path';
import { FolderMapping } from '../../settings';

export class SyncManager {
    private app: App;
    private debugMode: boolean;

    constructor(app: App, debugMode: boolean = false) {
        this.app = app;
        this.debugMode = debugMode;
        console.log('[SyncManager] 초기화됨');
    }

    /**
     * 외부 폴더에서 Vault로 초기 동기화를 수행합니다.
     */
    public async syncExternalToVault(mapping: FolderMapping): Promise<boolean> {
        try {
            console.log(`[SyncManager] 외부→Vault 동기화 시작: ${mapping.externalPath} → ${mapping.vaultPath}`);

            // 1. 외부 경로가 존재하는지 확인
            if (!fs.existsSync(mapping.externalPath)) {
                console.error(`[SyncManager] 외부 폴더가 존재하지 않습니다: ${mapping.externalPath}`);
                return false;
            }

            // 2. Vault 대상 폴더 확인 및 생성
            const vaultFolderPath = normalizePath(mapping.vaultPath);
            await this.ensureVaultFolder(vaultFolderPath);

            // 3. 외부 폴더 구조 스캔 후 동기화
            await this.scanAndSyncFolder(mapping.externalPath, vaultFolderPath);

            console.log(`[SyncManager] 외부→Vault 동기화 완료`);
            return true;
        } catch (error) {
            console.error(`[SyncManager] 동기화 오류: ${error}`);
            return false;
        }
    }

    /**
     * 폴더를 재귀적으로 스캔하고 Vault에 동기화합니다.
     */
    private async scanAndSyncFolder(externalFolderPath: string, vaultFolderPath: string): Promise<void> {
        // 폴더 내 모든 항목 읽기
        const items = fs.readdirSync(externalFolderPath);
        
        // Markdown 파일이 있는지 확인
        const hasMarkdownFiles = items.some(item => 
            fs.statSync(path.join(externalFolderPath, item)).isFile() && item.endsWith('.md')
        );

        // 각 항목 처리
        for (const item of items) {
            const itemPath = path.join(externalFolderPath, item);
            const stats = fs.statSync(itemPath);
            
            if (stats.isDirectory()) {
                // 하위 폴더 처리
                const subVaultPath = path.join(vaultFolderPath, item);
                await this.ensureVaultFolder(normalizePath(subVaultPath));
                await this.scanAndSyncFolder(itemPath, normalizePath(subVaultPath));
            } else if (stats.isFile() && item.endsWith('.md')) {
                // Markdown 파일 처리
                const vaultFilePath = normalizePath(path.join(vaultFolderPath, item));
                await this.syncMarkdownFile(itemPath, vaultFilePath);
            }
        }
    }

    /**
     * Markdown 파일을 Vault로 동기화합니다.
     */
    private async syncMarkdownFile(externalFilePath: string, vaultFilePath: string): Promise<void> {
        // 파일 내용 읽기
        let content = fs.readFileSync(externalFilePath, 'utf8');
        
        // frontmatter에 originalPath 추가
        content = this.ensureOriginalPathInFrontmatter(content, externalFilePath);
        
        // Vault에 파일 생성 또는 업데이트
        const existingFile = this.app.vault.getAbstractFileByPath(vaultFilePath);
        
        if (existingFile instanceof TFile) {
            // 기존 파일 업데이트
            await this.app.vault.modify(existingFile, content);
        } else {
            // 새 파일 생성
            await this.app.vault.create(vaultFilePath, content);
        }
    }

    /**
     * frontmatter에 originalPath를 추가합니다.
     */
    private ensureOriginalPathInFrontmatter(content: string, originalPath: string): string {
        const frontmatterRegex = /^---\n([\s\S]*?)\n---\n/;
        const frontmatterMatch = content.match(frontmatterRegex);
        
        const originalPathLine = `originalPath: "${originalPath.replace(/\\/g, '/')}"\n`;
        
        if (frontmatterMatch) {
            // 기존 frontmatter가 있는 경우
            const frontmatter = frontmatterMatch[1];
            
            if (frontmatter.includes('originalPath:')) {
                // originalPath 업데이트
                const updatedFrontmatter = frontmatter.replace(
                    /originalPath:.*\n/,
                    originalPathLine
                );
                return content.replace(frontmatterRegex, `---\n${updatedFrontmatter}\n---\n`);
            } else {
                // originalPath 추가
                return content.replace(
                    frontmatterRegex,
                    `---\n${frontmatter}\n${originalPathLine}---\n`
                );
            }
        } else {
            // frontmatter가 없는 경우 새로 추가
            return `---\n${originalPathLine}---\n\n${content}`;
        }
    }

    /**
     * Vault 폴더가 존재하는지 확인하고, 없으면 생성합니다.
     */
    private async ensureVaultFolder(folderPath: string): Promise<boolean> {
        const folder = this.app.vault.getAbstractFileByPath(folderPath);
        
        if (folder instanceof TFolder) {
            return true;
        }
        
        // 경로 분리
        const pathParts = folderPath.split('/').filter(part => part.length > 0);
        let currentPath = '';
        
        // 각 레벨별로 폴더 생성
        for (const part of pathParts) {
            currentPath = currentPath ? `${currentPath}/${part}` : part;
            const currentFolder = this.app.vault.getAbstractFileByPath(currentPath);
            
            if (!currentFolder) {
                try {
                    await this.app.vault.createFolder(currentPath);
                } catch (error) {
                    // 이미 존재하는 경우 무시
                }
            }
        }
        
        return true;
    }
}