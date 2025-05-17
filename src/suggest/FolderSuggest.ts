import { AbstractInputSuggest, TAbstractFile, TFolder, App } from "obsidian";

export class FolderSuggest extends AbstractInputSuggest<TFolder> {
    private plugin: any;
    constructor(app: App, inputEl: HTMLInputElement, plugin: any) {
        super(app, inputEl);
        this.plugin = plugin;
    }

    getSuggestions(query: string): TFolder[] {
        const files: TAbstractFile[] = this.plugin.app.vault.getAllLoadedFiles();
        return files.filter((file): file is TFolder => file instanceof TFolder)
            .filter(folder => folder.path.toLowerCase().includes(query.toLowerCase()));
    }

    renderSuggestion(folder: TFolder, el: HTMLElement) {
        el.setText(folder.path);
    }

    selectSuggestion(folder: TFolder) {
        const input = document.activeElement as HTMLInputElement;
        if (input) {
            input.value = folder.path;
            input.dispatchEvent(new Event('input', { bubbles: true }));
        }
        this.close();
    }
}