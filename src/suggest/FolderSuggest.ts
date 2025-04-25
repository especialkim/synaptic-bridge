import { TAbstractFile, TFolder } from "obsidian";
import { BaseSuggest } from "./BaseSuggest";

export class FolderSuggest extends BaseSuggest<TFolder> {
    protected getItems(): TFolder[] {
        const files: TAbstractFile[] = this.props.plugin.app.vault.getAllLoadedFiles();
        return files.filter((file): file is TFolder => file instanceof TFolder);
    }

    protected calculateScore(folder: TFolder, inputStr: string): number {
        const path = folder.path.toLowerCase();
        const folderName = path.split('/').pop()?.toLowerCase() || '';
        let score = 0;

        if (folderName.includes(inputStr.replace(/\s+/g, ''))) score += 100;
        if (folderName.startsWith(inputStr.replace(/\s+/g, ''))) score += 50;
        if (path.includes(inputStr.replace(/\s+/g, ''))) score += 25;

        score += this.calculateConsecutiveMatches(path, inputStr) * 5;
        return score;
    }

    protected getDisplayText(folder: TFolder): string {
        return folder.path;
    }
}