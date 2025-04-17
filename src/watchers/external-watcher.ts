import { App, Notice, TFile } from 'obsidian';
import * as fs from 'fs';
import * as path from 'path';
import { FSWatcher } from 'fs';
import { FolderMapping } from '../../settings';
import { addOriginPathFrontMatter, isFrontMatterUpToDate } from '../utils/frontmatter-utils';

// 파일 시스템 변화를 더 안정적으로 감지하기 위해 chokidar 사용 시도
// 직접 코드에 넣되, chokidar가 없으면 fs.watch로 폴백
let chokidar: any;
try {
    // @ts-ignore
    chokidar = require('chokidar');
    console.log("[External Watcher] chokidar 라이브러리를 성공적으로 로드했습니다.");
} catch (e) {
    console.log("[External Watcher] chokidar 라이브러리를 로드할 수 없습니다. 기본 fs.watch를 사용합니다.");
    chokidar = null;
}

// SyncHandler 타입 정의
export type SyncHandler = (eventType: string, filename: string, fullPath: string) => void;

export class ExternalFolderWatcher {
    private app: App;
    private watchers: Map<string, FSWatcher | any> = new Map();
    private debugMode: boolean;
    private showNotifications: boolean;
    private syncHandlers: Map<string, SyncHandler> = new Map();
    private mappings: Map<string, FolderMapping> = new Map();
    // 처리 중인 파일 추적을 위한 변수 추가
    private processingFiles: Set<string> = new Set();

    constructor(app: App, debugMode: boolean = false) {
        this.app = app;
        this.debugMode = debugMode;
        this.showNotifications = true; // Default to showing notifications
        
        // 콘솔에 직접 로그를 출력하여 생성자가 호출되었는지 확인
        console.log("[External Watcher] 외부 폴더 감시자 초기화됨");
    }

    /**
     * Set up a watcher for an external folder
     */
    public setupWatcher(mapping: FolderMapping, showNotifications: boolean = true): boolean {
        console.log(`[External Watcher] 워처 설정 시작: ${mapping.externalPath}`);
        
        try {
            // 이미 워처가 있으면 제거
            this.removeWatcher(mapping.id);
            
            // 매핑 정보 저장
            this.mappings.set(mapping.id, mapping);
            
            // 외부 폴더 존재 확인
            if (!fs.existsSync(mapping.externalPath)) {
                console.log(`[External Watcher] 외부 폴더가 존재하지 않음: ${mapping.externalPath}`);
                if (showNotifications) {
                    new Notice(`외부 폴더가 존재하지 않습니다: ${mapping.externalPath}`);
                }
                return false;
            }
            
            // 알림 설정 저장
            this.showNotifications = showNotifications;
            
            console.log(`[External Watcher] 폴더가 존재함, 감시 설정 중: ${mapping.externalPath}`);
            
            // 파일 시스템 이벤트를 처리할 핸들러
            const changeHandler = (eventType: string, filename: string | null) => {
                console.log(`[External Watcher] 파일 변경 이벤트 발생! 타입: ${eventType}, 파일: ${filename || '알 수 없음'}`);
                this.handleExternalChange(mapping, eventType, filename);
            };
            
            let watcher: FSWatcher | any;
            
            // chokidar가 있으면 사용, 없으면 fs.watch 사용
            if (chokidar) {
                console.log(`[External Watcher] chokidar를 사용하여 폴더 감시 시작: ${mapping.externalPath}`);
                
                watcher = chokidar.watch(mapping.externalPath, {
                    persistent: true,
                    ignoreInitial: true,
                    awaitWriteFinish: {
                        stabilityThreshold: 300,
                        pollInterval: 100
                    }
                });
                
                // chokidar 이벤트 리스너 등록
                watcher.on('add', (path: string) => {
                    console.log(`[External Watcher] 파일 추가됨: ${path}`);
                    const filename = path.replace(mapping.externalPath + '/', '').replace(mapping.externalPath + '\\', '');
                    console.log(`[External Watcher] 추출된 파일명: ${filename}, 매핑 ID: ${mapping.id}`);
                    changeHandler('add', filename);
                });
                
                watcher.on('change', (path: string) => {
                    console.log(`[External Watcher] 파일 변경됨: ${path}`);
                    const filename = path.replace(mapping.externalPath + '/', '').replace(mapping.externalPath + '\\', '');
                    console.log(`[External Watcher] 추출된 파일명: ${filename}, 매핑 ID: ${mapping.id}`);
                    changeHandler('change', filename);
                });
                
                watcher.on('unlink', (path: string) => {
                    console.log(`[External Watcher] 파일 삭제됨: ${path}`);
                    const filename = path.replace(mapping.externalPath + '/', '').replace(mapping.externalPath + '\\', '');
                    console.log(`[External Watcher] 추출된 파일명: ${filename}, 매핑 ID: ${mapping.id}`);
                    changeHandler('unlink', filename);
                });
                
                watcher.on('addDir', (path: string) => {
                    console.log(`[External Watcher] 폴더 추가됨: ${path}`);
                    // 최상위 폴더 자체를 감시 대상으로 삼았을 경우 동일 경로에 대한 이벤트는 무시
                    if (path === mapping.externalPath) {
                        console.log(`[External Watcher] 최상위 폴더 이벤트 무시: ${path}`);
                        return;
                    }
                    const dirname = path.replace(mapping.externalPath + '/', '').replace(mapping.externalPath + '\\', '');
                    console.log(`[External Watcher] 추출된 폴더명: ${dirname}, 매핑 ID: ${mapping.id}`);
                    changeHandler('addDir', dirname);
                });
                
                watcher.on('unlinkDir', (path: string) => {
                    console.log(`[External Watcher] 폴더 삭제됨: ${path}`);
                    // 최상위 폴더 자체를 감시 대상으로 삼았을 경우 동일 경로에 대한 이벤트는 무시
                    if (path === mapping.externalPath) {
                        console.log(`[External Watcher] 최상위 폴더 이벤트 무시: ${path}`);
                        return;
                    }
                    const dirname = path.replace(mapping.externalPath + '/', '').replace(mapping.externalPath + '\\', '');
                    console.log(`[External Watcher] 추출된 폴더명: ${dirname}, 매핑 ID: ${mapping.id}`);
                    changeHandler('unlinkDir', dirname);
                });
                
                watcher.on('error', (error: Error) => {
                    console.error(`[External Watcher] 감시 오류 발생: ${error}`);
                });
            } else {
                // 기존 fs.watch 사용
                console.log(`[External Watcher] fs.watch를 사용하여 폴더 감시 시작: ${mapping.externalPath}`);
                
                // 테스트 파일을 생성하고 이벤트가 트리거되는지 확인
                const testFile = path.join(mapping.externalPath, '_test_event_' + Date.now() + '.tmp');
                console.log(`[External Watcher] 이벤트 감지 테스트용 파일 생성: ${testFile}`);
                
                try {
                    fs.writeFileSync(testFile, 'test');
                    setTimeout(() => {
                        try {
                            if (fs.existsSync(testFile)) {
                                fs.unlinkSync(testFile);
                                console.log(`[External Watcher] 테스트 파일 삭제됨: ${testFile}`);
                            }
                        } catch (e) {
                            console.error(`[External Watcher] 테스트 파일 삭제 오류: ${e}`);
                        }
                    }, 1000);
                } catch (e) {
                    console.error(`[External Watcher] 테스트 파일 생성 오류: ${e}`);
                }
                
                // Set up watcher using fs.watch
                watcher = fs.watch(
                    mapping.externalPath, 
                    { recursive: true },
                    (eventType, filename) => {
                        console.log(`[External Watcher] fs.watch 이벤트 발생: ${eventType}, ${filename}, 매핑 ID: ${mapping.id}`);
                        if (filename) {
                            // fs.watch 이벤트 표준화 - 파일 존재 확인 후 이벤트 타입 결정
                            const fullPath = path.join(mapping.externalPath, filename);
                            const exists = fs.existsSync(fullPath);
                            
                            // 실제 이벤트 타입 결정 (문자열로 처리)
                            let actualEventType: string = eventType;
                            
                            try {
                                // 파일이 존재하면 파일인지 폴더인지 확인
                                if (exists) {
                                    const stats = fs.statSync(fullPath);
                                    const isDirectory = stats.isDirectory();
                                    
                                    if (eventType === 'rename') {
                                        // rename 이벤트가 발생하고 파일이 존재하면 생성 이벤트
                                        actualEventType = isDirectory ? 'addDir' : 'add';
                                    } else {
                                        // 파일이 존재하고 change 이벤트인 경우 그대로 유지
                                        actualEventType = isDirectory ? 'changeDir' : 'change';
                                    }
                                } else {
                                    // 파일이 존재하지 않으면 삭제 이벤트
                                    // 폴더인지 파일인지 확인할 수 없으므로 이전 이벤트 기록을 확인해야 함
                                    // 해당 경로가 이전에 폴더였는지 기록이 없으므로 일단 파일 삭제로 가정
                                    actualEventType = 'unlink';
                                    
                                    // 폴더 삭제 여부 추정: 경로에 확장자가 없고 '/' 또는 '\\'로 끝나면 폴더일 가능성이 높음
                                    const hasExtension = path.extname(filename).length > 0;
                                    const endsWithSeparator = filename.endsWith('/') || filename.endsWith('\\');
                                    
                                    if (!hasExtension || endsWithSeparator) {
                                        console.log(`[External Watcher] 폴더 삭제로 추정됨: ${filename}`);
                                        actualEventType = 'unlinkDir';
                                    }
                                }
                            } catch (error) {
                                console.error(`[External Watcher] 파일 상태 확인 오류: ${error.message}`);
                            }
                            
                            console.log(`[External Watcher] 표준화된 이벤트: ${actualEventType} (원본: ${eventType}), 파일: ${filename}`);
                            changeHandler(actualEventType, filename);
                        }
                    }
                );
            }
            
            // Store the watcher
            this.watchers.set(mapping.id, watcher);
            this.log(`Watcher set up successfully: ${mapping.externalPath}`);
            console.log(`[External Watcher] 폴더 감시 설정 완료: ${mapping.externalPath}`);
            
            return true;
        } catch (error) {
            this.log(`Failed to set up watcher: ${error}`, true);
            console.error(`[External Watcher] 감시 설정 오류: ${error}`);
            if (this.showNotifications) {
                new Notice(`Failed to monitor external folder: ${error}`);
            }
            return false;
        }
    }
    
    /**
     * Remove a specific watcher
     */
    public removeWatcher(mappingId: string): void {
        const watcher = this.watchers.get(mappingId);
        if (watcher) {
            watcher.close();
            this.watchers.delete(mappingId);
            this.log(`Watcher removed: ${mappingId}`);
        }
    }
    
    /**
     * Remove all watchers
     */
    public removeAllWatchers(): void {
        for (const [id, watcher] of this.watchers) {
            watcher.close();
        }
        this.watchers.clear();
        this.log('All watchers removed');
    }
    
    /**
     * 동기화 핸들러 등록
     * @param mappingId 매핑 ID
     * @param handler 핸들러 함수
     */
    public registerSyncHandler(mappingId: string, handler: SyncHandler): void {
        console.log(`[External Watcher] 💡 동기화 핸들러 등록: 매핑 ID=${mappingId}`);
        
        // 매핑 정보 가져오기
        const mapping = this.mappings.get(mappingId);
        if (!mapping) {
            console.error(`[External Watcher] 💡 매핑 정보를 찾을 수 없음: ID=${mappingId}`);
            return;
        }
        
        this.syncHandlers.set(mappingId, handler);
        // 핸들러 등록 확인 (디버깅용)
        const registeredHandler = this.syncHandlers.get(mappingId);
        console.log(`[External Watcher] 💡 동기화 핸들러 등록 확인: ${registeredHandler ? '성공' : '실패'}`);
    }

    /**
     * Handle changes in external folders
     */
    private handleExternalChange(mapping: FolderMapping, eventType: string, filename: string | null): void {
        // Handle null filename
        if (filename === null) {
            this.log('Change event detected with no filename', true);
            console.error('[External Watcher] 파일명 없는 이벤트 발생');
            return;
        }
        
        // Get the full path of the changed file
        const fullPath = path.join(mapping.externalPath, filename);
        
        // 이미 처리 중인 파일에 대한 중복 이벤트 방지 (무한 루프 방지)
        if (this.processingFiles.has(fullPath)) {
            console.log(`[External Watcher] ⚠️ 이미 처리 중인 파일입니다. 중복 처리 방지: ${fullPath}`);
            return;
        }

        // 파일 처리 시작 표시
        this.processingFiles.add(fullPath);
        
        try {
            // More detailed console output regardless of debug mode to help with troubleshooting
            console.log(`[External Watcher] 이벤트 감지: ${eventType}, 파일: ${filename}, 경로: ${fullPath}`);
            
            // Skip processing for temporary files
            if (filename.startsWith('.') || filename.endsWith('~') || filename.endsWith('.tmp') || 
                filename.includes('_test_event_')) {
                this.log(`Skipping temporary file: ${filename}`);
                console.log(`[External Watcher] 임시 파일 건너뜀: ${filename}`);
                return;
            }
            
            // Check if the file/path actually exists (to differentiate between creation and deletion)
            const exists = fs.existsSync(fullPath);
            console.log(`[External Watcher] 파일 존재 여부: ${exists ? '예' : '아니오'}`);
            
            // 파일 작업 상세 정보 확인
            let fileDetails = "알 수 없음";
            if (exists) {
                try {
                    const stats = fs.statSync(fullPath);
                    const isDirectory = stats.isDirectory();
                    fileDetails = isDirectory ? '폴더' : '파일';
                    console.log(`[External Watcher] 파일 종류: ${fileDetails}, 크기: ${stats.size} bytes, 수정시간: ${stats.mtime}`);
                    
                    // 프론트매터 추가 처리 - 파일이고 마크다운 파일인 경우에만
                    // 일시적으로 프론트매터 자동 추가 비활성화 (무한 루프 방지)
                    if (!isDirectory && fullPath.toLowerCase().endsWith('.md')) {
                        console.log(`[External Watcher] 마크다운 파일 감지, 프론트매터 확인: ${fullPath}`);
                        
                        try {
                            // 직접 파일 내용 읽기
                            const content = fs.readFileSync(fullPath, 'utf8');
                            console.log(`[External Watcher] 파일 내용 읽기 성공: ${content.substring(0, Math.min(50, content.length))}...`);
                            
                            // vault 이름 가져오기 
                            const vaultName = this.app.vault.getName();
                            
                            // vault 내 상대 경로 계산 (매핑 기반)
                            let vaultPath = '';
                            for (const [id, m] of this.mappings.entries()) {
                                if (fullPath.startsWith(m.externalPath)) {
                                    const relPath = fullPath.substring(m.externalPath.length);
                                    vaultPath = path.join(m.vaultPath, relPath).replace(/\\/g, '/');
                                    break;
                                }
                            }
                            
                            // 프론트매터가 최신 상태인지 확인
                            const isUpToDate = isFrontMatterUpToDate(
                                content,
                                fullPath,
                                vaultName,
                                vaultPath,
                                mapping.externalPath
                            );
                            
                            // 최신 상태가 아닌 경우에만 업데이트
                            if (!isUpToDate) {
                                console.log(`[External Watcher] 프론트매터 업데이트 필요: ${fullPath}`);
                                
                                // 프론트매터 추가
                                const updatedContent = addOriginPathFrontMatter(
                                    content, 
                                    fullPath,
                                    vaultName,
                                    vaultPath,
                                    mapping.externalPath
                                );
                                
                                // 내용이 변경된 경우에만 파일 다시 쓰기
                                if (content !== updatedContent) {
                                    console.log(`[External Watcher] 프론트매터 추가/업데이트, 파일 쓰기 시작: ${fullPath}`);
                                    fs.writeFileSync(fullPath, updatedContent, 'utf8');
                                    console.log(`[External Watcher] 프론트매터 추가 완료: ${fullPath}`);
                                } else {
                                    console.log(`[External Watcher] 내용 변경 없음, 파일 쓰기 생략: ${fullPath}`);
                                }
                            } else {
                                console.log(`[External Watcher] 프론트매터가 이미 최신 상태임: ${fullPath}`);
                            }
                        } catch (err) {
                            console.error(`[External Watcher] 프론트매터 처리 오류: ${err.message}\n${err.stack}`);
                        }
                    } else {
                        console.log(`[External Watcher] 마크다운 파일 아님 또는 자동 처리 비활성화됨: ${fullPath}, 확장자: ${path.extname(fullPath)}`);
                    }
                    
                    // 파일인 경우 내용의 처음 100바이트 출력 (내용 확인용)
                    if (!isDirectory && stats.size > 0 && stats.size < 10000) {
                        try {
                            const content = fs.readFileSync(fullPath, { encoding: 'utf8' });
                            const preview = content.length > 100 ? content.substring(0, 100) + '...' : content;
                            console.log(`[External Watcher] 파일 내용 미리보기: ${preview}`);
                        } catch (error) {
                            console.error(`[External Watcher] 파일 내용 읽기 오류: ${error}`);
                        }
                    }
                } catch (error) {
                    console.error(`[External Watcher] 파일 정보 조회 오류: ${error}`);
                }
            }
            
            // 이벤트 타입별 처리
            let actionType = "알 수 없음";
            if (eventType === 'rename' || eventType === 'add' || eventType === 'unlink') {
                if (exists) {
                    actionType = "생성";
                    console.log(`[External Watcher] ${fileDetails} 생성됨: ${filename}`);
                } else {
                    actionType = "삭제";
                    console.log(`[External Watcher] 항목 삭제됨: ${filename}`);
                }
            } else if (eventType === 'change') {
                actionType = "수정";
                console.log(`[External Watcher] 파일 수정됨: ${filename}`);
            }
            
            // 대응하는 Vault 파일 경로 계산
            const relativePath = filename;
            const vaultPath = path.join(mapping.vaultPath, relativePath);
            console.log(`[External Watcher] 대응하는 Vault 경로: ${vaultPath}`);
            
            // Show toast notification based on event type
            if (this.showNotifications) {
                let notificationMessage = `${actionType}: ${filename}`;
                new Notice(notificationMessage);
                console.log(`[External Watcher] 알림 표시: ${notificationMessage}`);
            }
            
            // Log the change
            this.log(`External change detected - Type: ${eventType}, File: ${filename}, Action: ${actionType}`);

            // 핸들러 맵 디버그 로깅 (항상 출력)
            console.log(`[External Watcher] 🔍 디버그 - 매핑 ID: ${mapping.id}`);
            console.log(`[External Watcher] 🔍 디버그 - 등록된 핸들러 키: ${Array.from(this.syncHandlers.keys()).join(', ')}`);
            console.log(`[External Watcher] 🔍 디버그 - 핸들러 등록 여부: ${this.syncHandlers.has(mapping.id) ? '있음' : '없음'}`);
            console.log(`[External Watcher] 🔍 디버그 - 등록된 핸들러 수: ${this.syncHandlers.size}`);

            // 동기화 핸들러 호출
            try {
                console.log(`[External Watcher] 🔄 동기화 핸들러 호출 시작 (${mapping.id}): ${eventType}, ${filename}, ${fullPath}`);
                const syncHandler = this.syncHandlers.get(mapping.id);
                
                if (syncHandler) {
                    console.log(`[External Watcher] 📣 동기화 핸들러 발견, 호출 중... ID: ${mapping.id}`);
                    console.log(`[External Watcher] 📊 동기화 핸들러 수: ${this.syncHandlers.size}, 매핑 경로: ${mapping.externalPath}`);
                    
                    // 직접 핸들러 호출 (비동기 지연 제거)
                    syncHandler(eventType, filename, fullPath);
                    console.log(`[External Watcher] ✅ 동기화 핸들러 호출 완료`);
                } else {
                    console.log(`[External Watcher] ⚠️ 동기화 핸들러가 등록되지 않음: ${mapping.id}`);
                    console.log(`[External Watcher] 📊 등록된 핸들러 정보: 수=${this.syncHandlers.size}, 키=${Array.from(this.syncHandlers.keys()).join(', ')}`);
                }
            } catch (error) {
                console.error(`[External Watcher] ❌ 동기화 핸들러 호출 오류:`, error);
                if (error instanceof Error) {
                    console.error(`[External Watcher] 오류 내용: ${error.message}`);
                    console.error(`[External Watcher] 오류 스택: ${error.stack}`);
                }
            }
        } finally {
            // 파일 처리 완료 표시 (무한 루프 방지)
            this.processingFiles.delete(fullPath);
        }
    }
    
    /**
     * Show a toast notification for file changes
     */
    private showChangeNotification(eventType: string, filename: string, mapping: FolderMapping): void {
        if (!this.showNotifications) {
            return; // Skip notifications if they're disabled
        }
        
        let message = '';
        let exists = false;
        
        try {
            // Check if the file/folder still exists (to determine if it was deleted)
            const fullPath = path.join(mapping.externalPath, filename);
            exists = fs.existsSync(fullPath);
            
            // Determine if it's a file or directory
            let isDirectory = false;
            if (exists) {
                isDirectory = fs.statSync(fullPath).isDirectory();
            }
            
            // Create appropriate message based on event type and item type
            if (eventType === 'rename') {
                if (exists) {
                    // Item was created
                    message = `${isDirectory ? 'Folder' : 'File'} created: ${filename}`;
                } else {
                    // Item was deleted
                    message = `${isDirectory ? 'Folder' : 'File'} deleted: ${filename}`;
                }
            } else if (eventType === 'change') {
                message = `${isDirectory ? 'Folder' : 'File'} changed: ${filename}`;
            }
            
            // Show notification
            if (this.showNotifications) {
                new Notice(message);
                console.log(`[External Watcher] 알림 표시: ${message}`);
            }
        } catch (error) {
            console.error(`[External Watcher] 알림 표시 오류: ${error}`);
        }
    }

    /**
     * Utility method for logging
     */
    private log(message: string, isError: boolean = false): void {
        if (this.debugMode || isError) {
            const prefix = isError ? '❌ ERROR:' : '📥';
            console.log(`[External Watcher] ${prefix} ${message}`);
        }
    }

    /**
     * 등록된 매핑 정보 반환
     * @returns 매핑 정보 Map 객체
     */
    public getMappings(): Map<string, FolderMapping> {
        return this.mappings;
    }

    /**
     * 마크다운 파일 처리 - 프론트매터 추가 등
     * @param fullPath 파일 전체 경로
     * @param basePath 기준 경로
     * @param relativePath 상대 경로
     * @returns 처리 여부
     */
    public processMarkdownFile(fullPath: string, basePath: string, relativePath: string): boolean {
        console.log(`[External Watcher] 마크다운 파일 처리: ${fullPath}`);
        
        try {
            // 임시 파일 체크
            if (this.isTemporaryFile(fullPath)) {
                console.log(`[External Watcher] 임시 파일로 판단, 처리 생략: ${fullPath}`);
                return false;
            }
            
            // 파일 존재 확인
            if (!fs.existsSync(fullPath)) {
                console.log(`[External Watcher] 파일이 존재하지 않음: ${fullPath}`);
                return false;
            }
            
            // 파일 정보 가져오기
            const stats = fs.statSync(fullPath);
            if (!stats.isFile()) {
                console.log(`[External Watcher] 파일이 아님, 디렉토리: ${fullPath}`);
                return false;
            }
            
            // 파일 내용 읽기
            const content = fs.readFileSync(fullPath, 'utf8');
            
            // vault 이름 가져오기 
            const vaultName = this.app.vault.getName();
            
            // vault 내 상대 경로 계산 (매핑 기반)
            let vaultPath = '';
            for (const [id, mapping] of this.mappings.entries()) {
                if (fullPath.startsWith(mapping.externalPath)) {
                    const relPath = fullPath.substring(mapping.externalPath.length);
                    vaultPath = path.join(mapping.vaultPath, relPath).replace(/\\/g, '/');
                    break;
                }
            }
            
            // 프론트매터가 최신 상태인지 확인
            const isUpToDate = isFrontMatterUpToDate(
                content,
                fullPath,
                vaultName,
                vaultPath,
                basePath
            );
            
            // 최신 상태가 아닌 경우에만 업데이트
            if (!isUpToDate) {
                console.log(`[External Watcher] 프론트매터 업데이트 필요: ${fullPath}`);
                
                // 프론트매터 추가 처리
                const updatedContent = addOriginPathFrontMatter(
                    content, 
                    fullPath,
                    vaultName,
                    vaultPath,
                    basePath
                );
                
                // 수정된 경우만 파일 쓰기
                if (updatedContent !== content) {
                    console.log(`[External Watcher] 프론트매터 추가/업데이트 후 파일 저장: ${fullPath}`);
                    fs.writeFileSync(fullPath, updatedContent, 'utf8');
                    return true;
                } else {
                    console.log(`[External Watcher] 내용 변경 없음, 파일 쓰기 생략: ${fullPath}`);
                    return false;
                }
            } else {
                console.log(`[External Watcher] 프론트매터가 이미 최신 상태임: ${fullPath}`);
                return false;
            }
        } catch (error) {
            console.error(`[External Watcher] 마크다운 파일 처리 오류: ${error}`);
            return false;
        }
    }

    /**
     * 임시 파일인지 확인
     * @param filePath 파일 경로
     * @returns 임시 파일 여부
     */
    private isTemporaryFile(filePath: string): boolean {
        // 파일명만 추출
        const fileName = path.basename(filePath);
        
        // 일반적인 임시 파일 패턴 체크
        const tempPatterns = [
            /^~/, // 틸드로 시작하는 백업 파일
            /\.tmp$/i, // .tmp 확장자
            /\.temp$/i, // .temp 확장자
            /^\.#/, // .#으로 시작하는 락 파일
            /#.*#$/, // #로 둘러싸인 자동 저장 파일
            /\.bak$/i, // .bak 확장자
            /\.swp$/i, // vim 스왑 파일
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.md$/i, // UUID 형태 임시 파일
        ];
        
        return tempPatterns.some(pattern => pattern.test(fileName));
    }
}