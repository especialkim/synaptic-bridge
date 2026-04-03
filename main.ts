import { Plugin, EventRef } from 'obsidian';
import * as fs from 'fs';
import { FSWatcher } from 'fs';
import { InternalWatcher } from './src/watchers/InternalWatcher';
import { MarkdownHijackerSettingUI, MarkdownHijackerSettings, DEFAULT_SETTINGS } from 'src/settings';
import { FrontmatterPolicy } from 'src/settings/types';
import { StatusBarManager } from 'src/statusBar/StatusBarManager';
import { ExternalWatcher } from 'src/watchers/ExternalWatcher';
import { SnapShotService } from 'src/sync/SnapShotService';
import { SyncService } from 'src/sync/SyncService';
import { SyncInternalManager } from 'src/sync/SyncInternalManager';
import { ExplorerSyncDecorator } from 'src/explorer/ExplorerSyncDecorator';
import { ExplorerContextMenu } from 'src/explorer/ExplorerContextMenu';

// 이벤트 타입 확장
declare module 'obsidian' {
	interface Workspace extends Events {
		on(name: 'markdown-hijacker:settings-changed', callback: () => void): EventRef;
		trigger(name: 'markdown-hijacker:settings-changed'): void;
	}
}

export default class MarkdownHijacker extends Plugin {
	// settings: MarkdownHijackerSettings;
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

	/* SnapShot */
	snapShotService: SnapShotService;

	/* Rebuilding */
	statusBar: StatusBarManager;

	/* Watcher */
	internalWatcher: InternalWatcher;
	externalWatcher: ExternalWatcher;

	/* Sync Services */
	syncService: SyncService;

	/* Internal Sync Manager */
	syncInternalManager: SyncInternalManager;

	/* Explorer UI */
	explorerSyncDecorator: ExplorerSyncDecorator;
	explorerContextMenu: ExplorerContextMenu;

	// Debounce 타이머
	private settingsChangeDebounceTimer: NodeJS.Timeout | null = null;

	// Startup cleanup 대기열
	_pendingPolicyCleanups: Array<{
		connection: import('src/settings/types').FolderConnectionSettings;
		oldPolicy: FrontmatterPolicy;
		newPolicy: FrontmatterPolicy;
	}> = [];

	// onLayoutReady 콜백 참조 (cleanup을 위해)
	private layoutReadyUnsubscribe: (() => void) | null = null;

	async onload() {
		console.log('[MarkdownHijacker] ========== onload START ==========');

		/* Load Settings */
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

		/* Step 8: Startup migration - backfill frontmatterPolicy for existing connections */
		let needsSave = false;
		for (const connection of this.settings.connections) {
			if (!connection.frontmatterPolicy) {
				connection.frontmatterPolicy = FrontmatterPolicy.both;
				needsSave = true;
			}
		}
		if (needsSave) {
			await this.saveData(this.settings);
		}

		/* Startup cleanup: 이전 정책과 현재 정책 비교하여 cleanup 실행 */
		// _lastFrontmatterPolicies는 plugin data에 저장된 이전 정책 스냅샷
		const rawData = await this.loadData();
		const lastPolicies: Record<string, string> = rawData?._lastFrontmatterPolicies || {};
		for (const connection of this.settings.connections) {
			const lastPolicy = lastPolicies[connection.id];
			if (lastPolicy && lastPolicy !== connection.frontmatterPolicy) {
				this._pendingPolicyCleanups.push({
					connection,
					oldPolicy: lastPolicy as FrontmatterPolicy,
					newPolicy: connection.frontmatterPolicy
				});
			}
		}

		/* Setting UI */
		this.addSettingTab(new MarkdownHijackerSettingUI(this.app, this));

		/* Sync Services */
		this.snapShotService = new SnapShotService(this.app, this);
		this.syncService = new SyncService(this.app, this);

		/* Internal Sync Manager */
		this.syncInternalManager = new SyncInternalManager(this.app, this);

		/* Status Bar */
		this.statusBar = new StatusBarManager(this);
		this.statusBar.toggleVisibility(this.settings.showStatusBar);

		/* Main - 지연 초기화 적용 */
		// onLayoutReady는 한 번만 실행되어야 함
		const layoutReadyCallback = () => {
			console.log('[MarkdownHijacker] Layout ready - starting initialization');

			// Explorer decorator는 즉시 초기화 (가벼운 작업)
			this.explorerSyncDecorator = new ExplorerSyncDecorator(this.app, this);
			this.explorerSyncDecorator.setup();
			console.log('[MarkdownHijacker] Explorer decorator setup complete');

			// Explorer context menu 초기화 (가벼운 작업)
			this.explorerContextMenu = new ExplorerContextMenu(this.app, this);
			this.explorerContextMenu.setup();
			console.log('[MarkdownHijacker] Explorer context menu setup complete');

			// 유휴 시간에 초기화 (브라우저가 여유 있을 때)
			this.scheduleIdleInitialization();
		};

		// 이미 layout이 준비된 경우 즉시 실행
		if (this.app.workspace.layoutReady) {
			console.log('[MarkdownHijacker] Layout already ready, initializing immediately');
			layoutReadyCallback();
		} else {
			console.log('[MarkdownHijacker] Waiting for layout ready');
			this.app.workspace.onLayoutReady(layoutReadyCallback);
		}

		console.log('[MarkdownHijacker] ========== onload END ==========');

		/* 설정 변경 이벤트 리스너 등록 (Debounce 적용) */
		this.registerEvent(
			this.app.workspace.on('markdown-hijacker:settings-changed', () => {
				console.log('[MarkdownHijacker] Settings changed - debouncing...');

				// 기존 타이머 취소
				if (this.settingsChangeDebounceTimer) {
					clearTimeout(this.settingsChangeDebounceTimer);
				}

				// 1초 후에 실행 (연속 입력 방지)
				this.settingsChangeDebounceTimer = setTimeout(() => {
					console.log('[MarkdownHijacker] Applying settings changes...');
					this.applySettingsChanges();
				}, 1000);
			})
		);
	}

	private applySettingsChanges() {
		console.log('[MarkdownHijacker] Applying settings changes now');
		const applyStart = performance.now();

		// Status Bar 업데이트 (가벼운 작업)
		if (this.statusBar) {
			this.statusBar.update();
			this.statusBar.toggleVisibility(this.settings.showStatusBar);
		}

		// Explorer decorator 업데이트 (가벼운 작업)
		if (this.explorerSyncDecorator) {
			this.explorerSyncDecorator.decorateAllSyncFolders();
		}

		// Watcher 재설정은 하지 않음 - 설정 UI에서 connection을 활성화/비활성화할 때만 수동으로 처리
		// 이유: setupWatcher()가 5초 정도 걸려서 설정 UI가 버벅임
		// 대신 플러그인 재로드하거나 Obsidian 재시작 시 적용됨

		const applyTime = (performance.now() - applyStart).toFixed(2);
		console.log(`[MarkdownHijacker] Settings applied in ${applyTime}ms (watchers not restarted)`);
	}

	private scheduleIdleInitialization() {
		// requestIdleCallback이 있으면 사용, 없으면 setTimeout으로 폴백
		if (typeof requestIdleCallback !== 'undefined') {
			console.log('[MarkdownHijacker] Using requestIdleCallback for initialization');
			requestIdleCallback(() => {
				this.initializeSync();
			}, { timeout: 5000 }); // 최대 5초 후에는 강제 실행
		} else {
			console.log('[MarkdownHijacker] Using setTimeout for initialization (2s delay)');
			setTimeout(() => {
				this.initializeSync();
			}, 2000); // 폴백: 2초 지연
		}
	}

	private async initializeSync() {
		console.log('[MarkdownHijacker] Starting sync initialization...');
		const startTime = performance.now();

		try {
			// Watcher 인스턴스는 항상 생성 (Global Sync OFF여도)
			// 나중에 Settings UI에서 Global Sync ON 시 사용하기 위함
			if (!this.externalWatcher) {
				console.log('[MarkdownHijacker] Creating ExternalWatcher...');
				this.externalWatcher = new ExternalWatcher(this.app, this);
			}

			if (!this.internalWatcher) {
				console.log('[MarkdownHijacker] Creating InternalWatcher...');
				this.internalWatcher = new InternalWatcher(this.app, this);
			}

			// Pending policy cleanup은 watcher 시작 전에 실행해야 한다.
			if (this._pendingPolicyCleanups.length > 0) {
				console.log(`[MarkdownHijacker] Running startup policy cleanup for ${this._pendingPolicyCleanups.length} connection(s)...`);
				for (const { connection, oldPolicy, newPolicy } of this._pendingPolicyCleanups) {
					console.log(`[MarkdownHijacker] Cleanup: ${connection.name} (${oldPolicy} → ${newPolicy})`);
					await this.syncService.cleanupFrontmatterForPolicyChange(connection, oldPolicy, newPolicy);
				}
				this._pendingPolicyCleanups = [];
				console.log('[MarkdownHijacker] Startup policy cleanup complete');
			}

			const currentPolicies: Record<string, string> = {};
			for (const connection of this.settings.connections) {
				currentPolicies[connection.id] = connection.frontmatterPolicy;
			}
			const currentPoliciesJson = JSON.stringify(currentPolicies);
			const savedPoliciesJson = JSON.stringify(this.settings._lastFrontmatterPolicies || {});
			if (currentPoliciesJson !== savedPoliciesJson) {
				this.settings._lastFrontmatterPolicies = currentPolicies;
				await this.saveData(this.settings);
			}

			// Global Sync가 꺼져있으면 watcher 설정만 건너뜀
			if (!this.settings.enableGlobalSync) {
				console.log('[MarkdownHijacker] Global sync disabled, skipping watcher setup');
				return;
			}

			// Status Bar 피드백: 초기화 시작
			console.log('[MarkdownHijacker] Setting status bar: Initializing...');
			this.statusBar?.setText("🔄 Initializing sync...");

			console.log('[MarkdownHijacker] Setting up ExternalWatcher...');
			this.externalWatcher.setupWatcher();
			console.log('[MarkdownHijacker] ExternalWatcher setup complete');

			console.log('[MarkdownHijacker] Setting up InternalWatcher...');
			this.internalWatcher.setupWatcher();
			console.log('[MarkdownHijacker] InternalWatcher setup complete');

			const endTime = performance.now();
			const duration = (endTime - startTime).toFixed(2);
			console.log(`[MarkdownHijacker] Sync initialization completed in ${duration}ms`);

			// Status Bar 피드백: 초기화 완료
			console.log('[MarkdownHijacker] Setting status bar: Sync ready');
			this.statusBar?.setText("✅ Sync ready");
			console.log('[MarkdownHijacker] ========== initializeSync COMPLETE ==========');
		} catch (error) {
			console.error('[MarkdownHijacker] Failed to initialize sync:', error);
			console.log('[MarkdownHijacker] Setting status bar: Error');
			this.statusBar?.setText("❌ Sync error");
		}
	}

	onunload() {
		console.log('[MarkdownHijacker] ========== onunload START ==========');

		// Debounce 타이머 정리
		if (this.settingsChangeDebounceTimer) {
			clearTimeout(this.settingsChangeDebounceTimer);
			this.settingsChangeDebounceTimer = null;
		}

		// Watchers 즉시 detach
		if (this.externalWatcher) {
			this.externalWatcher.stopWatching(true);
			this.externalWatcher = null as any;
		}
		if (this.internalWatcher) {
			this.internalWatcher.clearEvents();
			this.internalWatcher = null as any;
		}

		// Explorer UI 정리
		if (this.explorerSyncDecorator) {
			this.explorerSyncDecorator.cleanup();
			this.explorerSyncDecorator = null as any;
		}
		if (this.explorerContextMenu) {
			this.explorerContextMenu.cleanup();
			this.explorerContextMenu = null as any;
		}

		console.log('[MarkdownHijacker] ========== onunload END ==========');
	}
}
