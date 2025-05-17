import { AbstractInputSuggest, TFile, App } from "obsidian";

export class FileSuggest extends AbstractInputSuggest<TFile> {
    private plugin: any;
    constructor(app: App, inputEl: HTMLInputElement, plugin: any) {
        super(app, inputEl);
        this.plugin = plugin;
    }

    getSuggestions(query: string): TFile[] {
        return this.plugin.app.vault.getFiles().filter((file: TFile) => file.path.toLowerCase().includes(query.toLowerCase()));
    }

    renderSuggestion(file: TFile, el: HTMLElement) {
        el.setText(file.path);
    }

    selectSuggestion(file: TFile) {
        const input = document.activeElement as HTMLInputElement;
        if (input) {
            input.value = file.path;
            input.dispatchEvent(new Event('input', { bubbles: true }));
        }
        this.close();
    }
}