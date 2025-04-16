import { App, Notice, TFile } from 'obsidian';
import * as fs from 'fs';
import * as path from 'path';
import { FSWatcher } from 'fs';
import { FolderMapping } from '../../settings';
import { addOriginPathFrontMatter } from '../../src/utils/frontmatter-utils';

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

export class ExternalFolderWatcher {
    private app: App;
    private watchers: Map<string, FSWatcher | any> = new Map();
    private debugMode: boolean;
    private showNotifications: boolean;

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
        try {
            console.log(`[External Watcher] setupWatcher 호출됨 - 경로: ${mapping.externalPath}`);
            
            // Store the notification preference
            this.showNotifications = showNotifications;
            
            // Remove existing watcher if any
            this.removeWatcher(mapping.id);
            
            // Check if external folder exists
            if (!fs.existsSync(mapping.externalPath)) {
                this.log(`External folder does not exist: ${mapping.externalPath}`, true);
                if (this.showNotifications) {
                    new Notice(`External folder not found: ${mapping.externalPath}`);
                }
                return false;
            }
            
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
                    const filename = path.replace(mapping.externalPath + '/', '');
                    changeHandler('add', filename);
                });
                
                watcher.on('change', (path: string) => {
                    console.log(`[External Watcher] 파일 변경됨: ${path}`);
                    const filename = path.replace(mapping.externalPath + '/', '');
                    changeHandler('change', filename);
                });
                
                watcher.on('unlink', (path: string) => {
                    console.log(`[External Watcher] 파일 삭제됨: ${path}`);
                    const filename = path.replace(mapping.externalPath + '/', '');
                    changeHandler('unlink', filename);
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
                        console.log(`[External Watcher] fs.watch 이벤트 발생: ${eventType}, ${filename}`);
                        changeHandler(eventType, filename);
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
                if (!isDirectory && fullPath.toLowerCase().endsWith('.md')) {
                    console.log(`[External Watcher] 마크다운 파일 감지, 프론트매터 추가 시도: ${fullPath}`);
                    
                    try {
                        // 직접 파일 내용 읽기
                        const content = fs.readFileSync(fullPath, 'utf8');
                        console.log(`[External Watcher] 파일 내용 읽기 성공: ${content.substring(0, Math.min(50, content.length))}...`);
                        
                        // 프론트매터 추가
                        const updatedContent = addOriginPathFrontMatter(content, fullPath);
                        
                        // 내용이 변경된 경우에만 파일 다시 쓰기
                        if (content !== updatedContent) {
                            console.log(`[External Watcher] 프론트매터 추가/업데이트, 파일 쓰기 시작: ${fullPath}`);
                            fs.writeFileSync(fullPath, updatedContent, 'utf8');
                            console.log(`[External Watcher] 프론트매터 추가 완료: ${fullPath}`);
                        } else {
                            console.log(`[External Watcher] 내용 변경 없음, 파일 쓰기 생략: ${fullPath}`);
                        }
                    } catch (err) {
                        console.error(`[External Watcher] 프론트매터 처리 오류: ${err.message}\n${err.stack}`);
                    }
                } else {
                    console.log(`[External Watcher] 마크다운 파일 아님, 처리 생략: ${fullPath}, 확장자: ${path.extname(fullPath)}`);
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
                    message = `Item deleted: ${filename}`;
                }
            } else if (eventType === 'change') {
                message = `File modified: ${filename}`;
            }
            
            // Show the notification
            new Notice(message);
        } catch (error) {
            this.log(`Error showing notification: ${error}`, true);
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
     * 마크다운 파일에 originPath 프론트매터 추가
     * @param filePath 파일 전체 경로
     * @param basePath 외부 폴더 기본 경로
     * @param relativePath 기본 경로에서의 상대 경로
     */
    private addFrontMatterToMarkdownFile(filePath: string, basePath: string, relativePath: string): void {
        try {
            console.log(`[External Watcher] 프론트매터 추가 시도: ${filePath}`);
            
            // 파일 내용 읽기
            const content = fs.readFileSync(filePath, 'utf8');
            console.log(`[External Watcher] 파일 내용 읽기 성공: ${filePath}, 길이: ${content.length}`);
            
            // 현재 프론트매터 확인
            const hasFM = content.startsWith('---');
            console.log(`[External Watcher] 기존 프론트매터 존재 여부: ${hasFM}`);
            
            // originPath에 추가할 값 (경로 구분자 일관성을 위해 정규화)
            // 경로 구분자 일관화 - 모든 백슬래시를 슬래시로 변환
            let normalizedPath = relativePath.replace(/\\/g, '/');
            if (normalizedPath.startsWith('/')) {
                normalizedPath = normalizedPath.substring(1);
            }
            
            // 전체 경로도 정규화
            const originPathValue = path.normalize(path.join(basePath, normalizedPath)).replace(/\\/g, '/');
            console.log(`[External Watcher] originPath 값: ${originPathValue}`);
            
            // 현재 내용 출력 (디버깅용)
            console.log(`[External Watcher] 현재 내용 시작 부분: ${content.substring(0, Math.min(100, content.length))}`);
            
            // 프론트매터 추가
            const updatedContent = addOriginPathFrontMatter(content, originPathValue);
            console.log(`[External Watcher] 수정된 내용 시작 부분: ${updatedContent.substring(0, Math.min(100, updatedContent.length))}`);
            
            // 내용 비교
            const isChanged = content !== updatedContent;
            console.log(`[External Watcher] 내용 변경됨: ${isChanged}`);
            
            // 내용이 변경된 경우에만 파일 다시 쓰기
            if (isChanged) {
                // 파일 쓰기 전 디버깅
                console.log(`[External Watcher] 파일에 업데이트된 내용 쓰기 시작...`);
                
                fs.writeFileSync(filePath, updatedContent, 'utf8');
                console.log(`[External Watcher] 프론트매터 추가됨: ${filePath}`);
                
                // 파일 다시 읽어서 제대로 적용되었는지 확인
                const verifyContent = fs.readFileSync(filePath, 'utf8');
                const verifyHasFrontMatter = verifyContent.match(/originPath:\s*(.+)/);
                console.log(`[External Watcher] 검증 - originPath 확인: ${verifyHasFrontMatter ? '성공' : '실패'}`);
                
                this.log(`Added frontmatter to: ${filePath}`);
            } else {
                console.log(`[External Watcher] 변경 사항 없음, 파일 쓰기 건너뜀`);
            }
        } catch (error) {
            console.error(`[External Watcher] 프론트매터 추가 오류: ${error}`);
            console.error(`[External Watcher] 오류 스택: ${error.stack}`);
            this.log(`Failed to add frontmatter: ${error}`, true);
        }
    }

    /**
     * 외부에서 호출 가능한 마크다운 파일 처리 메서드
     * @param filePath 파일 전체 경로
     * @param basePath 외부 폴더 기본 경로
     * @param relativePath 기본 경로에서의 상대 경로
     */
    public processMarkdownFile(filePath: string, basePath: string, relativePath: string): void {
        // 파일 존재 확인
        if (!fs.existsSync(filePath)) {
            console.log(`[External Watcher] 파일이 존재하지 않음: ${filePath}`);
            return;
        }
        
        // 마크다운 파일인지 확인
        if (!filePath.toLowerCase().endsWith('.md')) {
            console.log(`[External Watcher] 마크다운 파일이 아님: ${filePath}`);
            return;
        }
        
        // 프론트매터 추가 처리
        this.addFrontMatterToMarkdownFile(filePath, basePath, relativePath);
    }
} 