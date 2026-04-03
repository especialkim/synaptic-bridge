import { App, Modal, DropdownComponent, Notice } from 'obsidian';
import MarkdownHijacker from 'main';
import { FolderConnectionSettings, FrontmatterPolicy } from './types';

export class FrontmatterPolicyChangeModal extends Modal {
    private plugin: MarkdownHijacker;
    private connection: FolderConnectionSettings;
    private oldPolicy: FrontmatterPolicy;
    private newPolicy: FrontmatterPolicy;
    private dropdown: DropdownComponent;

    constructor(
        app: App,
        plugin: MarkdownHijacker,
        connection: FolderConnectionSettings,
        oldPolicy: FrontmatterPolicy,
        newPolicy: FrontmatterPolicy,
        dropdown: DropdownComponent
    ) {
        super(app);
        this.plugin = plugin;
        this.connection = connection;
        this.oldPolicy = oldPolicy;
        this.newPolicy = newPolicy;
        this.dropdown = dropdown;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('markdown-hijacker-modal');

        contentEl.createEl('h4', { text: 'Frontmatter Policy Change' });
        contentEl.createEl('p', {
            text: `Changing from "${this.oldPolicy}" to "${this.newPolicy}". Frontmatter cleanup/insertion will be performed on all synced files. Apply?`
        });

        const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });

        const confirmButton = buttonContainer.createEl('button', { text: 'Confirm' });
        confirmButton.addClass('mod-cta');
        confirmButton.onclick = async () => {
            this.close();
            await this.applyPolicyChange();
        };

        const cancelButton = buttonContainer.createEl('button', { text: 'Cancel' });
        cancelButton.onclick = () => {
            this.dropdown.setValue(this.oldPolicy);
            this.close();
        };
    }

    onClose() {
        this.contentEl.empty();
    }

    private async applyPolicyChange() {
        try {
            if (this.plugin.externalWatcher) {
                this.plugin.externalWatcher.stopWatching(true);
            }
            if (this.plugin.internalWatcher) {
                this.plugin.internalWatcher.clearEvents();
            }

            await this.plugin.syncService.cleanupFrontmatterForPolicyChange(
                this.connection,
                this.oldPolicy,
                this.newPolicy
            );

            this.connection.frontmatterPolicy = this.newPolicy;
            if (!this.plugin.settings._lastFrontmatterPolicies) {
                this.plugin.settings._lastFrontmatterPolicies = {};
            }
            this.plugin.settings._lastFrontmatterPolicies[this.connection.id] = this.newPolicy;
            await this.plugin.saveData(this.plugin.settings);
        } catch (error) {
            console.error('[FrontmatterPolicyChangeModal] Failed to apply policy change:', error);
            this.connection.frontmatterPolicy = this.oldPolicy;
            if (this.plugin.settings._lastFrontmatterPolicies) {
                this.plugin.settings._lastFrontmatterPolicies[this.connection.id] = this.oldPolicy;
            }
            this.dropdown.setValue(this.oldPolicy);
            new Notice('Failed to apply frontmatter policy change. Settings were not saved.');
        } finally {
            if (this.plugin.settings.enableGlobalSync) {
                if (this.plugin.externalWatcher) {
                    this.plugin.externalWatcher.setupWatcher();
                }
                if (this.plugin.internalWatcher) {
                    this.plugin.internalWatcher.setupWatcher();
                }
            }
        }
    }
}
