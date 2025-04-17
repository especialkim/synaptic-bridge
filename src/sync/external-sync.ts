import { App, Notice, TFile } from 'obsidian';
import * as fs from 'fs';
import * as path from 'path';
import { FolderMapping } from '../../settings';
import { VaultSync } from './vault-sync';
import { ExternalFolderWatcher, SyncHandler } from '../watchers/external-watcher';
import { addOriginPathFrontMatter } from '../utils/frontmatter-utils';

export class ExternalSync {
    private app: App;
    private vaultSync: VaultSync;
    private externalWatcher: ExternalFolderWatcher;
    private syncHandlers: Map<string, SyncHandler> = new Map();

    constructor(app: App, externalWatcher: ExternalFolderWatcher) {
        this.app = app;
        this.vaultSync = new VaultSync(app);
        this.externalWatcher = externalWatcher;
        
        // 초기화 로깅
        console.log(`[External Sync] 📊 객체 생성됨: ${this.constructor.name}`);
        console.log(`[External Sync] 📊 외부 감시자 참조: ${this.externalWatcher ? '있음' : '없음'}`);
        console.log(`[External Sync] 📊 VaultSync 참조: ${this.vaultSync ? '있음' : '없음'}`);
        
        // syncHandlers 맵 초기화 확인
        console.log(`[External Sync] 📊 동기화 핸들러 맵 생성됨: 크기=${this.syncHandlers.size}`);
    }

    /**
     * 외부 파일 변경 이벤트 처리 연결
     * @param mapping 폴더 매핑 정보
     */
    public setupSyncHandlers(mapping: FolderMapping): void {
        // 기존 handleExternalChange 메서드를 확장하여 Vault 동기화 로직 추가
        console.log(`[External Sync] 🔌 동기화 핸들러 설정 시작: 매핑 ID=${mapping.id}, 경로=${mapping.externalPath}`);
        
        // 매핑 ID 검증
        if (!mapping.id) {
            console.error(`[External Sync] ⚠️ 매핑 ID가 없습니다! 경로: ${mapping.externalPath}`);
            // 임의의 ID 생성 방지를 위해 여기서 중단
            return;
        }
        
        // 핸들러 생성 및 등록
        const handler = (eventType: string, filename: string, fullPath: string) => {
            console.log(`[External Sync] 🎯 동기화 핸들러 호출됨: ${eventType}, ${filename}, ${fullPath}`);
            this.handleExternalChange(mapping, eventType, filename, fullPath);
        };
        
        // 디버그용 핸들러 테스트
        console.log(`[External Sync] 🔍 핸들러 테스트 - 함수 타입: ${typeof handler}`);
        
        this.externalWatcher.registerSyncHandler(
            mapping, 
            handler
        );
        
        // 핸들러 등록 확인
        console.log(`[External Sync] ✅ 동기화 핸들러 설정 완료: 매핑 ID=${mapping.id}`);
    }

    /**
     * 외부 파일 변경 이벤트에 따른 Vault 동기화 처리
     */
    private async handleExternalChange(
        mapping: FolderMapping, 
        eventType: string, 
        filename: string, 
        fullPath: string
    ): Promise<void> {
        console.log(`[External Sync] 💫 이벤트 처리 시작 - 유형: ${eventType}, 파일: ${filename}, 경로: ${fullPath}`);
        
        try {
            // 유효성 검사 - unlink 이벤트는 파일이 존재하지 않는 것이 정상
            if (eventType !== 'unlink' && (!fullPath || !fs.existsSync(fullPath))) {
                console.log(`[External Sync] ⚠️ 파일이 존재하지 않음: ${fullPath}`);
                return;
            }

            // 임시 파일 처리 건너뛰기
            if (filename.startsWith('.') || filename.endsWith('~') || filename.includes('.tmp')) {
                console.log(`[External Sync] 🚫 임시 파일 무시: ${filename}`);
                return;
            }

            // Vault 내 대상 경로 계산
            const vaultTargetPath = this.vaultSync.externalToVaultPath(fullPath, mapping);
            console.log(`[External Sync] 🔄 Vault 대상 경로: ${vaultTargetPath}`);

            // 이벤트 유형에 따라 처리
            if (eventType === 'unlink') {
                // 삭제 이벤트 처리
                console.log(`[External Sync] ➖ 파일 삭제 처리 시작: ${vaultTargetPath}`);
                try {
                    await this.handleDelete(vaultTargetPath);
                    console.log(`[External Sync] ✅ 파일 삭제 처리 완료: ${vaultTargetPath}`);
                    
                    // 알림 표시
                    new Notice(`🗑️ 외부 파일 삭제: ${filename}`);
                    console.log(`[External Sync] 🔔 알림 표시: 삭제: ${filename}`);
                } catch (error) {
                    console.error(`[External Sync] ❌ 파일 삭제 처리 실패:`, error);
                }
            } else if (eventType === 'add' || eventType === 'change') {
                // 파일 상태 확인 - 파일 생성/수정 이벤트에만 필요한 검증
                const stats = fs.statSync(fullPath);
                if (!stats.isFile()) {
                    console.log(`[External Sync] 📁 디렉토리 변경 무시: ${fullPath}`);
                    return;
                }

                console.log(`[External Sync] 📄 파일 정보 - 크기: ${stats.size}bytes, 수정: ${stats.mtime}`);

                // 파일 생성/수정 처리
                console.log(`[External Sync] ➕ 파일 생성/수정 처리 시작: ${fullPath} -> ${vaultTargetPath}`);
                try {
                    await this.handleCreateOrModify(fullPath, vaultTargetPath);
                    console.log(`[External Sync] ✅ 파일 생성/수정 처리 완료: ${vaultTargetPath}`);
                    
                    // 알림 표시
                    const action = eventType === 'add' ? '생성' : '수정';
                    new Notice(`📥 외부 파일 ${action}: ${filename}`);
                    console.log(`[External Sync] 🔔 알림 표시: ${action}: ${filename}`);
                } catch (error) {
                    console.error(`[External Sync] ❌ 파일 생성/수정 처리 실패:`, error);
                }
            } else {
                console.log(`[External Sync] ⚠️ 지원하지 않는 이벤트 유형: ${eventType}`);
            }
        } catch (error) {
            console.error(`[External Sync] 💥 이벤트 처리 중 오류 발생:`, error);
        }
    }

    /**
     * 파일 생성 또는 수정 처리
     * @param externalPath 외부 파일 경로
     * @param vaultPath Vault 내 경로
     */
    private async handleCreateOrModify(externalPath: string, vaultPath: string): Promise<void> {
        console.log(`[External Sync] 📝 handleCreateOrModify 시작 - 외부: ${externalPath}, Vault: ${vaultPath}`);
        
        try {
            // 파일 내용 읽기
            const content = fs.readFileSync(externalPath, 'utf8');
            console.log(`[External Sync] 📄 파일 내용 읽기 완료 (${content.length} 바이트)`);
            
            // 마크다운 파일인 경우 FrontMatter 처리
            let processedContent = content;
            if (externalPath.toLowerCase().endsWith('.md')) {
                console.log(`[External Sync] 🔖 마크다운 파일 FrontMatter 처리 시작`);
                try {
                    processedContent = addOriginPathFrontMatter(content, externalPath);
                    console.log(`[External Sync] ✅ FrontMatter 처리 완료`);
                    if (processedContent !== content) {
                        console.log(`[External Sync] 🔄 FrontMatter 변경됨: 기존 ${content.substring(0, 50)}... -> 새 ${processedContent.substring(0, 50)}...`);
                    } else {
                        console.log(`[External Sync] ℹ️ FrontMatter 변경 없음`);
                    }
                } catch (error) {
                    console.error(`[External Sync] ⚠️ FrontMatter 처리 중 오류:`, error);
                    // 오류 발생해도 원본 내용으로 계속 진행
                }
            }
            
            // Vault 파일 체크
            const checkResult = this.vaultSync.fileExistsInVault(vaultPath);
            const { exists, file } = checkResult;
            console.log(`[External Sync] 💾 Vault 파일 존재 여부: ${exists ? '있음' : '없음'}, 경로: ${vaultPath}`);
            
            // Vault에 파일 생성/수정
            if (!exists) {
                console.log(`[External Sync] 📝 Vault에 새 파일 생성 시작: ${vaultPath}`);
                try {
                    const newFile = await this.vaultSync.createFile(vaultPath, processedContent);
                    if (newFile) {
                        console.log(`[External Sync] ✅ Vault 새 파일 생성 완료: ${vaultPath}, id: ${newFile.path}`);
                    } else {
                        console.error(`[External Sync] ❌ Vault 새 파일 생성 실패: ${vaultPath}`);
                    }
                } catch (err) {
                    console.error(`[External Sync] ❌ Vault 파일 생성 오류:`, err);
                }
            } else if (file) {
                console.log(`[External Sync] 🔄 Vault 파일 수정 시작: ${vaultPath}, 파일: ${file.path}`);
                try {
                    const success = await this.vaultSync.modifyFile(file, processedContent);
                    if (success) {
                        console.log(`[External Sync] ✅ Vault 파일 수정 완료: ${vaultPath}`);
                    } else {
                        console.error(`[External Sync] ❌ Vault 파일 수정 실패: ${vaultPath}`);
                    }
                } catch (err) {
                    console.error(`[External Sync] ❌ Vault 파일 수정 오류:`, err);
                }
            }
        } catch (error) {
            console.error(`[External Sync] ❌ 파일 생성/수정 처리 중 오류:`, error);
            throw error; // 상위로 오류 전파
        }
    }

    /**
     * 파일 삭제 처리
     */
    private async handleDelete(vaultPath: string): Promise<void> {
        console.log(`[External Sync] 🗑️ handleDelete 시작 - Vault 경로: ${vaultPath}`);
        
        try {
            // Vault 파일 존재 여부 확인
            const { exists, file } = this.vaultSync.fileExistsInVault(vaultPath);
            console.log(`[External Sync] 🔍 Vault 파일 존재 여부: ${exists ? '있음' : '없음'}`);
            
            if (exists && file) {
                // Vault에서 파일 삭제
                console.log(`[External Sync] 🗑️ Vault 파일 삭제 시작: ${vaultPath}`);
                try {
                    const success = await this.vaultSync.deleteFile(file);
                    console.log(`[External Sync] ${success ? '✅ 삭제 완료' : '❌ 삭제 실패'}: ${vaultPath}`);
                    
                    if (success) {
                        console.log(`[External Sync] 🔔 삭제 알림 표시: ${path.basename(vaultPath)}`);
                    }
                } catch (deleteError) {
                    console.error(`[External Sync] ❌ Vault 파일 삭제 중 오류:`, deleteError);
                    throw deleteError;
                }
            } else {
                console.log(`[External Sync] ⚠️ Vault에 파일이 없어 삭제 건너뜀: ${vaultPath}`);
            }
        } catch (error) {
            console.error(`[External Sync] ❌ 파일 삭제 처리 중 오류:`, error);
            throw error; // 상위로 오류 전파
        }
    }

    /**
     * 파일 이동/이름 변경 처리
     * 참고: 이 메서드는 외부 파일 시스템에서 이름 변경 이벤트를 정확히 
     * 감지하기 어려워 직접 호출해야 할 수 있음
     */
    private async handleRename(
        oldVaultPath: string, 
        newVaultPath: string, 
        exists: boolean, 
        file?: TFile
    ): Promise<void> {
        if (exists && file) {
            // Vault에서 파일 이동/이름 변경
            console.log(`[External Sync] Vault 파일 이동/이름 변경: ${oldVaultPath} -> ${newVaultPath}`);
            const success = await this.vaultSync.renameFile(file, newVaultPath);
            if (success) {
                new Notice(`파일 이동됨: ${path.basename(oldVaultPath)} -> ${path.basename(newVaultPath)}`);
            }
        } else {
            console.log(`[External Sync] Vault에 파일이 없어 이동 건너뜀: ${oldVaultPath}`);
        }
    }

    /**
     * 동기화 핸들러 등록
     * @param mapping 폴더 매핑 정보
     * @param handler 핸들러 함수
     */
    public registerSyncHandler(mapping: FolderMapping, handler: SyncHandler): void {
        this.syncHandlers.set(mapping.id, handler);
    }
}
