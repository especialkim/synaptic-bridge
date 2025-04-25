import { TFile } from "obsidian";
import { BaseSuggest } from "./BaseSuggest";

export class FileSuggest extends BaseSuggest<TFile> {
    protected getItems(): TFile[] {
        return this.props.plugin.app.vault.getFiles();
    }

    protected calculateScore(file: TFile, inputStr: string): number {
        const path = file.path.toLowerCase();
        const fileName = file.basename.toLowerCase();
        let score = 0;

        if (fileName.includes(inputStr.replace(/\s+/g, ''))) score += 100;
        if (fileName.startsWith(inputStr.replace(/\s+/g, ''))) score += 50;
        if (path.includes(inputStr.replace(/\s+/g, ''))) score += 25;

        score += this.calculateConsecutiveMatches(path, inputStr) * 5;
        return score;
    }

    protected getDisplayText(file: TFile): string {
        return file.path;
    }
}