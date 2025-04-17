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
        console.log(`[Vault Sync] 🗂️ 상위 폴더 생성 시작: ${folderPath}`);
        
        // 루트 경로나 빈 문자열인 경우 종료
        if (!folderPath || folderPath === '.' || folderPath === '/') {
            console.log(`[Vault Sync] 🗂️ 루트 폴더 도달 또는 빈 경로: ${folderPath}`);
            return;
        }
        
        const parentPath = path.dirname(folderPath);
        console.log(`[Vault Sync] 🗂️ 상위 폴더 경로: ${parentPath}`);
        
        // 상위 경로가 루트 또는 빈 경로인 경우도 체크
        if (!parentPath || parentPath === '.' || parentPath === '/') {
            console.log(`[Vault Sync] 🗂️ 상위 폴더가 루트 경로: ${parentPath}`);
            
            // 현재 폴더만 생성
            try {
                console.log(`[Vault Sync] 🗂️ 최상위 폴더 생성 시도: ${folderPath}`);
                await this.app.vault.createFolder(folderPath);
                console.log(`[Vault Sync] ✅ 최상위 폴더 생성 성공: ${folderPath}`);
                return;
            } catch (error) {
                if (error.message && error.message.includes('already exists')) {
                    console.log(`[Vault Sync] ℹ️ 최상위 폴더가 이미 존재함: ${folderPath}`);
                    return;
                }
                throw error;
            }
        }
        
        try {
            // 현재 경로 확인
            const currentFolder = this.app.vault.getAbstractFileByPath(folderPath);
            if (currentFolder) {
                console.log(`[Vault Sync] 🗂️ 폴더가 이미 존재함: ${folderPath}`);
                return; // 이미 존재하면 종료
            }
            
            // 상위 폴더 확인
            const parent = this.app.vault.getAbstractFileByPath(parentPath);
            
            if (!parent) {
                console.log(`[Vault Sync] 🗂️ 상위 폴더가 없음, 먼저 생성: ${parentPath}`);
                // 상위 폴더 먼저 생성 (재귀)
                await this.ensureParentFolders(parentPath);
            } else {
                console.log(`[Vault Sync] 🗂️ 상위 폴더 이미 존재함: ${parentPath}`);
            }
            
            // 현재 폴더 생성
            console.log(`[Vault Sync] 🗂️ 폴더 생성 시도: ${folderPath}`);
            try {
                await this.app.vault.createFolder(folderPath);
                console.log(`[Vault Sync] ✅ 폴더 생성 성공: ${folderPath}`);
            } catch (error) {
                // 이미 존재하는 경우 무시
                if (error.message && error.message.includes('already exists')) {
                    console.log(`[Vault Sync] ℹ️ 폴더가 이미 존재함 (중복 생성 시도): ${folderPath}`);
                } else {
                    console.error(`[Vault Sync] ❌ 폴더 생성 오류: ${folderPath}`, error);
                    throw error;
                }
            }
        } catch (error) {
            console.error(`[Vault Sync] ❌ 상위 폴더 생성 오류: ${error.message}`);
            throw error;
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
            
            // 상위 폴더 생성 로직 강화
            try {
                await this.ensureParentFolders(folderPath);
                console.log(`[Vault Sync] 상위 폴더 생성 완료: ${folderPath}`);
                
                // 폴더 존재 재확인
                const folderExists = this.app.vault.getAbstractFileByPath(folderPath);
                console.log(`[Vault Sync] 상위 폴더 존재 확인: ${folderExists ? '있음' : '없음'}`);
                
                if (!folderExists) {
                    console.error(`[Vault Sync] ⚠️ 상위 폴더 생성 실패: ${folderPath}`);
                    throw new Error(`상위 폴더가 생성되지 않음: ${folderPath}`);
                }
            } catch (folderError) {
                console.error(`[Vault Sync] ❌ 상위 폴더 생성 오류:`, folderError);
                throw folderError;
            }
            
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
            try {
                const file = await this.app.vault.create(vaultPath, content);
                console.log(`[Vault Sync] 파일 생성 완료: ${vaultPath}, 파일 ID: ${file.path}`);
                return file;
            } catch (createError) {
                console.error(`[Vault Sync] 파일 생성 시도 중 오류:`, createError);
                
                // 파일 경로 구성요소 출력 (디버깅용)
                const pathParts = vaultPath.split('/');
                console.log(`[Vault Sync] 파일 경로 구성요소:`, pathParts);
                
                throw createError;
            }
        } catch (error) {
            console.error(`[Vault Sync] 파일 생성 오류:`, error);
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
            console.log(`[Vault Sync] 🗑️ 파일 삭제 시작: ${file.path}`);
            
            // 파일 존재 확인
            const existingFile = this.app.vault.getAbstractFileByPath(file.path);
            if (!existingFile) {
                console.log(`[Vault Sync] ⚠️ 이미 삭제되었거나 존재하지 않는 파일: ${file.path}`);
                return true; // 이미 삭제되었으면 성공으로 간주
            }
            
            // 파일 유형 확인
            if (!(existingFile instanceof TFile)) {
                console.error(`[Vault Sync] ❌ 지정된 경로가 파일이 아님: ${file.path}`);
                return false;
            }
            
            // 파일 삭제 실행
            console.log(`[Vault Sync] 🗑️ vault.delete 호출: ${file.path}`);
            await this.app.vault.delete(file);
            
            // 삭제 후 확인
            const checkExists = this.app.vault.getAbstractFileByPath(file.path);
            const deleted = !checkExists;
            console.log(`[Vault Sync] ${deleted ? '✅ 파일 삭제 완료' : '❌ 파일 삭제 실패'}: ${file.path}`);
            
            return deleted;
        } catch (error) {
            console.error(`[Vault Sync] ❌ 파일 삭제 오류:`, error);
            if (error instanceof Error) {
                console.error(`[Vault Sync] 오류 내용: ${error.message}`);
                console.error(`[Vault Sync] 오류 스택: ${error.stack}`);
            }
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
