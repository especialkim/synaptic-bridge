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
import * as path from 'path';

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
		showNotifications: boolean;     // 알림 표시 여부
	}
}

// Add default values for our new settings
const ADDITIONAL_DEFAULT_SETTINGS = {
	enableExternalSync: false,
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
	watchers: Map<string, fs.FSWatcher> = new Map();
	externalWatcher: ExternalFolderWatcher;

	async onload() {
		console.log('MarkdownHijacker plugin loaded');
		
		// 설정 로드
		await this.loadSettings();
		
		// 외부 폴더 감시자 초기화 (먼저 초기화해야 함)
		console.log('외부 폴더 감시자 초기화 중...');
		this.externalWatcher = new ExternalFolderWatcher(this.app, this.settings.debugMode);
		
		// 설정 탭 추가
		this.addSettingTab(new MarkdownHijackerSettingTab(this.app, this));
		
		// 상태 바 아이템 설정
		this.setupStatusBar();
		
		// 플러그인이 활성화된 경우에만 모니터링 시작
		if (this.settings.pluginEnabled) {
			this.startMonitoring();
		}

		// Register the file:open event
		this.registerEvent(
			this.app.workspace.on('file-open', (file: TFile | null) => {
				if (!file) return;

				const filePath = file.path;
				this.handleFileOpen(filePath);
			})
		);

		// Start monitoring external changes
		console.log('외부 폴더 동기화 설정 확인 중:', this.settings.enableExternalSync);
		if (this.settings.enableExternalSync) {
			console.log('외부 폴더 동기화 시작...');
			this.startMonitoringExternalChanges();
		} else {
			console.log('외부 폴더 동기화가 비활성화되어 있습니다. 설정에서 활성화하세요.');
		}
		
		console.log('MarkdownHijacker plugin 로드 완료');
	}

	onunload() {
		console.log('MarkdownHijacker plugin unloaded');
		// 모니터링 중지
		this.stopMonitoring();
		this.stopMonitoringExternalChanges();
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
		// 나중에 구현
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
		
		// Setup watchers for each external folder
		for (const mapping of this.settings.folderMappings) {
			if (mapping.externalPath && mapping.vaultPath) {
				console.log(`[Markdown Hijacker] 워처 설정 시도: ${mapping.vaultPath} -> ${mapping.externalPath} (활성화: ${mapping.enabled})`);
				
				if (!mapping.enabled) {
					console.log(`[Markdown Hijacker] 매핑이 비활성화되어 있어 건너뜁니다: ${mapping.vaultPath}`);
					continue;
				}
				
				try {
					// 경로가 실제로 존재하는지 확인
					if (!fs.existsSync(mapping.externalPath)) {
						console.error(`[Markdown Hijacker] 외부 경로가 존재하지 않습니다: ${mapping.externalPath}`);
						continue;
					}
					
					const result = this.externalWatcher.setupWatcher(mapping, this.settings.showNotifications);
					console.log(`[Markdown Hijacker] 워처 설정 ${result ? '성공' : '실패'}: ${mapping.externalPath}`);
				} catch (error) {
					console.error(`[Markdown Hijacker] 워처 설정 오류: ${mapping.externalPath} - ${error}`);
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
}
