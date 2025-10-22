import MarkdownHijacker from "../../main";
import { App, Notice, PluginSettingTab, setIcon, Setting, ToggleComponent } from "obsidian";
import { BidirectionalType, DeletedFileAction, FolderConnectionSettings, MarkdownHijackerSettings, SyncType } from "./types";
import { openFolderSelectionDialog } from "../utils/openFolderSelectionDialog";
import { openVaultFolderSelectionDialog } from "src/utils/openVaultFolderSelectionDialog";
import { RemoveConnectionModal } from "./modal";
import { disableSync, saveSettings, validateConnectionPaths } from "./utils";
import { FolderSuggest } from "src/suggest/FolderSuggest";

export const DEFAULT_SETTINGS : MarkdownHijackerSettings = {
    enableGlobalSync: false,
    syncInterval: 2000,
    debugMode: false,
	showStatusBar: true,
	connections: []
}

export const DEFAULT_CONNECTIONS : FolderConnectionSettings = {
	id: crypto.randomUUID(),
	name: 'Untitled',
	internalPath: '',
	externalPath: '',
	syncType: SyncType.bidirectional,
	bidirectionalType: BidirectionalType.merge,
	deletedFileAction: DeletedFileAction.delete,
	ignoreHiddenFiles: true,
	excludeFolders: [
		'node_modules',
		'dist',
		'build',
		'src',
		'lib',
		'app',
		'public',
		'assets',
		'utils',
		'util',
		'types',
		'type',
		'hooks',
		'hook',
		'components',
		'component',
		'styles',
		'style',
		'pages',
		'routes',
		'route',
		'layouts',
		'layout',
		'modules',
		'module',
		'config'
	],
	includeFolders: [],
	extensions: ['md'],
	includeFileNames: [],
	excludeFileNames: [],
	syncEnabled: false
}

export class MarkdownHijackerSettingUI extends PluginSettingTab {
	private plugin: MarkdownHijacker;

	constructor(app: App, plugin: MarkdownHijacker) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display():void {

        const { containerEl } = this;
        containerEl.empty();
        containerEl.addClass('markdown-hijacker-settings');
		
		/* Global Settings */
        const globalSection = containerEl.createDiv({ cls: 'setting-section' })

		new Setting(globalSection)
			.setName('Global synchronization')
			.setDesc('Enable or disable global synchronization')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableGlobalSync)
				.onChange(async (value) => {
					console.log(`[SettingUI] ========== Global Sync Toggle ==========`);
					console.log(`[SettingUI] New value: ${value}`);
					this.plugin.settings.enableGlobalSync = value;
					await this.plugin.saveData(this.plugin.settings); // 이벤트 발생 없이 저장
					console.log(`[SettingUI] Settings saved`);
					this.plugin.statusBar.update();
					
					// Global sync 토글 시 watcher 즉시 재시작
					if (value === true) {
						console.log(`[SettingUI] Starting watchers...`);
						new Notice('Starting synchronization...');
						if (this.plugin.externalWatcher) {
							this.plugin.externalWatcher.setupWatcher();
						}
						if (this.plugin.internalWatcher) {
							this.plugin.internalWatcher.setupWatcher();
						}
						console.log(`[SettingUI] Watchers started`);
					} else {
						console.log(`[SettingUI] Stopping watchers...`);
						new Notice('Synchronization stopped');
						// Global sync OFF 시 모든 watcher 정지 (비동기로 즉시 종료)
						if (this.plugin.externalWatcher) {
							this.plugin.externalWatcher.stopWatching(true);
						}
						if (this.plugin.internalWatcher) {
							this.plugin.internalWatcher.clearEvents();
						}
						console.log(`[SettingUI] Watchers stopped`);
					}
					console.log(`[SettingUI] ========== Global Sync Toggle END ==========`);
				}));

		// new Setting(globalSection)
		// 	.setName('Sync Interval')
		// 	.setDesc('The interval for checking external folder changes (in ms)')
		// 	.addText(text => text
		// 		.setValue(this.plugin.settings.syncInterval.toString())
		// 		.onChange(async(value) => {
		// 			this.plugin.settings.syncInterval = parseInt(value);
		// 			await saveSettings(this.plugin);
		// 		}));

				
		/* Pair Settings */
        const syncConnectionsSection = containerEl.createDiv({ cls: 'setting-section' });
		const sectionHeader = syncConnectionsSection.createDiv({ cls: 'setting-section-header sync-connections-header' });

		new Setting(sectionHeader).setName('Sync connections').setHeading();

		new Setting(sectionHeader)
			.addButton(button => button
				.setButtonText('+')
				.setCta()
				.onClick(async () => {
					const newConnection = { ...DEFAULT_CONNECTIONS, id: crypto.randomUUID() };
					this.plugin.settings.connections.push(newConnection);
					await saveSettings(this.plugin);
					this.display();
				}));
		
		const connectionsList = syncConnectionsSection.createDiv({ cls: 'sync-connections-list' });

		this.plugin.settings.connections.forEach((connection : FolderConnectionSettings) => {
			const connectionItem = connectionsList.createDiv({ cls: 'sync-connection-item' });
			
			/* Item Header */
			const itemHeader = connectionItem.createDiv({ cls: 'sync-connection-header' });
			const itemHeaderLeft = itemHeader.createDiv({ cls: 'sync-connection-header-left' });
			const itemHeaderRight = itemHeader.createDiv({ cls: 'sync-connection-header-right' });

			const nameContainer = itemHeaderLeft.createDiv({ cls: 'sync-connection-name' });
			const nameDisplay = nameContainer.createEl('h3', { text: connection.name, cls: 'sync-name-display' });

			nameDisplay.onclick = () => {
				nameContainer.empty();
				const input = nameContainer.createEl('input', {
					attr: { type: 'text', value: connection.name}
				});
				input.addClass("sync-name-input");
				input.focus();
				input.select();
				input.onblur = async () => {
					const newName = input.value.trim() || "Untitled";
					connection.name = newName;
					await saveSettings(this.plugin);
					this.display();
				};
				input.onkeydown = (e) => {
					if (e.key === 'Enter') input.blur();
				};
			};

			itemHeaderLeft.createEl('span', { text: connection.syncType, cls: 'sync-connection-direction' });

			let syncToggleComponent: ToggleComponent

			new Setting(itemHeaderRight)
				.setName('Sync status')
				.addToggle(toggle => {
					syncToggleComponent = toggle;
					toggle
						.setValue(connection.syncEnabled)
						.onChange(async (value) => {
							if (value === true) {
								const result = validateConnectionPaths(connection);
								if (!result.valid) {
									connection.syncEnabled = false;
									toggle.setValue(false);
									new Notice(result.message!);
									await saveSettings(this.plugin);
									return;
								}
								
								// Sync를 켤 때 watcher 즉시 재시작
								connection.syncEnabled = value;
								await this.plugin.saveData(this.plugin.settings); // 이벤트 발생 없이 저장
								
								new Notice('Starting sync for this connection...');
								
								// Watcher 즉시 재시작
								if (this.plugin.externalWatcher) {
									this.plugin.externalWatcher.setupWatcher();
								}
								if (this.plugin.internalWatcher) {
									this.plugin.internalWatcher.setupWatcher();
								}
							} else {
								// Sync를 끌 때는 저장하고 watcher 즉시 재시작
								connection.syncEnabled = value;
								await this.plugin.saveData(this.plugin.settings); // 이벤트 발생 없이 저장
								
								new Notice('Stopping sync for this connection...');
								
								// Watcher 즉시 재시작 (해당 connection 제외)
								if (this.plugin.externalWatcher) {
									this.plugin.externalWatcher.setupWatcher();
								}
								if (this.plugin.internalWatcher) {
									this.plugin.internalWatcher.setupWatcher();
								}
							}
						});
				});

			/* Item Body */
			const itemBody = connectionItem.createDiv({ cls: 'sync-connection-body' });

			const pathsContainer = itemBody.createDiv({ cls: 'sync-connection-paths' });

			const vaultSetting = new Setting(pathsContainer);
			vaultSetting.infoEl.empty();  // 기존 이름 비우기
			
			// 폴더 아이콘 추가
			const iconSpan = vaultSetting.infoEl.createSpan();
			setIcon(iconSpan, 'folder')
			
			// 이름 텍스트 추가
			vaultSetting.infoEl.createSpan({ text: 'Internal path (Obsidian)' });
			
			vaultSetting
				.addText(text => {
					text
						.setValue(connection.internalPath)
						.onChange(async (value) => {
							connection.internalPath = value;
							disableSync(connection, syncToggleComponent);
							await saveSettings(this.plugin);
						})
					new FolderSuggest(this.app, text.inputEl, this.plugin);
				})
				.addButton(btn => btn
					.setButtonText('📂')
					.onClick(async () => {
						const selected = await openVaultFolderSelectionDialog(this.app);
						if (selected) {
							connection.internalPath = selected;
							disableSync(connection, syncToggleComponent);
							await saveSettings(this.plugin);
							this.display();
						}
					}));

			const externalSetting = new Setting(pathsContainer);
			externalSetting.infoEl.empty();  // 기존 이름 비우기
			
			// 폴더 아이콘 추가
			const externalIconSpan = externalSetting.infoEl.createSpan();
			setIcon(externalIconSpan, 'folder')

			externalSetting.infoEl.createSpan({ text: 'External path' });
			
			externalSetting
				.addText(text => text
					.setValue(connection.externalPath)
					.onChange(async value => {
						connection.externalPath = value;
						disableSync(connection, syncToggleComponent);
						await saveSettings(this.plugin); // ← await 추가
					}))
				.addButton(button => button
					.setButtonText('📂')
					.onClick(async () => {
						const path = await openFolderSelectionDialog();
						if (path) {
							connection.externalPath = path;
							disableSync(connection, syncToggleComponent);
							await saveSettings(this.plugin);
							this.display();
						}
					}));

			const advancedSection = itemBody.createEl('details', { cls: 'sync-advanced-settings' });
			advancedSection.createEl('summary', { text: 'Advanced settings', cls: 'sync-advanced-toggle' });
			const advancedContent = advancedSection.createDiv({ cls: 'sync-advanced-content' });

			new Setting(advancedContent)
				.setName('Sync type')
				.setDesc('Select the sync type')
				.addDropdown(dropdown => dropdown
					.addOption(SyncType.bidirectional, 'Bidirectional')
					.addOption(SyncType.vaultToExternal, 'Vault to External')
					.addOption(SyncType.externalToVault, 'External to Vault')
					.setValue(connection.syncType) // 기본값 설정
					.onChange(async value => {
						connection.syncType = value as SyncType;
						disableSync(connection, syncToggleComponent);
						await saveSettings(this.plugin);
			
						// 타이틀 옆 syncType 텍스트만 직접 업데이트
						const directionEl = itemHeaderLeft.querySelector('.sync-connection-direction');
						if (directionEl) {
							directionEl.textContent = connection.syncType;
						}
					}));

			// new Setting(advancedContent)
			// 	.setName('Bidirectional Type')
			// 	.setDesc('Select the bidirectional type')
			// 	.addDropdown(dropdown => dropdown
			// 		.addOption(BidirectionalType.merge, 'Merge')
			// 		.addOption(BidirectionalType.externalPriority, 'External Priority')
			// 		.addOption(BidirectionalType.internalPriority, 'Internal Priority')
			// 		.setValue(connection.bidirectionalType)
			// 		.onChange(async (value) => {
			// 			disableSync(connection, itemHeaderRight);
			// 			connection.bidirectionalType = value as BidirectionalType;
			// 			await saveSettings(this.plugin);
			// 		})
			// 	);
			
			new Setting(advancedContent)
				.setName('Deleted file action')
				.setDesc('Select the action to take when a file is deleted')
				.addDropdown(dropdown => dropdown
					.addOption(DeletedFileAction.property, 'Property')
					.addOption(DeletedFileAction.delete, 'Delete')
					.setValue(connection.deletedFileAction)
					.onChange(async (value) => {
						disableSync(connection, syncToggleComponent);
						connection.deletedFileAction = value as DeletedFileAction;
						await saveSettings(this.plugin);
					})
				);

			new Setting(advancedContent)
				.setName('Ignore hidden files and folders')
				.setDesc('Example: Default hidden folders starting with .')
				.addToggle(toggle => toggle
					.setValue(connection.ignoreHiddenFiles)
					.onChange(async (value) => {
						disableSync(connection, syncToggleComponent);
						connection.ignoreHiddenFiles = value;
						await saveSettings(this.plugin);
					}));

			new Setting(advancedContent)
				.setName('Exclude subfolder names')
				.setDesc('Subfolders to exclude from sync, one per line.')
				.addTextArea(textarea => {
					textarea
						.setValue(connection.excludeFolders.join('\n'))
						.setPlaceholder('e.g. node_modules\nbuild\ndist')
						.onChange(async (value) => {
							disableSync(connection, syncToggleComponent);
							connection.excludeFolders = value.split('\n')
								.map(folder => folder.trim())
								.filter(folder => folder !== '');
							await saveSettings(this.plugin);
						});
				});

			new Setting(advancedContent)
				.setName('Include subfolder names')
				.setDesc('Only sync these subfolders (overrides exclude).')
				.addTextArea(textarea => {
					textarea
						.setValue(connection.includeFolders.join('\n'))
						.setPlaceholder('note\nmemo')
						.onChange(async (value) => {
							disableSync(connection, syncToggleComponent);
							connection.includeFolders = value.split('\n')
								.map(folder => folder.trim())
								.filter(folder => folder !== '');
							await saveSettings(this.plugin);
						});
				});

			new Setting(advancedContent)
				.setName('File extensions')
				.setDesc('Enter one extension per line (e.g., md, txt)')
				.addTextArea(textarea => {
					textarea
						.setValue(connection.extensions.join('\n'))
						.setPlaceholder('e.g. md\ntxt\npng\njpg\npdf')
						.onChange(async (value) => {
							disableSync(connection, syncToggleComponent);
							connection.extensions = value
								.split('\n')
								.map(ext => ext.trim().replace(/^\./, ''))
								.map(ext => ext.toLowerCase())
								.filter(ext => ext !== '');
							await saveSettings(this.plugin);
						});
				});
			
			new Setting(advancedContent)
				.setName('Include file names')
				.setDesc('Files to include in sync (one per line). Use exact filename with extension for exact match, or glob patterns (* ? []) for pattern matching. Note: This filter only applies to external folder → vault sync.')
				.addTextArea(textarea => {
					textarea
						.setValue((connection.includeFileNames || []).join('\n'))
						.setPlaceholder('meeting.md\ntodo-*.txt\nproject-??.md\n*.csv\ndaily-[0-9][0-9].md')
						.onChange(async (value) => {
							disableSync(connection, syncToggleComponent);
							connection.includeFileNames = value
								.split('\n')
								.map(pattern => pattern.trim())
								.filter(pattern => pattern !== '');
							await saveSettings(this.plugin);
						});
				});
			
			new Setting(advancedContent)
				.setName('Exclude file names')
				.setDesc('Files to exclude from sync (one per line). Use exact filename with extension for exact match, or glob patterns (* ? []) for pattern matching. Note: This filter only applies to external folder → vault sync.')
				.addTextArea(textarea => {
					textarea
						.setValue((connection.excludeFileNames || []).join('\n'))
						.setPlaceholder('temp.txt\ndraft-*\n*.backup\n.DS_Store\nconfig.json')
						.onChange(async (value) => {
							disableSync(connection, syncToggleComponent);
							connection.excludeFileNames = value
								.split('\n')
								.map(pattern => pattern.trim())
								.filter(pattern => pattern !== '');
							await saveSettings(this.plugin);
						});
				});

			const actionsContainer = itemBody.createDiv({ cls: 'sync-actions-container' });

			// new Setting(actionsContainer)
			// 	.addButton(button => button
			// 		.setButtonText('🔄 Sync Now')
			// 		.setCta()
			// 		.setClass('sync-now-button')
			// 		.onClick(() => {
			// 			console.log(`Syncing ${connection.name} now...`);
			// 		}));

			new Setting(actionsContainer)
				.addButton(button => button
					.setButtonText('🗑️ Remove')
					.setCta()
					.setClass('remove-connection-button')
					.onClick(async () => {
						new RemoveConnectionModal(this.app, connection.name, async () => {
							disableSync(connection, syncToggleComponent);
							this.plugin.settings.connections = this.plugin.settings.connections.filter(c => c.id !== connection.id);
							this.plugin.snapShotService.deleteSnapshotFile(connection);
							await saveSettings(this.plugin);
							this.display();
						}).open();
					}));
		});

		/* Miscellaneous */
		const miscellaneousSection = containerEl.createDiv({ cls: 'setting-section' });

		new Setting(miscellaneousSection).setName('Miscellaneous').setHeading();

		new Setting(miscellaneousSection)
			.setName('Show status bar')
			.setDesc('Show the status bar at the bottom of Obsidian.')
			.addToggle(toggle => {
				toggle.setValue(this.plugin.settings.showStatusBar)
					.onChange(async (value) => {
						this.plugin.settings.showStatusBar = value;
						await saveSettings(this.plugin);
						// 상태바 표시/숨김 즉시 반영
						this.plugin.statusBar?.update();
					});
			}); 

		/* Maintenance */
        // const maintenanceSection = containerEl.createDiv({ cls: 'setting-section' })

		// maintenanceSection.createEl('h2', { text: 'Maintenance' });

		// new Setting(maintenanceSection)
		// 	.setName('Sync All Conntection')
		// 	.setDesc('Manually initiate all sync operations')
		// 	.addButton(button => button
		// 		.setButtonText('🔄')
		// 		.setCta()
		// 		.onClick(async () => {
		// 			console.log('Clicked Sync All Conntection');
		// 		}));
		
		// new Setting(maintenanceSection)
		// 	.setName('Debug Mode')
		// 	.setDesc('Outputs console logs and toast messages on sync events')
		// 	.addToggle(toggle => toggle
		// 		.setValue(this.plugin.settings.debugMode)
		// 		.onChange(async (value) => {
		// 			this.plugin.settings.debugMode = value;
		// 			await saveSettings(this.plugin);
		// 		}));
	}
}