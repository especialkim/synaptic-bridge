import { App, Notice, TFile, Vault, TFolder } from 'obsidian';
import { FolderMapping } from '../../settings';

// SyncHandler 타입 정의 - external-watcher와 동일한 형태로 유지
export type SyncHandler = (eventType: string, file: TFile) => void;

// 폴더 핸들러 타입 - 폴더 이벤트 처리용
export type FolderSyncHandler = (eventType: string, folderPath: string) => void;

export class InternalWatcher {
    private app: App;
    private vault: Vault;
    private syncHandlers: Map<string, SyncHandler> = new Map();
    private folderSyncHandlers: Map<string, FolderSyncHandler> = new Map();
    private mappings: Map<string, FolderMapping> = new Map();
    private debugMode: boolean;
    private showNotifications: boolean;

    constructor(app: App, debugMode: boolean = false) {
        this.app = app;
        this.vault = app.vault;
        this.debugMode = debugMode;
        this.showNotifications = true;
        
        console.log("[Internal Watcher] 💡 Vault 내부 감시자 초기화됨");
    }

    /**
     * Vault 내부 변경 이벤트 구독 시작
     */
    public startWatching(): void {
        console.log("[Internal Watcher] 🔄 Vault 내부 변경 감시 시작");
        
        // 파일 수정 이벤트 등록
        this.vault.on('modify', (file) => {
            if (file instanceof TFile) {
                this.handleVaultFileModify(file);
            }
        });
        
        // 파일 생성 이벤트 등록
        this.vault.on('create', (file) => {
            if (file instanceof TFile) {
                this.handleVaultFileCreate(file);
            }
        });
        
        // 파일 삭제 이벤트 등록
        this.vault.on('delete', (file) => {
            if (file instanceof TFile) {
                this.handleVaultFileDelete(file);
            } else if (file instanceof TFolder) {
                this.handleVaultFolderDelete(file);
            }
        });
        
        // 파일 이름 변경 이벤트 등록
        this.vault.on('rename', (file, oldPath) => {
            if (file instanceof TFile) {
                this.handleVaultFileRename(file, oldPath);
            } else if (file instanceof TFolder) {
                this.handleVaultFolderRename(file, oldPath);
            }
        });
        
        console.log("[Internal Watcher] ✅ Vault 이벤트 구독 설정 완료");
    }

    /**
     * Vault 내부 변경 이벤트 구독 중지
     */
    public stopWatching(): void {
        console.log("[Internal Watcher] 🛑 Vault 내부 변경 감시 중지");
        
        // Vault 이벤트 구독 제거 - 이벤트 유형만 지정하면 해당 유형의 모든 리스너 제거
        try {
            // Obsidian API 특성상 모든 리스너를 제거하려면 이벤트 타입과 함께 함수를 전달해야 함
            // 빈 함수를 전달하는 대신 문서화로 설명
            console.log("[Internal Watcher] ⚠️ 이벤트 구독 제거는 모든 리스너를 제거하지 않을 수 있음");
            console.log("[Internal Watcher] 💡 Obsidian API 재시작 시 자동으로 모든 리스너가 정리됨");
        } catch (error) {
            console.error("[Internal Watcher] ❌ 이벤트 구독 제거 오류:", error);
        }
    }

    /**
     * 매핑 폴더 추가
     * @param mapping 폴더 매핑 정보
     */
    public addMapping(mapping: FolderMapping): void {
        console.log(`[Internal Watcher] 📂 매핑 추가: ID=${mapping.id}, 경로=${mapping.vaultPath}`);
        this.mappings.set(mapping.id, mapping);
    }

    /**
     * 매핑 폴더 제거
     * @param mappingId 매핑 ID
     */
    public removeMapping(mappingId: string): void {
        console.log(`[Internal Watcher] 🗑️ 매핑 제거: ID=${mappingId}`);
        this.mappings.delete(mappingId);
    }

    /**
     * 모든 매핑 폴더 제거
     */
    public removeAllMappings(): void {
        console.log(`[Internal Watcher] 🧹 모든 매핑 제거`);
        this.mappings.clear();
    }

    /**
     * 동기화 핸들러 등록
     * @param mapping 폴더 매핑 정보
     * @param handler 핸들러 함수
     */
    public registerSyncHandler(mapping: FolderMapping, handler: SyncHandler): void {
        console.log(`[Internal Watcher] 🔌 동기화 핸들러 등록: 매핑 ID=${mapping.id}, 경로=${mapping.vaultPath}`);
        this.syncHandlers.set(mapping.id, handler);
        
        // 핸들러 등록 확인 (디버깅용)
        const registeredHandler = this.syncHandlers.get(mapping.id);
        console.log(`[Internal Watcher] 🔌 동기화 핸들러 등록 확인: ${registeredHandler ? '성공' : '실패'}`);
    }

    /**
     * 파일이 매핑된 폴더에 속하는지 확인
     * @param file 확인할 파일
     * @returns 파일이 속한 매핑 정보 또는 null
     */
    private isMappedFile(file: TFile): { mapping: FolderMapping, id: string } | null {
        const filePath = file.path;
        console.log(`[Internal Watcher] 🔍 파일 매핑 확인: ${filePath}`);
        
        for (const [id, mapping] of this.mappings.entries()) {
            // 파일 경로가 매핑된 Vault 폴더로 시작하는지 확인
            if (filePath.startsWith(mapping.vaultPath + '/') || filePath === mapping.vaultPath) {
                console.log(`[Internal Watcher] ✅ 매핑된 파일 발견: ${filePath} in ${mapping.vaultPath}, 매핑 ID=${id}`);
                return { mapping, id };
            }
        }
        
        console.log(`[Internal Watcher] ❌ 매핑되지 않은 파일: ${filePath}`);
        return null;
    }

    /**
     * Vault 파일 수정 이벤트 처리
     * @param file 수정된 파일
     */
    private handleVaultFileModify(file: TFile): void {
        console.log(`[Internal Watcher] 📄 파일 수정 감지: ${file.path}`);
        
        // 매핑된 파일인지 확인
        const mappingInfo = this.isMappedFile(file);
        if (!mappingInfo) return;
        
        // 동기화 핸들러 호출
        const { mapping, id } = mappingInfo;
        const handler = this.syncHandlers.get(id);
        
        if (handler) {
            console.log(`[Internal Watcher] 🔄 동기화 핸들러 호출: 'modify', ${file.path}`);
            handler('modify', file);
            
            if (this.showNotifications) {
                new Notice(`✏️ 내부 파일 수정: ${file.name}`);
            }
        } else {
            console.log(`[Internal Watcher] ⚠️ 핸들러 없음: ${id}`);
        }
    }

    /**
     * Vault 파일 생성 이벤트 처리
     * @param file 생성된 파일
     */
    private handleVaultFileCreate(file: TFile): void {
        console.log(`[Internal Watcher] 📄 파일 생성 감지: ${file.path}`);
        
        // 매핑된 파일인지 확인
        const mappingInfo = this.isMappedFile(file);
        if (!mappingInfo) return;
        
        // 동기화 핸들러 호출
        const { mapping, id } = mappingInfo;
        const handler = this.syncHandlers.get(id);
        
        if (handler) {
            console.log(`[Internal Watcher] 🔄 동기화 핸들러 호출: 'create', ${file.path}`);
            handler('create', file);
            
            if (this.showNotifications) {
                new Notice(`📝 내부 파일 생성: ${file.name}`);
            }
        } else {
            console.log(`[Internal Watcher] ⚠️ 핸들러 없음: ${id}`);
        }
    }

    /**
     * Vault 파일 삭제 이벤트 처리
     * @param file 삭제된 파일
     */
    private handleVaultFileDelete(file: TFile): void {
        console.log(`[Internal Watcher] 📄 파일 삭제 감지: ${file.path}`);
        
        // 매핑된 파일인지 확인
        const mappingInfo = this.isMappedFile(file);
        if (!mappingInfo) return;
        
        // 동기화 핸들러 호출
        const { mapping, id } = mappingInfo;
        const handler = this.syncHandlers.get(id);
        
        if (handler) {
            console.log(`[Internal Watcher] 🔄 동기화 핸들러 호출: 'delete', ${file.path}`);
            handler('delete', file);
            
            if (this.showNotifications) {
                new Notice(`🗑️ 내부 파일 삭제: ${file.name}`);
            }
        } else {
            console.log(`[Internal Watcher] ⚠️ 핸들러 없음: ${id}`);
        }
    }

    /**
     * Vault 파일 이름 변경 이벤트 처리
     * @param file 이름이 변경된 파일
     * @param oldPath 이전 경로
     */
    private handleVaultFileRename(file: TFile, oldPath: string): void {
        console.log(`[Internal Watcher] 📄 파일 이름 변경 감지: ${oldPath} -> ${file.path}`);
        
        // 매핑된 파일인지 확인 (새 경로 또는 이전 경로 둘 중 하나라도 매핑되면 처리)
        const mappingInfo = this.isMappedFile(file);
        if (!mappingInfo) {
            console.log(`[Internal Watcher] 🔍 이전 경로 확인 중: ${oldPath}`);
            
            // 이전 경로가 매핑된 폴더인지 확인
            for (const [id, mapping] of this.mappings.entries()) {
                if (oldPath.startsWith(mapping.vaultPath + '/') || oldPath === mapping.vaultPath) {
                    const handler = this.syncHandlers.get(id);
                    if (handler) {
                        console.log(`[Internal Watcher] 🔄 이전 매핑에서 동기화 핸들러 호출: 'rename', ${file.path}, 이전=${oldPath}`);
                        // 파일 객체에 이전 경로 정보 추가
                        (file as any).oldPath = oldPath;
                        handler('rename', file);
                        
                        if (this.showNotifications) {
                            new Notice(`📋 내부 파일 이동: ${file.name}`);
                        }
                    }
                    return;
                }
            }
            return;
        }
        
        // 동기화 핸들러 호출
        const { mapping, id } = mappingInfo;
        const handler = this.syncHandlers.get(id);
        
        if (handler) {
            console.log(`[Internal Watcher] 🔄 동기화 핸들러 호출: 'rename', ${file.path}, 이전=${oldPath}`);
            // 파일 객체에 이전 경로 정보 추가
            (file as any).oldPath = oldPath;
            handler('rename', file);
            
            if (this.showNotifications) {
                new Notice(`📋 내부 파일 이름 변경: ${file.name}`);
            }
        } else {
            console.log(`[Internal Watcher] ⚠️ 핸들러 없음: ${id}`);
        }
    }

    /**
     * Vault 폴더 삭제 이벤트 처리
     * @param folder 삭제된 폴더
     */
    private handleVaultFolderDelete(folder: TFolder): void {
        console.log(`[Internal Watcher] 📁 폴더 삭제 감지: ${folder.path}`);
        
        // 매핑된 폴더인지 확인
        const mappingInfo = this.isMappedFolder(folder);
        if (!mappingInfo) return;
        
        // 파일 핸들러 호출 - 폴더를 파일처럼 처리
        // 현재 구조에서는 파일 핸들러를 활용 (폴더 삭제를 파일 삭제와 유사하게 처리)
        const { mapping, id } = mappingInfo;
        const handler = this.syncHandlers.get(id);
        
        if (handler) {
            console.log(`[Internal Watcher] 🔄 동기화 핸들러 호출: 'deleteDir', ${folder.path}`);
            // 폴더 객체를 파일 객체로 취급하고 경로를 유지
            const folderAsTFile = { path: folder.path } as TFile;
            handler('deleteDir', folderAsTFile);
            
            if (this.showNotifications) {
                new Notice(`🗑️ 내부 폴더 삭제: ${folder.name}`);
            }
        } else {
            console.log(`[Internal Watcher] ⚠️ 핸들러 없음: ${id}`);
        }
    }
    
    /**
     * Vault 폴더 이름 변경 이벤트 처리
     * @param folder 이름이 변경된 폴더
     * @param oldPath 이전 경로
     */
    private handleVaultFolderRename(folder: TFolder, oldPath: string): void {
        console.log(`[Internal Watcher] 📁 폴더 이름 변경 감지: ${oldPath} -> ${folder.path}`);
        
        // 매핑된 폴더인지 확인 (새 경로 또는 이전 경로 둘 중 하나라도 매핑되면 처리)
        const mappingInfo = this.isMappedFolder(folder);
        if (!mappingInfo) {
            console.log(`[Internal Watcher] 🔍 이전 경로 확인 중: ${oldPath}`);
            
            // 이전 경로가 매핑된 폴더인지 확인
            for (const [id, mapping] of this.mappings.entries()) {
                if (oldPath.startsWith(mapping.vaultPath + '/') || oldPath === mapping.vaultPath) {
                    const handler = this.syncHandlers.get(id);
                    if (handler) {
                        console.log(`[Internal Watcher] 🔄 이전 매핑에서 동기화 핸들러 호출: 'renameDir', ${folder.path}, 이전=${oldPath}`);
                        // 파일로 취급
                        const folderAsTFile = { path: folder.path } as TFile;
                        (folderAsTFile as any).oldPath = oldPath;
                        handler('renameDir', folderAsTFile);
                        
                        if (this.showNotifications) {
                            new Notice(`📋 내부 폴더 이동: ${folder.name}`);
                        }
                    }
                    return;
                }
            }
            return;
        }
        
        // 동기화 핸들러 호출
        const { mapping, id } = mappingInfo;
        const handler = this.syncHandlers.get(id);
        
        if (handler) {
            console.log(`[Internal Watcher] 🔄 동기화 핸들러 호출: 'renameDir', ${folder.path}, 이전=${oldPath}`);
            // 파일로 취급
            const folderAsTFile = { path: folder.path } as TFile;
            (folderAsTFile as any).oldPath = oldPath;
            handler('renameDir', folderAsTFile);
            
            if (this.showNotifications) {
                new Notice(`📋 내부 폴더 이름 변경: ${folder.name}`);
            }
        } else {
            console.log(`[Internal Watcher] ⚠️ 핸들러 없음: ${id}`);
        }
    }
    
    /**
     * 폴더가 매핑된 폴더에 속하는지 확인
     * @param folder 확인할 폴더
     * @returns 폴더가 속한 매핑 정보 또는 null
     */
    private isMappedFolder(folder: TFolder): { mapping: FolderMapping, id: string } | null {
        const folderPath = folder.path;
        console.log(`[Internal Watcher] 🔍 폴더 매핑 확인: ${folderPath}`);
        
        for (const [id, mapping] of this.mappings.entries()) {
            // 폴더 경로가 매핑된 Vault 폴더로 시작하는지 확인
            if (folderPath.startsWith(mapping.vaultPath + '/') || folderPath === mapping.vaultPath) {
                console.log(`[Internal Watcher] ✅ 매핑된 폴더 발견: ${folderPath} in ${mapping.vaultPath}, 매핑 ID=${id}`);
                return { mapping, id };
            }
        }
        
        console.log(`[Internal Watcher] ❌ 매핑되지 않은 폴더: ${folderPath}`);
        return null;
    }

    /**
     * 로그 출력
     * @param message 로그 메시지
     * @param isError 오류 여부
     */
    private log(message: string, isError: boolean = false): void {
        if (this.debugMode || isError) {
            const prefix = isError ? '❌ 오류:' : '📝';
            console.log(`[Internal Watcher] ${prefix} ${message}`);
        }
    }
} 