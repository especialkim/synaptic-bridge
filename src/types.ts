/**
 * 폴더 매핑 인터페이스
 * 외부 폴더와 Vault 폴더 간의 매핑 정보를 정의합니다.
 */
export interface FolderMapping {
    /** 매핑의 고유 식별자 (UUID) */
    id: string;
    /** Vault 내 상대 경로 */
    vaultPath: string;
    /** 외부 폴더 절대 경로 */
    externalPath: string;
    /** 매핑 활성화 여부 */
    enabled: boolean;
}

/**
 * 플러그인 설정 인터페이스
 * 플러그인의 모든 설정 옵션을 정의합니다.
 */
export interface MarkdownHijackerSettings {
    /** 플러그인 전체 활성화 여부 */
    pluginEnabled: boolean;
    /** 폴더 매핑 목록 */
    folderMappings: FolderMapping[];
    
    /** 제외할 서브폴더 옵션 활성화 여부 */
    excludeFoldersEnabled: boolean;
    /** 제외할 서브폴더 목록 (콤마 구분) */
    excludeFolders: string;
    
    /** 포함할 서브폴더 옵션 활성화 여부 */
    includeFoldersEnabled: boolean;
    /** 포함할 서브폴더 목록 (콤마 구분) */
    includeFolders: string;
    
    /** 동기화 확인 간격 (밀리초) */
    syncInterval: number;
    /** 디버그 모드 활성화 여부 */
    debugMode: boolean;
    /** 외부 폴더 동기화 활성화 여부 */
    enableExternalSync: boolean;
    /** 변경 알림 표시 여부 */
    showNotifications: boolean;
    /** 내부 변경 동기화 활성화 여부 */
    enableVaultSync: boolean;
}

/**
 * 기본 설정값 정의
 * 플러그인이 처음 로드될 때 사용되는 기본 설정입니다.
 */
export const DEFAULT_SETTINGS: MarkdownHijackerSettings = {
    pluginEnabled: false,
    folderMappings: [],
    excludeFoldersEnabled: false,
    excludeFolders: "",
    includeFoldersEnabled: false,
    includeFolders: "",
    syncInterval: 1000,    // 1초
    debugMode: false,
    enableExternalSync: false,
    showNotifications: true,
    enableVaultSync: false
} 