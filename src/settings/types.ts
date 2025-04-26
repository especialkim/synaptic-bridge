export enum SyncType {
	externalToVault = "external-to-vault",     // 외부 → Vault
	vaultToExternal = "vault-to-external",     // Vault → 외부
	bidirectional = "bidirectional"            // 양방향 동기화
}

export enum BidirectionalType {
	merge = "merge",
	externalPriority = "external-priority",
	internalPriority = "internal-priority"
}

export enum DeletedFileAction {
	property = "property",
	delete = "delete"
}

// 개별 폴더 연결 설정
export interface FolderConnectionSettings {
	id: string;                     // 고유 식별자 (UUID 등)
	name: string;                   // 매핑 이름 (사용자가 구분하기 위함)
	internalPath: string;              // Vault 내부 경로 (상대 경로)
	externalPath: string;           // 외부 폴더의 절대 경로
	syncType: SyncType;             // 동기화 방향 설정
	bidirectionalType: BidirectionalType; // 양방향 스냅샷 재조정(reconcile) 방식
	deletedFileAction: DeletedFileAction; // 삭제된 파일 처리 방식
	ignoreHiddenFiles: boolean;     // 숨김 파일/폴더 무시 여부
	excludeFolders: string[];       // 제외할 폴더 목록 (이름 기준)
	includeFolders: string[];       // 포함할 폴더 목록 (선택 시 제외 목록 무시)
	extensions: string[];           // 대상 확장자 목록 (예: .md, .txt)
	syncEnabled: boolean;           // 이 매핑의 동기화 활성화 여부
};

// 전체 플러그인 설정
export interface MarkdownHijackerSettings {
	enableGlobalSync: boolean;           // 전체 동기화 토글 (마스터 스위치)
	syncInterval: number;                // 동기화 간격 (밀리초 단위)
	debugMode: boolean;                  // 디버그 모드 (콘솔 로그 출력용)
	showStatusBar: boolean;              // 상태 바 표시 여부
	connections: FolderConnectionSettings[];         // 폴더 동기화 매핑 목록
}; 