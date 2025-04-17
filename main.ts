import { Plugin, Notice, TFile, EventRef, Events, App, TFolder, TAbstractFile } from 'obsidian';
import * as fs from 'fs';
import { FSWatcher } from 'fs';
import { 
	MarkdownHijackerSettings, 
	DEFAULT_SETTINGS, 
	MarkdownHijackerSettingTab,
	FolderMapping
} from './settings';
import { ExternalFolderWatcher } from './src/watchers/external-watcher';
import { InternalWatcher } from './src/watchers/internal-watcher';
import * as path from 'path';
import { ExternalSync } from './src/sync/external-sync';
import { InternalSync } from './src/sync/internal-sync';
import { VaultSync } from './src/sync/vault-sync';

// 이벤트 타입 확장
declare module 'obsidian' {
	interface Workspace extends Events {
		on(name: 'markdown-hijacker:settings-changed', callback: () => any): EventRef;
		trigger(name: 'markdown-hijacker:settings-changed'): void;
	}
}

// Extend the settings interface with new properties for external sync
// This allows us to add new settings without modifying the original file
declare module './settings' {
	interface MarkdownHijackerSettings {
		enableExternalSync: boolean;    // 외부 폴더 동기화 활성화 여부
		enableVaultSync: boolean;       // Vault 내부 동기화 활성화 여부
		showNotifications: boolean;     // 알림 표시 여부
	}
}

// Add default values for our new settings
const ADDITIONAL_DEFAULT_SETTINGS = {
	enableExternalSync: true,
	enableVaultSync: false,   // 기본값은 비활성화로 설정
	showNotifications: true
};

export default class MarkdownHijacker extends Plugin {
	settings: MarkdownHijackerSettings;
	
	// 파일 모니터링 관련 객체들
	fileWatchers: Map<string, FSWatcher> = new Map();
	vaultEventRefs: EventRef[] = [];
	
	// 동기화 관리
	syncInProgress: boolean = false;
	lastSyncTime: number = 0;
	monitoringExternalChanges: boolean = false;
	monitoringInternalChanges: boolean = false;
	watchers: Map<string, fs.FSWatcher> = new Map();
	externalWatcher: ExternalFolderWatcher;
	internalWatcher: InternalWatcher;
	private vaultSync: VaultSync;
	private externalSync: ExternalSync;
	private internalSync: InternalSync;

	async onload() {
		console.log('MarkdownHijacker plugin loaded');
		
		// 설정 로드
		await this.loadSettings();
		console.log(`[Markdown Hijacker] 플러그인 설정 로드됨 - 외부 동기화: ${this.settings.enableExternalSync ? '예' : '아니오'}, Vault 동기화: ${this.settings.enableVaultSync ? '예' : '아니오'}, 플러그인 활성화: ${this.settings.pluginEnabled ? '예' : '아니오'}`);
		
		// 외부 폴더 감시자 초기화 (먼저 초기화해야 함)
		console.log('[Markdown Hijacker] 외부 폴더 감시자 초기화 중...');
		this.externalWatcher = new ExternalFolderWatcher(this.app, this.settings.debugMode);
		
		// 내부 Vault 감시자 초기화
		console.log('[Markdown Hijacker] 내부 Vault 감시자 초기화 중...');
		this.internalWatcher = new InternalWatcher(this.app, this.settings.debugMode);
		
		// Vault 동기화 객체 초기화
		console.log('[Markdown Hijacker] VaultSync 객체 초기화...');
		this.vaultSync = new VaultSync(this.app);
		
		console.log('[Markdown Hijacker] ExternalSync 객체 초기화...');
		this.externalSync = new ExternalSync(this, this.externalWatcher, this.vaultSync);
		
		console.log('[Markdown Hijacker] InternalSync 객체 초기화...');
		this.internalSync = new InternalSync(this.app, this.internalWatcher);
		
		// 설정 탭 추가
		this.addSettingTab(new MarkdownHijackerSettingTab(this.app, this));
		
		// 상태 바 아이템 설정
		this.setupStatusBar();
		
		// Register the file:open event
		this.registerEvent(
			this.app.workspace.on('file-open', (file: TFile | null) => {
				if (!file) return;

				const filePath = file.path;
				this.handleFileOpen(filePath);
			})
		);
		
		// 플러그인 기능 활성화 - enableExternalSync 확인 먼저!
		console.log(`[Markdown Hijacker] 외부 폴더 동기화 설정 확인 중: ${this.settings.enableExternalSync ? '활성화됨' : '비활성화됨'}`);
		console.log(`[Markdown Hijacker] Vault 내부 동기화 설정 확인 중: ${this.settings.enableVaultSync ? '활성화됨' : '비활성화됨'}`);
		
		// 플러그인이 활성화된 경우에만 모니터링 시작
		if (this.settings.pluginEnabled) {
			console.log('[Markdown Hijacker] 플러그인 활성화됨 - 모니터링 시작...');
			this.startMonitoring();
		} else {
			console.log('[Markdown Hijacker] 플러그인 비활성화됨 - 모니터링 건너뜀');
		}

		// 외부 폴더 동기화가 활성화된 경우에만 동기화 모니터링 시작
		if (this.settings.enableExternalSync) {
			console.log('[Markdown Hijacker] 외부 폴더 동기화 시작...');
			this.startMonitoringExternalChanges();
		} else {
			console.log('[Markdown Hijacker] 외부 폴더 동기화가 비활성화되어 있습니다. 설정에서 활성화하세요.');
		}
		
		// Vault 내부 동기화가 활성화된 경우에만 내부 변경 감지 시작
		if (this.settings.enableVaultSync) {
			console.log('[Markdown Hijacker] Vault 내부 변경 감지 시작...');
			this.startMonitoringInternalChanges();
		} else {
			console.log('[Markdown Hijacker] Vault 내부 동기화가 비활성화되어 있습니다. 설정에서 활성화하세요.');
		}
		
		console.log('[Markdown Hijacker] 플러그인 로드 완료');
	}

	onunload() {
		console.log('MarkdownHijacker plugin unloaded');
		// 모니터링 중지
		this.stopMonitoring();
		this.stopMonitoringExternalChanges();
		this.stopMonitoringInternalChanges();
	}
	
	// 설정 로드
	async loadSettings() {
		// Merge both default settings objects
		const mergedDefaults = Object.assign({}, DEFAULT_SETTINGS, ADDITIONAL_DEFAULT_SETTINGS);
		this.settings = Object.assign({}, mergedDefaults, await this.loadData());
	}

	// 설정 저장
	async saveSettings() {
		await this.saveData(this.settings);
	}
	
	// 상태 바 설정
	setupStatusBar() {
		const statusBarItem = this.addStatusBarItem();
		statusBarItem.setText('Markdown Hijacker: ' + 
			(this.settings.pluginEnabled ? '활성화' : '비활성화'));
		
		// 설정이 변경될 때마다 상태 바 업데이트
		this.registerEvent(
			this.app.workspace.on('markdown-hijacker:settings-changed', () => {
				statusBarItem.setText('Markdown Hijacker: ' + 
					(this.settings.pluginEnabled ? '활성화' : '비활성화'));
			})
		);
	}
	
	// 모니터링 시작
	startMonitoring() {
		this.log('모니터링 시작');
		
		// Vault 이벤트 등록
		this.registerVaultEvents();
		
		// 외부 폴더 워처 설정
		this.setupWatchers();
		
		// 초기 스캔 및 동기화
		this.initialScan();
	}
	
	// 모니터링 중지
	stopMonitoring() {
		this.log('모니터링 중지');
		
		// 외부 폴더 워처 제거
		this.removeAllWatchers();
		
		// Vault 이벤트 정리
		this.cleanupVaultEvents();
	}
	
	// 모니터링 재시작
	restartMonitoring() {
		if (this.settings.pluginEnabled) {
			this.stopMonitoring();
			this.startMonitoring();
		}
	}
	
	// Vault 이벤트 등록
	registerVaultEvents() {
		this.log('Vault 이벤트 등록');
		// Vault 이벤트는 internal-watcher에서 처리함
	}
	
	// Vault 이벤트 정리
	cleanupVaultEvents() {
		// vaultEventRefs에 등록된 모든 이벤트 정리
		this.vaultEventRefs.forEach(ref => this.app.vault.offref(ref));
		this.vaultEventRefs = [];
	}
	
	// 외부 폴더 워처 설정
	setupWatchers() {
		// 활성화된 폴더 매핑에 대해 워처 설정
		this.settings.folderMappings
			.filter(mapping => mapping.enabled)
			.forEach(mapping => this.setupWatcher(mapping));
	}
	
	// 단일 폴더 워처 설정
	setupWatcher(mapping: FolderMapping) {
		try {
			// 이미 존재하는 워처가 있으면 제거
			this.removeWatcher(mapping.id);
			
			// 외부 폴더가 존재하는지 확인
			if (!fs.existsSync(mapping.externalPath)) {
				this.log(`외부 폴더가 존재하지 않습니다: ${mapping.externalPath}`, true);
				return;
			}
			
			// fs.watch를 사용하여 외부 폴더 변경 감시
			const watcher = fs.watch(
				mapping.externalPath, 
				{ recursive: true },
				(eventType, filename) => {
					// 변경 이벤트 핸들링 (나중에 구현)
					this.handleExternalChange(mapping, eventType, filename);
				}
			);
			
			// 워처 맵에 저장
			this.fileWatchers.set(mapping.id, watcher);
			this.log(`워처 설정 완료: ${mapping.externalPath}`);
		} catch (error) {
			this.log(`워처 설정 실패: ${error}`, true);
		}
	}
	
	// 워처 제거
	removeWatcher(mappingId: string) {
		const watcher = this.fileWatchers.get(mappingId);
		if (watcher) {
			watcher.close();
			this.fileWatchers.delete(mappingId);
			this.log(`워처 제거: ${mappingId}`);
		}
	}
	
	// 모든 워처 제거
	removeAllWatchers() {
		for (const [id, watcher] of this.fileWatchers) {
			watcher.close();
		}
		this.fileWatchers.clear();
		this.log('모든 워처 제거');
	}
	
	// 초기 스캔 및 동기화
	initialScan() {
		if (!this.settings.pluginEnabled) return;
		
		console.log('[Markdown Hijacker] 초기 스캔 시작...');
		
		// 활성화된 폴더 매핑에 대해 스캔 수행
		for (const mapping of this.settings.folderMappings) {
			if (!mapping.enabled) continue;
			
			try {
				console.log(`[Markdown Hijacker] 폴더 스캔 중: ${mapping.externalPath}`);
				
				// 폴더가 존재하는지 확인
				if (!fs.existsSync(mapping.externalPath)) {
					console.error(`[Markdown Hijacker] 외부 폴더가 존재하지 않습니다: ${mapping.externalPath}`);
					continue;
				}
				
				// 폴더의 모든 마크다운 파일에 대해 프론트매터 추가 처리
				this.scanFolderAndProcessMarkdownFiles(mapping.externalPath, mapping.externalPath);
				
				// 폴더의 모든 마크다운 파일을 Vault로 동기화
				this.scanFolderAndSyncToVault(mapping);
				
				console.log(`[Markdown Hijacker] 폴더 스캔 완료: ${mapping.externalPath}`);
			} catch (error) {
				console.error(`[Markdown Hijacker] 폴더 스캔 오류: ${mapping.externalPath} - ${error}`);
			}
		}
		
		console.log('[Markdown Hijacker] 초기 스캔 완료');
	}

	// 폴더 재귀 스캔 및 마크다운 파일 처리
	private scanFolderAndProcessMarkdownFiles(folderPath: string, basePath: string) {
		try {
			const files = fs.readdirSync(folderPath);
			
			for (const file of files) {
				const fullPath = path.join(folderPath, file);
				
				try {
					const stats = fs.statSync(fullPath);
					
					if (stats.isDirectory()) {
						// 서브폴더에 대해 재귀 호출
						this.scanFolderAndProcessMarkdownFiles(fullPath, basePath);
					} else if (fullPath.toLowerCase().endsWith('.md')) {
						// 마크다운 파일인 경우 프론트매터 처리
						const relativePath = fullPath.substring(basePath.length);
						console.log(`[Markdown Hijacker] 마크다운 파일 처리: ${fullPath}, 상대 경로: ${relativePath}`);
						// 외부 워처의 processMarkdownFile 메서드 사용
						this.externalWatcher.processMarkdownFile(fullPath, basePath, relativePath);
					}
				} catch (err) {
					console.error(`[Markdown Hijacker] 파일 처리 오류: ${fullPath} - ${err}`);
				}
			}
		} catch (err) {
			console.error(`[Markdown Hijacker] 폴더 읽기 오류: ${folderPath} - ${err}`);
		}
	}
	
	// 외부 폴더 변경 핸들링
	handleExternalChange(mapping: FolderMapping, eventType: string, filename: string | null) {
		// 파일명이 null인 경우 처리
		if (filename === null) {
			this.log('파일명이 없는 변경 이벤트 발생', true);
			return;
		}
		
		// 나중에 구현
	}
	
	// 로깅 유틸리티
	log(message: string, isError: boolean = false) {
		if (this.settings.debugMode || isError) {
			if (isError) {
				console.error(`[Markdown Hijacker] ${message}`);
			} else {
				console.log(`[Markdown Hijacker] ${message}`);
			}
		}
	}

	startMonitoringExternalChanges() {
		if (this.monitoringExternalChanges) return;

		console.log(`[Markdown Hijacker] 외부 폴더 변경 감지 시작...`);
		
		// 활성화된 매핑 수 확인 (디버깅용)
		const enabledMappings = this.settings.folderMappings.filter(m => m.enabled);
		console.log(`[Markdown Hijacker] 활성화된 폴더 매핑: ${enabledMappings.length}개`);
		
		// 매핑 정보 상세 로깅
		enabledMappings.forEach((m, index) => {
			console.log(`[Markdown Hijacker] 매핑 #${index+1} - ID: ${m.id}, 경로: ${m.vaultPath} ↔ ${m.externalPath}`);
		});
		
		// Setup watchers for each external folder
		for (const mapping of this.settings.folderMappings) {
			if (mapping.externalPath && mapping.vaultPath) {
				console.log(`[Markdown Hijacker] 워처 설정 검토: ID=${mapping.id}, ${mapping.vaultPath} ↔ ${mapping.externalPath} (활성화: ${mapping.enabled})`);
				
				if (!mapping.enabled) {
					console.log(`[Markdown Hijacker] 매핑이 비활성화되어 있어 건너뜁니다: ${mapping.vaultPath}`);
					continue;
				}
				
				try {
					// 경로가 실제로 존재하는지 확인
					if (!fs.existsSync(mapping.externalPath)) {
						console.error(`[Markdown Hijacker] 외부 경로가 존재하지 않습니다: ${mapping.externalPath}`);
						if (this.settings.showNotifications) {
							new Notice(`외부 폴더가 존재하지 않습니다: ${mapping.externalPath}`);
						}
						continue;
					}
					
					// 워처 설정 및 동기화 핸들러 연결
					console.log(`[Markdown Hijacker] 워처 설정 시작: ID=${mapping.id}, 경로=${mapping.externalPath}`);
					const result = this.externalWatcher.setupWatcher(mapping, this.settings.showNotifications);
					console.log(`[Markdown Hijacker] 워처 설정 ${result ? '성공' : '실패'}: ${mapping.externalPath}`);
					
					// 동기화 핸들러 설정
					if (result) {
						console.log(`[Markdown Hijacker] 동기화 핸들러 설정 시작: ID=${mapping.id}, 경로=${mapping.externalPath}`);
						this.externalSync.setupSyncHandlers(mapping);
						console.log(`[Markdown Hijacker] 동기화 핸들러 설정 완료: ID=${mapping.id}`);
					}
				} catch (error) {
					console.error(`[Markdown Hijacker] 워처 설정 오류: ${mapping.externalPath} - ${error}`);
					if (this.settings.showNotifications) {
						new Notice(`외부 폴더 감시 설정 오류: ${mapping.externalPath}`);
					}
				}
			} else {
				console.log(`[Markdown Hijacker] 매핑 경로가 없거나 올바르지 않습니다: Vault=${mapping.vaultPath}, External=${mapping.externalPath}`);
			}
		}

		this.monitoringExternalChanges = true;
		console.log(`[Markdown Hijacker] 외부 폴더 변경 감지 설정 완료`);
	}

	stopMonitoringExternalChanges() {
		if (!this.monitoringExternalChanges) return;

		// Remove all watchers
		this.externalWatcher.removeAllWatchers();
		this.monitoringExternalChanges = false;
	}

	handleFileOpen(filePath: string) {
		// Make sure external sync is enabled
		if (!this.settings.enableExternalSync) {
			return;
		}

		// Check if this file path corresponds to any of our mapped folders
		for (const mapping of this.settings.folderMappings) {
			if (!mapping.enabled) continue;

			// Check if the file belongs to this mapping
			if (filePath.startsWith(mapping.vaultPath)) {
				this.log(`File opened: ${filePath} in mapped folder: ${mapping.vaultPath}`);
				
				// Here we could implement additional functionality like:
				// - Check if the file exists in the external folder
				// - Handle any synchronization needs
				// - Display status information about the external mapping
				
				// For now, we'll just log the event
				if (this.settings.debugMode) {
					console.log(`[Markdown Hijacker] File opened in a watched folder: ${filePath}`);
				}
				
				// We could also highlight the UI or show a notification if needed
				// if (this.settings.showNotifications) {
				//     new Notice(`File is linked to external folder: ${mapping.externalPath}`);
				// }
				
				break;
			}
		}
	}

	// 외부 폴더 스캔 및 Vault 동기화 메서드 추가
	public async scanFolderAndSyncToVault(mapping: FolderMapping) {
		try {
			console.log(`[Markdown Hijacker] 폴더 동기화 시작: ${mapping.externalPath} -> ${mapping.vaultPath}`);
			
			// 폴더 내의 모든 파일을 재귀적으로 스캔
			this.syncFolderContents(mapping.externalPath, mapping);
			
			console.log(`[Markdown Hijacker] 폴더 동기화 완료: ${mapping.externalPath}`);
		} catch (error) {
			console.error(`[Markdown Hijacker] 폴더 동기화 오류: ${error}`);
		}
	}

	private async syncFolderContents(folderPath: string, mapping: FolderMapping) {
		try {
			const files = fs.readdirSync(folderPath);
			
			for (const file of files) {
				const fullPath = path.join(folderPath, file);
				
				try {
					const stats = fs.statSync(fullPath);
					
					if (stats.isDirectory()) {
						// 서브폴더에 대해 재귀 호출
						await this.syncFolderContents(fullPath, mapping);
					} else if (file.toLowerCase().endsWith('.md')) {
						// 마크다운 파일인 경우 Vault에 동기화
						await this.syncFileToVault(fullPath, mapping);
					}
				} catch (err) {
					console.error(`[Markdown Hijacker] 파일 처리 오류: ${fullPath} - ${err}`);
				}
			}
		} catch (err) {
			console.error(`[Markdown Hijacker] 폴더 읽기 오류: ${folderPath} - ${err}`);
		}
	}

	private async syncFileToVault(externalPath: string, mapping: FolderMapping) {
		try {
			// Vault 내부 경로 계산
			const vaultPath = this.vaultSync.externalToVaultPath(externalPath, mapping);
			
			// 파일 존재 여부 확인
			const { exists, file } = this.vaultSync.fileExistsInVault(vaultPath);
			
			// 파일 내용 읽기
			const content = fs.readFileSync(externalPath, 'utf8');
			
			if (!exists) {
				// Vault에 파일이 없으면 새로 생성
				console.log(`[Markdown Hijacker] Vault에 파일 생성: ${vaultPath}`);
				await this.vaultSync.createFile(vaultPath, content);
			} else if (file) {
				// Vault에 파일이 있으면 수정 시간 비교 후 업데이트
				const externalStats = fs.statSync(externalPath);
				const vaultStats = await this.app.vault.adapter.stat(vaultPath);
				
				// 외부 파일이 더 최신인 경우에만 업데이트
				if (vaultStats && externalStats.mtime.getTime() > vaultStats.mtime) {
					console.log(`[Markdown Hijacker] Vault 파일 업데이트: ${vaultPath}`);
					await this.vaultSync.modifyFile(file, content);
				} else {
					console.log(`[Markdown Hijacker] Vault 파일이 더 최신이거나 정보를 가져올 수 없어 업데이트 안함: ${vaultPath}`);
				}
			}
		} catch (error) {
			console.error(`[Markdown Hijacker] 파일 동기화 오류: ${externalPath} - ${error}`);
		}
	}

	// Vault 내부 변경 감지 시작
	startMonitoringInternalChanges() {
		if (this.monitoringInternalChanges) return;
		
		console.log(`[Markdown Hijacker] Vault 내부 변경 감지 시작...`);
		
		try {
			// 활성화된 매핑 수 확인 (디버깅용)
			const enabledMappings = this.settings.folderMappings.filter(m => m.enabled);
			console.log(`[Markdown Hijacker] 활성화된 폴더 매핑: ${enabledMappings.length}개`);
			
			// 내부 감시자 시작
			this.internalWatcher.startWatching();
			
			// 매핑된 폴더에 대해 동기화 핸들러 설정
			for (const mapping of enabledMappings) {
				console.log(`[Markdown Hijacker] 내부 동기화 핸들러 설정: ${mapping.vaultPath} -> ${mapping.externalPath}`);
				this.internalSync.setupSyncHandlers(mapping);
			}
			
			this.monitoringInternalChanges = true;
			console.log(`[Markdown Hijacker] Vault 내부 변경 감지 설정 완료`);
		} catch (error) {
			console.error(`[Markdown Hijacker] Vault 내부 변경 감지 설정 오류:`, error);
			if (this.settings.showNotifications) {
				new Notice(`Vault 내부 변경 감지 설정 오류가 발생했습니다.`);
			}
		}
	}
	
	// Vault 내부 변경 감지 중지
	stopMonitoringInternalChanges() {
		if (!this.monitoringInternalChanges) return;
		
		try {
			// 내부 감시자 중지
			this.internalWatcher.stopWatching();
			this.internalWatcher.removeAllMappings();
			this.monitoringInternalChanges = false;
			console.log(`[Markdown Hijacker] Vault 내부 변경 감지 중지됨`);
		} catch (error) {
			console.error(`[Markdown Hijacker] Vault 내부 변경 감지 중지 오류:`, error);
		}
	}
}
