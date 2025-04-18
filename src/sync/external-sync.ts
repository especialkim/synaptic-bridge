import { App, Notice, TFile, Vault, TFolder } from 'obsidian';
import { ExternalFolderWatcher, SyncHandler } from '../watchers/external-watcher';
import { VaultSync } from './vault-sync';
import { FolderMapping, MarkdownHijackerSettings } from '../../settings';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import MarkdownHijacker from '../../main';
import { addOriginPathFrontMatter, extractOriginPathFromFrontMatter, FrontMatterUtils } from '../utils/frontmatter-utils';
import { normalizePath } from 'obsidian';

export class ExternalSync {
    private app: App;
    private externalWatcher: ExternalFolderWatcher | null;
    private vaultSync: VaultSync;
    private plugin: MarkdownHijacker;
    private syncHandlers: Map<string, SyncHandler> = new Map();
    private showNotifications: boolean = true;
    private readonly debugMode: boolean;
    private vault: Vault;
    private frontMatterUtils: FrontMatterUtils;
    private settings: MarkdownHijackerSettings;

    constructor(
        plugin: MarkdownHijacker,
        externalWatcher: ExternalFolderWatcher | null,
        vaultSync?: VaultSync,
        debugMode: boolean = false
    ) {
        this.app = plugin.app;
        this.plugin = plugin;
        this.externalWatcher = externalWatcher;
        this.vaultSync = vaultSync || new VaultSync(plugin.app);
        this.debugMode = debugMode;
        this.vault = plugin.app.vault;
        this.frontMatterUtils = new FrontMatterUtils(plugin.app);
        this.settings = plugin.settings;
        
        // 워처에 자신의 인스턴스 설정
        if (this.externalWatcher) {
            this.externalWatcher.setExternalSync(this);
        }
        
        // 초기화 로깅
        console.log(`[External Sync] 🔄 ExternalSync 생성됨`);
        console.log(`[External Sync] 📁 외부 워처: ${externalWatcher ? '연결됨' : '없음'}`);
        console.log(`[External Sync] 💾 Vault 싱크: ${this.vaultSync ? '연결됨' : '없음'}`);
        
        // syncHandlers 맵 초기화 확인
        console.log(`[External Sync] 📊 동기화 핸들러 맵 생성됨: 크기=${this.syncHandlers.size}`);
        
        // 디버그 로그: 초기화 추적
        console.log(`[External Sync] ExternalSync 객체 생성됨`, {
            "외부 워처 존재": !!externalWatcher,
            "Vault 싱크 존재": !!vaultSync,
            "싱크 핸들러 맵 크기": this.syncHandlers.size
        });
    }

    /**
     * 폴더 매핑에 대한 동기화 핸들러를 설정합니다.
     * @param mapping 폴더 매핑 정보
     * @param showNotifications 알림 표시 여부
     */
    public setupSyncHandlers(mapping: FolderMapping, showNotifications: boolean = true): void {
        console.log(`[External Sync] 🔄 동기화 핸들러 설정 시작: 매핑 ID=${mapping.id}, 외부 경로=${mapping.externalPath}, Vault 경로=${mapping.vaultPath}`);
        
        // 매핑 ID 확인
        if (!mapping.id) {
            console.error(`[External Sync] ❌ 오류: 매핑 ID가 없습니다`, mapping);
            return;
        }
        
        this.showNotifications = showNotifications;
        
        // 핸들러 함수 생성
        const handler: SyncHandler = (type: string, fileName: string, fullPath: string) => {
            console.log(`[External Sync] 📣 핸들러 호출됨: 이벤트=${type}, 파일=${fileName}, 전체 경로=${fullPath}`);
            this.handleExternalChange(mapping, type, fileName, fullPath);
        };
        
        // 기존 핸들러가 있으면 제거
        if (this.syncHandlers.has(mapping.id)) {
            console.log(`[External Sync] 🔁 기존 핸들러 제거: ${mapping.id}`);
            this.syncHandlers.delete(mapping.id);
        }
        
        // 핸들러 함수 타입 테스트 (디버그용)
        console.log(`[External Sync] 🔍 핸들러 함수 타입: ${typeof handler}`);
        
        // 워처에 핸들러 등록
        try {
            console.log(`[External Sync] 📌 워처에 핸들러 등록 시도: ${mapping.id}`);
            this.externalWatcher?.registerSyncHandler(mapping.id, handler);
            console.log(`[External Sync] ✅ 워처에 핸들러 등록 성공: ${mapping.id}`);
        } catch (error) {
            console.error(`[External Sync] ❌ 워처에 핸들러 등록 실패: ${mapping.id}`, error);
        }
        
        // 핸들러 맵에 저장
        this.syncHandlers.set(mapping.id, handler);
        
        // 등록 확인
        const registeredHandler = this.syncHandlers.get(mapping.id);
        console.log(`[External Sync] ✅ 동기화 핸들러 등록 완료: 매핑 ID=${mapping.id}, 핸들러 존재=${!!registeredHandler}`);
    }

    /**
     * 모든 매핑에 대한 동기화 핸들러를 설정합니다.
     */
    public setupAllSyncHandlers(): void {
        console.log(`[External Sync] 🔄 모든 매핑에 대한 동기화 핸들러 설정 시작`);
        
        try {
            const mappings = this.externalWatcher?.getMappings();
            console.log(`[External Sync] 📊 등록된 매핑 수: ${mappings?.size || 0}, 키 목록: [${Array.from(mappings?.keys() || []).join(', ')}]`);
            
            if (!mappings || mappings.size === 0) {
                console.log(`[External Sync] ⚠️ 등록된 매핑이 없습니다. 매핑을 먼저 등록해주세요.`);
                return;
            }
            
            mappings.forEach((mapping: FolderMapping, id: string) => {
                console.log(`[External Sync] 🔄 매핑 처리 중: ID=${id}, 경로=${mapping.externalPath}`);
                this.setupSyncHandlers(mapping, this.showNotifications);
            });
            
            console.log(`[External Sync] ✅ 모든 매핑에 대한 동기화 핸들러 설정 완료. 총 ${mappings.size}개 처리됨.`);
        } catch (error) {
            console.error(`[External Sync] ❌ 동기화 핸들러 설정 중 오류 발생:`, error);
        }
    }

    /**
     * 외부 폴더 변경을 처리합니다.
     * @param mapping 폴더 매핑 정보
     * @param eventType 이벤트 타입
     * @param fileName 파일 이름
     * @param fullPath 전체 경로
     */
    private handleExternalChange(mapping: FolderMapping, eventType: string, fileName: string, fullPath: string): void {
        console.log(`[External Sync] 📝 외부 변경 처리 시작: 매핑 ID=${mapping.id}, 이벤트=${eventType}, 파일=${fileName}`);
        
        try {
            // 임시 파일이나 숨김 파일 건너뛰기
            if (fileName.startsWith('.') || fileName.endsWith('~') || fileName.endsWith('.tmp') || fileName.includes('_test_event_')) {
                console.log(`[External Sync] ℹ️ 임시/숨김 파일 건너뜀: ${fileName}`);
                return;
            }
            
            // 전체 경로에서 파일 존재 여부 확인
            const exists = fs.existsSync(fullPath);
            console.log(`[External Sync] 🔍 파일 존재 여부: ${exists ? '있음' : '없음'}, 경로: ${fullPath}`);
            
            // unlink 이벤트의 경우 파일이 삭제되었으므로 exists가 false일 수 있음
            if (eventType === 'unlink' || eventType === 'unlinkDir') {
                console.log(`[External Sync] 🗑️ ${eventType === 'unlinkDir' ? '폴더' : '파일'} 삭제 이벤트 감지: ${fileName}`);
                
                // Vault 내부 경로 계산
                const vaultPath = this.calculateVaultPath(mapping, fileName);
                
                if (eventType === 'unlinkDir') {
                    // 폴더 삭제 처리
                    this.handleDirectoryDelete(mapping, fileName, vaultPath);
                } else {
                    // 파일 삭제 처리
                    this.handleDelete(mapping, fileName);
                }
                return;
            }
            
            // 파일이 존재하지 않는 경우
            if (!exists) {
                console.log(`[External Sync] ⚠️ 파일이 존재하지 않음 (unlink 이벤트가 아닌데도): ${fullPath}`);
                return;
            }
            
            // 파일인지 디렉토리인지 확인
            const stats = fs.statSync(fullPath);
            const isDirectory = stats.isDirectory();
            
            if (isDirectory) {
                console.log(`[External Sync] 📁 디렉토리 이벤트: ${fullPath}`);
                // 현재 구현에서는 디렉토리 생성 이벤트는 별도로 처리하지 않음 (파일 처리 시 자동으로 생성됨)
                return;
            }
            
            // 마크다운 파일만 처리 (.md 확장자)
            if (path.extname(fullPath).toLowerCase() !== '.md') {
                console.log(`[External Sync] 📄 마크다운 파일이 아님, 처리 건너뜀: ${fullPath}`);
                return;
            }
            
            // 파일 내용 읽기
            console.log(`[External Sync] 📂 파일 내용 읽기 시작: ${fullPath}`);
            const content = fs.readFileSync(fullPath, 'utf8');
            console.log(`[External Sync] 📂 파일 내용 읽기 완료: ${content.length} 바이트`);
            
            // Vault 내부 경로 계산
            const vaultPath = this.calculateVaultPath(mapping, fileName);
            console.log(`[External Sync] 🔄 계산된 Vault 경로: ${vaultPath}`);
            
            // 파일 존재 여부 확인 - Vault 내부에서
            const { exists: vaultExists, file: vaultFile } = this.vaultSync.fileExistsInVault(vaultPath);
            console.log(`[External Sync] 🔍 Vault 내 파일 존재 여부: ${vaultExists ? '있음' : '없음'}, 경로: ${vaultPath}`);
            
            // 이벤트 타입에 따른 처리
            if (eventType === 'add' || eventType === 'change') {
                console.log(`[External Sync] ✍️ 파일 생성/수정 처리 중: ${fileName}, 이벤트: ${eventType}`);
                
                // 실제 처리 로직 호출 (Vault에 파일 생성 또는 수정)
                this.handleCreateOrModify(mapping, vaultPath, content, vaultExists, vaultFile);
                
                // 알림 표시
                if (this.showNotifications) {
                    const actionText = vaultExists ? '업데이트됨' : '생성됨';
                    new Notice(`외부 파일이 ${actionText}: ${fileName}`);
                }
            }
        } catch (error) {
            console.error(`[External Sync] ❌ 외부 변경 처리 오류:`, error);
            if (error instanceof Error) {
                console.error(`[External Sync] 오류 메시지: ${error.message}`);
                console.error(`[External Sync] 스택 트레이스: ${error.stack}`);
            }
        }
    }
    
    /**
     * 외부 파일 경로에서 Vault 내부 경로를 계산합니다.
     * @param mapping 폴더 매핑 정보
     * @param fileName 파일 이름
     * @returns Vault 내부 경로
     */
    private calculateVaultPath(mapping: FolderMapping, fileName: string): string {
        // 매핑된 경로와 파일 이름을 결합
        return path.join(mapping.vaultPath, fileName);
    }

    /**
     * 파일 생성 또는 수정을 처리합니다.
     * @param mapping 폴더 매핑 정보
     * @param vaultPath Vault 내부 경로
     * @param content 파일 내용
     * @param vaultExists Vault에 파일이 존재하는지 여부
     * @param vaultFile 존재하는 경우 Vault 파일 객체
     */
    private async handleCreateOrModify(
        mapping: FolderMapping, 
        vaultPath: string, 
        content: string, 
        vaultExists: boolean, 
        vaultFile: TFile | null | undefined
    ): Promise<void> {
        console.log(`[External Sync] 📝 파일 생성/수정 처리 시작: ${vaultPath}`);
        
        try {
            // 파일 절대 경로 계산
            const fileParts = path.basename(vaultPath).split('.');
            const extname = fileParts.length > 1 ? '.' + fileParts.pop() : '';
            const filename = fileParts.join('.');
            const externalPath = path.join(mapping.externalPath, path.relative(mapping.vaultPath, vaultPath));
            
            console.log(`[External Sync] 💾 처리할 파일 정보: vault=${vaultPath}, external=${externalPath}`);
            
            // 프론트매터 처리 - 항상 추가되도록 설정
            const processingResult = await this.processFrontMatter(mapping.id, vaultPath, content, vaultExists, externalPath);
            console.log(`[External Sync] 📄 프론트매터 처리 결과: ${processingResult.modified ? '수정됨' : '변경 없음'}`);
            
            const finalContent = processingResult.content;
            
            // 파일 존재 여부에 따라 생성 또는 수정
            if (vaultExists && vaultFile) {
                // 파일 수정
                console.log(`[External Sync] ✏️ 기존 파일 수정: ${vaultPath}`);
                await this.vaultSync.modifyFile(vaultFile, finalContent);
                console.log(`[External Sync] ✅ 파일 수정 완료: ${vaultPath}`);
            } else {
                // 파일 생성
                console.log(`[External Sync] 🆕 새 파일 생성: ${vaultPath}`);
                const createdFile = await this.vaultSync.createFile(vaultPath, finalContent);
                console.log(`[External Sync] ✅ 파일 생성 완료: ${createdFile ? createdFile.path : vaultPath}`);
            }
        } catch (error) {
            console.error(`[External Sync] ❌ 파일 생성/수정 처리 오류:`, error);
            if (error instanceof Error) {
                console.error(`[External Sync] 오류 메시지: ${error.message}`);
                console.error(`[External Sync] 스택 트레이스: ${error.stack}`);
            }
        }
    }

    /**
     * 프론트매터를 처리합니다.
     * @param mappingId 매핑 ID
     * @param vaultPath Vault 내부 경로
     * @param content 파일 내용
     * @param fileExists 파일이 이미 존재하는지 여부
     * @param externalPath 외부 파일 경로 (originPath 설정용)
     * @returns 처리된 내용과 수정 여부
     */
    private async processFrontMatter(
        mappingId: string,
        vaultPath: string,
        content: string,
        fileExists: boolean,
        externalPath?: string
    ): Promise<{ content: string, modified: boolean }> {
        console.log(`[External Sync] 📄 프론트매터 처리 시작: ${vaultPath}, 매핑 ID: ${mappingId}`);
        
        try {
            // 프론트매터 처리 로직 - 항상 추가되도록 설정
            const frontMatterResult = this.frontMatterUtils.processFrontMatter(content, {
                mappingId,
                vaultPath,
                appendFrontMatter: true, // 항상 frontmatter 추가
                externalPath: externalPath // 외부 파일 경로 전달
            });
            
            console.log(`[External Sync] ✅ 프론트매터 처리 완료: ${vaultPath}, 수정됨: ${frontMatterResult.modified}`);
            return frontMatterResult;
        } catch (error) {
            console.error(`[External Sync] ❌ 프론트매터 처리 오류:`, error);
            // 오류 발생 시 원본 내용 그대로 반환
            return { content, modified: false };
        }
    }

    /**
     * 파일 삭제 처리
     */
    private async handleDelete(mapping: FolderMapping, fileName: string): Promise<void> {
        console.log(`[External Sync] 🗑️ handleDelete 시작 - 파일명: ${fileName}`);
        
        // Vault 내부 경로 계산
        const vaultPath = this.calculateVaultPath(mapping, fileName);
        console.log(`[External Sync] 🔄 계산된 Vault 경로: ${vaultPath}`);
        
        try {
            // Vault 파일 존재 여부 확인
            const { exists, file } = this.vaultSync.fileExistsInVault(vaultPath);
            console.log(`[External Sync] 🔍 Vault 파일 존재 여부: ${exists ? '있음' : '없음'}, 경로: ${vaultPath}`);
            
            if (exists && file) {
                // Vault에서 파일 삭제
                console.log(`[External Sync] 🗑️ Vault 파일 삭제 시작: ${vaultPath}`);
                try {
                    const success = await this.vaultSync.deleteFile(file);
                    console.log(`[External Sync] ${success ? '✅ 삭제 완료' : '❌ 삭제 실패'}: ${vaultPath}`);
                    
                    if (success && this.showNotifications) {
                        console.log(`[External Sync] 🔔 삭제 알림 표시: ${path.basename(vaultPath)}`);
                        new Notice(`외부 파일이 삭제됨: ${path.basename(vaultPath)}`);
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
            if (this.showNotifications) {
                new Notice(`파일 삭제 오류: ${error.message}`);
            }
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
     * @param mappingId 매핑 ID
     * @param handler 핸들러 함수
     */
    public registerSyncHandler(mappingId: string, handler: SyncHandler): void {
        console.log(`[External Sync] 🔔 핸들러 등록: ${mappingId}`);
        this.syncHandlers.set(mappingId, handler);
    }

    /**
     * 경로 정규화 함수
     */
    private normalizePath(path: string): string {
        // 슬래시로 경로 구분자 통일
        return path.replace(/\\/g, '/');
    }
    
    /**
     * 경로 결합 함수
     */
    private joinPaths(basePath: string, relativePath: string): string {
        // 두 경로를 결합하고 중복 슬래시 제거
        let result = basePath;
        if (!result.endsWith('/') && !relativePath.startsWith('/')) {
            result += '/';
        } else if (result.endsWith('/') && relativePath.startsWith('/')) {
            relativePath = relativePath.substring(1);
        }
        return result + relativePath;
    }
    
    /**
     * 상대 경로 계산 함수
     */
    private getRelativePath(basePath: string, fullPath: string): string | null {
        // 슬래시로 경로 구분자 통일
        basePath = basePath.replace(/\\/g, '/');
        fullPath = fullPath.replace(/\\/g, '/');
        
        // 마지막 슬래시 추가
        if (!basePath.endsWith('/')) {
            basePath += '/';
        }
        
        // 상대 경로 계산
        if (fullPath.startsWith(basePath)) {
            return fullPath.substring(basePath.length);
        }
        return null;
    }

    /**
     * Vault 파일 변경을 외부 파일로 처리합니다.
     * @param mappingId 매핑 ID
     * @param externalPath 외부 파일 경로
     * @param content 파일 내용
     */
    public async handleVaultFile(mappingId: string, externalPath: string, content: string): Promise<void> {
        console.log(`[External Sync] 📝 Vault 파일 변경 처리 시작: 매핑 ID=${mappingId}, 경로=${externalPath}`);
        
        try {
            // 매핑 정보 확인
            const mappings = this.externalWatcher?.getMappings();
            if (!mappings) {
                console.error(`[External Sync] ❌ 매핑 정보를 찾을 수 없음`);
                return;
            }
            
            const mapping = mappings.get(mappingId);
            if (!mapping) {
                console.error(`[External Sync] ❌ 매핑 정보를 찾을 수 없음: ${mappingId}`);
                return;
            }
            
            // 파일 존재 여부 확인
            const exists = await checkFileExists(externalPath);
            console.log(`[External Sync] 🔍 외부 파일 존재 여부: ${exists ? '있음' : '없음'}, 경로: ${externalPath}`);
            
            // 상위 폴더 생성
            const dirPath = path.dirname(externalPath);
            if (!fs.existsSync(dirPath)) {
                console.log(`[External Sync] 📁 상위 폴더 생성 시작: ${dirPath}`);
                fs.mkdirSync(dirPath, { recursive: true });
                console.log(`[External Sync] 📁 상위 폴더 생성 완료: ${dirPath}`);
            }
            
            // 파일 작성
            await fsp.writeFile(externalPath, content, 'utf8');
            console.log(`[External Sync] ✅ 외부 파일 ${exists ? '수정' : '생성'} 완료: ${externalPath}`);
            
            // 알림 표시
            if (this.showNotifications) {
                const actionText = exists ? '업데이트됨' : '생성됨';
                new Notice(`외부 파일이 ${actionText}: ${path.basename(externalPath)}`);
            }
        } catch (error) {
            console.error(`[External Sync] ❌ Vault 파일 변경 처리 오류:`, error);
            if (error instanceof Error) {
                console.error(`[External Sync] 오류 메시지: ${error.message}`);
                console.error(`[External Sync] 스택 트레이스: ${error.stack}`);
            }
        }
    }

    /**
     * 디렉토리 삭제 처리
     * @param mapping 폴더 매핑 정보
     * @param dirName 디렉토리 이름
     * @param vaultPath Vault 내부 경로
     */
    private async handleDirectoryDelete(mapping: FolderMapping, dirName: string, vaultPath: string): Promise<void> {
        console.log(`[External Sync] 🗑️ handleDirectoryDelete 시작 - Vault 경로: ${vaultPath}`);
        
        try {
            // Vault 폴더 존재 여부 확인
            const folder = this.app.vault.getAbstractFileByPath(vaultPath);
            
            if (folder && folder instanceof TFolder) {
                console.log(`[External Sync] 🔍 Vault 폴더 찾음, 삭제 시작: ${vaultPath}`);
                
                try {
                    // 폴더 삭제
                    await this.app.vault.delete(folder, true); // true: 휴지통으로 이동
                    console.log(`[External Sync] ✅ Vault 폴더 삭제 완료: ${vaultPath}`);
                    
                    // 알림 표시
                    if (this.showNotifications) {
                        new Notice(`외부 폴더가 삭제됨: ${dirName}`);
                    }
                } catch (deleteError) {
                    console.error(`[External Sync] ❌ Vault 폴더 삭제 중 오류:`, deleteError);
                    throw deleteError;
                }
            } else {
                console.log(`[External Sync] ⚠️ Vault에 해당 폴더가 없거나 폴더가 아님: ${vaultPath}`);
            }
        } catch (error) {
            console.error(`[External Sync] ❌ 폴더 삭제 처리 중 오류:`, error);
            if (this.showNotifications) {
                new Notice(`폴더 삭제 오류: ${error.message}`);
            }
        }
    }

    /**
     * 경로가 필터링 규칙에 따라 처리되어야 하는지 확인합니다.
     * 
     * @param folderName 확인할 폴더 이름
     * @returns 처리해야 하면 true, 필터링되어야 하면 false
     */
    public shouldProcessFolder(folderName: string): boolean {
        if (!this.settings.excludeFoldersEnabled && !this.settings.includeFoldersEnabled) {
            // 필터링이 비활성화된 경우 항상 처리
            return true;
        }
        
        if (this.settings.excludeFoldersEnabled) {
            // 제외 목록에서 "*" 확인 - 모든 서브폴더 제외
            const folders = this.settings.excludeFolders.split(/\r?\n/).map(f => f.trim()).filter(f => f);
            
            // "*"가 포함되어 있으면 모든 서브폴더 제외
            if (folders.includes('*')) {
                return false;
            }
            
            // 특정 폴더 이름이 제외 목록에 있는지 확인
            return !folders.some(folder => folder === folderName);
        }
        
        if (this.settings.includeFoldersEnabled) {
            // 포함 목록에서 "*" 확인 - 서브폴더 사용 안함
            const folders = this.settings.includeFolders.split(/\r?\n/).map(f => f.trim()).filter(f => f);
            
            // "*"가 포함되어 있으면 서브폴더 사용 안함
            if (folders.includes('*')) {
                return false;
            }
            
            // 특정 폴더 이름이 포함 목록에 있는지 확인
            return folders.some(folder => folder === folderName);
        }
        
        // 기본적으로 처리
        return true;
    }

    /**
     * 마크다운 파일을 처리합니다.
     * 
     * @param filePath 외부 파일 경로
     * @param basePath 베이스 경로
     * @param relativePath 상대 경로
     * @returns 처리 여부
     */
    async processMarkdownFile(filePath: string, basePath: string, relativePath: string): Promise<boolean> {
        try {
            console.log(`[External Sync] 마크다운 파일 처리: ${filePath}`);
            
            // 상대 경로로부터 Vault 파일 경로 계산
            const relativePart = relativePath.startsWith('/') ? relativePath : '/' + relativePath;
            const vaultPath = normalizePath(relativePart);
            
            // 파일 읽기
            const content = await fs.promises.readFile(filePath, 'utf8');
            
            // 파일 내용 변환 (프론트매터 처리 등)
            let processedContent = content;
            
            // 프론트매터 처리
            const { content: newContent, modified } = this.frontMatterUtils.processFrontMatter(
                content,
                {
                    mappingId: "external", // 외부 파일에서는 매핑 ID를 특정할 수 없음
                    vaultPath: vaultPath,
                    appendFrontMatter: true,
                    externalPath: filePath
                }
            );
            
            if (modified) {
                processedContent = newContent;
                console.log(`[External Sync] 프론트매터 수정됨: ${filePath}`);
                
                // 수정된 내용 파일에 쓰기
                await fs.promises.writeFile(filePath, processedContent, 'utf8');
            }
            
            return true;
        } catch (error) {
            console.error(`[External Sync] 마크다운 파일 처리 오류:`, error);
            return false;
        }
    }
}

/**
 * 파일 존재 여부 확인
 * @param filePath 파일 경로
 * @returns 파일 존재 여부
 */
async function checkFileExists(filePath: string): Promise<boolean> {
    try {
        await fsp.access(filePath);
        return true;
    } catch (error) {
        return false;
    }
}

/**
 * 파일 내용 읽기
 * @param filePath 파일 경로
 * @returns 파일 내용
 */
async function readFileAsync(filePath: string): Promise<string> {
    try {
        return await fsp.readFile(filePath, 'utf8');
    } catch (error) {
        console.error(`[Utils] 파일 읽기 오류: ${filePath}`, error);
        throw error;
    }
}
