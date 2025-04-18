import MarkdownHijacker from "../../main";
import { App, PluginSettingTab, setIcon, Setting } from "obsidian";
import { MarkdownHijackerSettings, SyncType } from "./types";
import { openFolderSelectionDialog } from "../Utils/openFolderSelectionDialog";
import { openVaultFolderSelectionDialog } from "reSrc/Utils/openVaultFolderSelectionDialog";
import { RemoveConnectionModal } from "./modal";

export const DEFAULT_SETTINGS : MarkdownHijackerSettings = {
    enableGlobalSync: false,
    syncInterval: 2000,
    debugMode: false,
	connections: []
}

export class MarkdownHijackerSettingUI extends PluginSettingTab {
	private plugin: MarkdownHijacker;

	constructor(app: App, plugin: MarkdownHijacker) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display():void {

		console.log("settings : ", this.plugin.settings);
		
        const { containerEl } = this;
        containerEl.empty();
        containerEl.addClass('markdown-hijacker-settings');
		
		/* Global Settings */
        const globalSection = containerEl.createDiv({ cls: 'setting-section' })

		globalSection.createEl('h2', { text: 'Global Settings' });

		new Setting(globalSection)
			.setName('Global Synchronization')
			.setDesc('Enable or disable global synchronization')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableGlobalSync)
				.onChange(value => {
					this.plugin.settings.enableGlobalSync = value;
					this.plugin.saveSettings();
				}));

		new Setting(globalSection)
			.setName('Sync Interval')
			.setDesc('The interval for checking external folder changes (in ms)')
			.addText(text => text
				.setValue(this.plugin.settings.syncInterval.toString())
				.onChange(async(value) => {
					this.plugin.settings.syncInterval = parseInt(value);
					await this.plugin.saveSettings();
				}));

				
		/* Pair Settings */
        const syncConnectionsSection = containerEl.createDiv({ cls: 'setting-section' });
		const sectionHeader = syncConnectionsSection.createDiv({ cls: 'setting-section-header sync-connections-header' });

		sectionHeader.createEl('h2', { text: 'Sync Connections' });

		new Setting(sectionHeader)
			.addButton(button => button
				.setButtonText('+')
				.setCta()
				.onClick(async () => {
					console.log('Clicked New Connection');
					this.plugin.settings.connections.push({
						id: crypto.randomUUID(),
						name: 'Untitled',
						vaultPath: '',
						externalPath: '',
						syncType: SyncType.bidirectional,
						ignoreHiddenFiles: true,
						excludeFolders: [],
						includeFolders: [],
						extensions: ['.md'],
						syncEnabled: false
					});
					await this.plugin.saveSettings();
					this.display();
				}));
		
		const connectionsList = syncConnectionsSection.createDiv({ cls: 'sync-connections-list' });

		this.plugin.settings.connections.forEach(connection => {
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
				input.onblur = async () => {
					const newName = input.value.trim() || "Untitled";
					connection.name = newName;
					await this.plugin.saveSettings();
					this.display();
				};
				input.onkeydown = (e) => {
					if (e.key === 'Enter') input.blur();
				};
			};

			itemHeaderLeft.createEl('span', { text: connection.syncType, cls: 'sync-connection-direction' });

			new Setting(itemHeaderRight)
				.addToggle(toggle => toggle
					.setValue(connection.syncEnabled)
					.onChange(value => {
						connection.syncEnabled = value;
						this.plugin.saveSettings();
					}));

			/* Item Body */
			const itemBody = connectionItem.createDiv({ cls: 'sync-connection-body' });

			const pathsContainer = itemBody.createDiv({ cls: 'sync-connection-paths' });

			const vaultSetting = new Setting(pathsContainer);
			vaultSetting.infoEl.empty();  // 기존 이름 비우기
			
			// 폴더 아이콘 추가
			const iconSpan = vaultSetting.infoEl.createSpan();
			setIcon(iconSpan, 'folder')
			
			// 이름 텍스트 추가
			vaultSetting.infoEl.createSpan({ text: 'Vault Path' });
			
			vaultSetting
				.addText(text => text
					.setValue(connection.vaultPath)
					.onChange(value => {
						connection.vaultPath = value;
						this.plugin.saveSettings();
					}))
				.addButton(btn => btn
					.setButtonText('폴더 선택')
					.onClick(async () => {
						const selected = await openVaultFolderSelectionDialog(this.app);
						console.log(`Selected Vault Path: ${selected}`);
						if (selected) {
							connection.vaultPath = selected;
							await this.plugin.saveSettings();
							this.display();
						}
					}));

			const externalSetting = new Setting(pathsContainer);
			externalSetting.infoEl.empty();  // 기존 이름 비우기
			
			// 폴더 아이콘 추가
			const externalIconSpan = externalSetting.infoEl.createSpan();
			setIcon(externalIconSpan, 'folder')

			externalSetting.infoEl.createSpan({ text: 'External Path' });
			
			externalSetting
				.addText(text => text
					.setValue(connection.externalPath)
					.onChange(value => {
						connection.externalPath = value;
						this.plugin.saveSettings();
					}))
				.addButton(button => button
					.setButtonText('폴더 선택')
					.onClick(async () => {
						const path = await openFolderSelectionDialog();
						console.log(`Selected External Path: ${path}`);
						if (path) {
							connection.externalPath = path;
							await this.plugin.saveSettings();
							this.display();
						}
					}));

			const advancedSection = itemBody.createEl('details', { cls: 'sync-advanced-settings' });
			advancedSection.createEl('summary', { text: 'Advanced Settings', cls: 'sync-advanced-toggle' });
			const advancedContent = advancedSection.createDiv({ cls: 'sync-advanced-content' });

			new Setting(advancedContent)
				.setName('Sync Type')
				.setDesc('Select the sync type')
				.addDropdown(dropdown => dropdown
					.addOption(SyncType.bidirectional, 'Bidirectional')
					.addOption(SyncType.vaultToExternal, 'Vault to External')
					.addOption(SyncType.externalToVault, 'External to Vault')
					.setValue(connection.syncType) // 기본값 설정
					.onChange(async value => {
						connection.syncType = value as SyncType;
						await this.plugin.saveSettings();
			
						// 타이틀 옆 syncType 텍스트만 직접 업데이트
						const directionEl = itemHeaderLeft.querySelector('.sync-connection-direction');
						if (directionEl) {
							directionEl.textContent = connection.syncType;
						}
					}));

			new Setting(advancedContent)
				.setName('Ignore Hidden Files and Folders')
				.setDesc('Example: Default hidden folders starting with .')
				.addToggle(toggle => toggle
					.setValue(connection.ignoreHiddenFiles)
					.onChange(value => {
						connection.ignoreHiddenFiles = value;
						this.plugin.saveSettings();
					}));

			new Setting(advancedContent)
				.setName('Excluded Paths')
				.setDesc('Comma-separated list of paths to exclude (ignored if empty)')
				.addText(text => text
					.setValue(connection.excludeFolders.join(','))
					.onChange(value => {
						connection.excludeFolders = value.split(',').map(folder => folder.trim());
						this.plugin.saveSettings();
					}));

			new Setting(advancedContent)
				.setName('Required Paths')
				.setDesc('Comma-separated list of paths that must be included (overrides exclusions)')
				.addText(text => text
					.setValue(connection.includeFolders.join(','))
					.onChange(value => {
						connection.includeFolders = value.split(',').map(folder => folder.trim());
						this.plugin.saveSettings();
					}));

			new Setting(advancedContent)
				.setName('File Extensions')
				.setDesc('Comma-separated list of file extensions to sync (e.g., .md, .txt)')
				.addText(text => text
					.setValue(connection.extensions.join(','))
					.onChange(value => {
						connection.extensions = value.split(',').map(ext => ext.trim());
						this.plugin.saveSettings();
					}));

			const actionsContainer = itemBody.createDiv({ cls: 'sync-actions-container' });

			new Setting(actionsContainer)
				.addButton(button => button
					.setButtonText('🔄 Sync Now')
					.setCta()
					.setClass('sync-now-button')
					.onClick(() => {
						console.log(`Syncing ${connection.name} now...`);
					}));

			new Setting(actionsContainer)
				.addButton(button => button
					.setButtonText('🗑️ Remove')
					.setCta()
					.setClass('remove-connection-button')
					.onClick(() => {
						new RemoveConnectionModal(this.app, connection.name, () => {
							this.plugin.settings.connections = this.plugin.settings.connections.filter(c => c.id !== connection.id);
							this.plugin.saveSettings();
							this.display();
						}).open();
					}));
		});

		/* Maintenance */
        const maintenanceSection = containerEl.createDiv({ cls: 'setting-section' })

		maintenanceSection.createEl('h2', { text: 'Maintenance' });

		new Setting(maintenanceSection)
			.setName('Sync All Conntection')
			.setDesc('Manually initiate all sync operations')
			.addButton(button => button
				.setButtonText('🔄')
				.setCta()
				.onClick(async () => {
					console.log('Clicked Sync All Conntection');
				}));
		
		new Setting(maintenanceSection)
			.setName('Debug Mode')
			.setDesc('Outputs console logs and toast messages on sync events')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.debugMode)
				.onChange(value => {
					this.plugin.settings.debugMode = value;
					this.plugin.saveSettings();
				}));
	}
}