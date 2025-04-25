import { Plugin, EventRef } from 'obsidian';
import * as fs from 'fs';
import { FSWatcher } from 'fs';
import { InternalWatcher } from './src/watchers/InternalWatcher';
import { MarkdownHijackerSettingUI, MarkdownHijackerSettings, DEFAULT_SETTINGS } from 'src/settings';
import { StatusBarManager } from 'src/statusBar/StatusBarManager';
import { ExternalWatcher } from 'src/watchers/ExternalWatcher';
import { SnapShotService } from 'src/sync/SnapShotService';
import { SyncService } from 'src/sync/SyncService';
import { SyncInternalManager } from 'src/sync/SyncInternalManager';
import { ExplorerSyncDecorator } from 'src/explorer/ExplorerSyncDecorator';

// 이벤트 타입 확장
declare module 'obsidian' {
	interface Workspace extends Events {
		on(name: 'markdown-hijacker:settings-changed', callback: () => any): EventRef;
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

	explorerSyncDecorator: ExplorerSyncDecorator;

	async onload() {
		console.log('MarkdownHijacker plugin loaded');
		
		/* Load Settings */
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

		/* Setting UI */
		this.addSettingTab(new MarkdownHijackerSettingUI(this.app, this));

		/* Sync Services */
		this.snapShotService = new SnapShotService(this.app, this);
		this.syncService = new SyncService(this.app, this);

		/* Internal Sync Manager */
		this.syncInternalManager = new SyncInternalManager(this.app, this);

		/* Status Bar */
		this.statusBar = new StatusBarManager(this);

		/* Main */
		this.app.workspace.onLayoutReady(() => {
			this.externalWatcher = new ExternalWatcher(this.app, this);
			this.externalWatcher.setupWatcher();
			this.internalWatcher = new InternalWatcher(this.app, this);
			this.internalWatcher.setupWatcher();
			this.explorerSyncDecorator = new ExplorerSyncDecorator(this.app, this);
			this.explorerSyncDecorator.setup();
		});
		
		/* 설정 변경 이벤트 리스너 등록 */
		this.registerEvent(
			this.app.workspace.on('markdown-hijacker:settings-changed', () => {
				console.log('markdown-hijacker:settings-changed 설정 변경 이벤트 발생');
				if (this.externalWatcher) {
					this.externalWatcher.setupWatcher();
				}
				if (this.internalWatcher) {
					this.internalWatcher.setupWatcher();
				}
			})
		);
	}

	onunload() {
		console.log('MarkdownHijacker plugin unloaded');
		
		// Make sure to stop the watcher when the plugin is unloaded
		if (this.externalWatcher) {
			this.externalWatcher.stopWatching();
		}

		if (this.internalWatcher) {
			this.internalWatcher.clearEvents();
		}

		if (this.explorerSyncDecorator) {
			this.explorerSyncDecorator.cleanup();
		}
	}
}
