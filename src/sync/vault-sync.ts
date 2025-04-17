import { App, TFile, TFolder } from 'obsidian';
import * as path from 'path';
import * as fs from 'fs';
import { FolderMapping } from '../../settings';

export class VaultSync {
    private app: App;

    constructor(app: App) {
        this.app = app;
    }

    /**
     * 외부 파일 경로를 Vault 내부 경로로 변환
     * @param externalPath 외부 파일 전체 경로
     * @param mapping 폴더 매핑 정보
     * @returns Vault 내부 경로
     */
    public externalToVaultPath(externalPath: string, mapping: FolderMapping): string {
        console.log(`[Vault Sync] 경로 변환 시작: ${externalPath}`);
        console.log(`[Vault Sync] 매핑 정보: 외부=${mapping.externalPath}, Vault=${mapping.vaultPath}`);
        
        // 상대 경로 추출
        let relativePath = externalPath.replace(mapping.externalPath, '');
        console.log(`[Vault Sync] 상대 경로 추출: ${relativePath}`);
        
        // 경로 구분자 정규화 (OS에 따라 다를 수 있음)
        relativePath = relativePath.replace(/\\/g, '/');
        if (relativePath.startsWith('/')) {
            relativePath = relativePath.substring(1);
        }
        console.log(`[Vault Sync] 경로 정규화 후: ${relativePath}`);
        
        // Vault 경로 생성
        const result = path.join(mapping.vaultPath, relativePath);
        console.log(`[Vault Sync] Vault 경로 변환 결과: ${result}`);
        return result;
    }

    /**
     * Vault 내 파일 존재 여부 확인
     * @param vaultPath Vault 내부 경로
     * @returns 파일 존재 여부 및 파일 객체
     */
    public fileExistsInVault(vaultPath: string): { exists: boolean, file?: TFile } {
        try {
            const file = this.app.vault.getAbstractFileByPath(vaultPath);
            if (file instanceof TFile) {
                return { exists: true, file };
            }
            return { exists: false };
        } catch (error) {
            console.error(`[Vault Sync] 파일 존재 여부 확인 오류: ${error}`);
            return { exists: false };
        }
    }

    /**
     * 상위 폴더들 생성 (재귀적)
     * @param folderPath 생성할 폴더 경로
     */
    private async ensureParentFolders(folderPath: string): Promise<void> {
        const parentPath = path.dirname(folderPath);
        
        if (parentPath === '.') return;
        
        const parent = this.app.vault.getAbstractFileByPath(parentPath);
        if (!parent) {
            // 상위 폴더 먼저 생성
            await this.ensureParentFolders(parentPath);
            // 현재 폴더 생성
            await this.app.vault.createFolder(parentPath);
        }
    }

    /**
     * Vault에 파일 생성
     * @param vaultPath Vault 내부 경로
     * @param content 파일 내용
     */
    public async createFile(vaultPath: string, content: string): Promise<TFile | null> {
        try {
            console.log(`[Vault Sync] 파일 생성 시작: ${vaultPath}, 내용 길이: ${content.length}바이트`);
            
            // 폴더 경로 확인 및 생성
            const folderPath = path.dirname(vaultPath);
            console.log(`[Vault Sync] 상위 폴더 확인: ${folderPath}`);
            await this.ensureParentFolders(folderPath);
            
            // 파일 존재 확인
            const existingFile = this.app.vault.getAbstractFileByPath(vaultPath);
            if (existingFile) {
                console.log(`[Vault Sync] 동일 경로에 파일이 이미 존재합니다: ${vaultPath}`);
                if (existingFile instanceof TFile) {
                    console.log(`[Vault Sync] 기존 파일을 수정합니다.`);
                    return await this.modifyFile(existingFile, content) ? existingFile : null;
                }
            }
            
            // 파일 생성
            console.log(`[Vault Sync] vault.create 호출: ${vaultPath}`);
            const file = await this.app.vault.create(vaultPath, content);
            console.log(`[Vault Sync] 파일 생성 완료: ${vaultPath}, 파일 ID: ${file.path}`);
            return file;
        } catch (error) {
            console.error(`[Vault Sync] 파일 생성 오류: ${error}`);
            if (error instanceof Error) {
                console.error(`[Vault Sync] 오류 내용: ${error.message}`);
                console.error(`[Vault Sync] 오류 스택: ${error.stack}`);
            }
            return null;
        }
    }

    /**
     * Vault 파일 내용 수정
     * @param file 수정할 파일 객체
     * @param content 새 파일 내용
     */
    public async modifyFile(file: TFile, content: string): Promise<boolean> {
        try {
            console.log(`[Vault Sync] 파일 수정 시작: ${file.path}, 내용 길이: ${content.length}바이트`);
            
            // 현재 내용 확인
            const currentContent = await this.app.vault.read(file);
            if (currentContent === content) {
                console.log(`[Vault Sync] 내용이 동일하여 수정 생략: ${file.path}`);
                return true;
            }
            
            // 파일 수정
            console.log(`[Vault Sync] vault.modify 호출: ${file.path}`);
            await this.app.vault.modify(file, content);
            console.log(`[Vault Sync] 파일 수정 완료: ${file.path}`);
            return true;
        } catch (error) {
            console.error(`[Vault Sync] 파일 수정 오류: ${error}`);
            if (error instanceof Error) {
                console.error(`[Vault Sync] 오류 내용: ${error.message}`);
                console.error(`[Vault Sync] 오류 스택: ${error.stack}`);
            }
            return false;
        }
    }

    /**
     * Vault 파일 삭제
     * @param file 삭제할 파일 객체
     */
    public async deleteFile(file: TFile): Promise<boolean> {
        try {
            console.log(`[Vault Sync] 파일 삭제 시작: ${file.path}`);
            await this.app.vault.delete(file);
            console.log(`[Vault Sync] 파일 삭제 완료: ${file.path}`);
            return true;
        } catch (error) {
            console.error(`[Vault Sync] 파일 삭제 오류: ${error}`);
            return false;
        }
    }

    /**
     * Vault 파일 이름/위치 변경
     * @param file 이동할 파일 객체
     * @param newPath 새 경로
     */
    public async renameFile(file: TFile, newPath: string): Promise<boolean> {
        try {
            console.log(`[Vault Sync] 파일 이동 시작: ${file.path} -> ${newPath}`);
            
            // 상위 폴더 확인 및 생성
            const folderPath = path.dirname(newPath);
            await this.ensureParentFolders(folderPath);
            
            // 파일 이동
            await this.app.vault.rename(file, newPath);
            console.log(`[Vault Sync] 파일 이동 완료: ${newPath}`);
            return true;
        } catch (error) {
            console.error(`[Vault Sync] 파일 이동 오류: ${error}`);
            return false;
        }
    }
}
