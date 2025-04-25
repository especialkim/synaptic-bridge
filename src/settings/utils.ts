import { Notice, Plugin, Setting, ToggleComponent } from "obsidian";
import { DEFAULT_SETTINGS } from "./MarkdownHijackerSettingUI";
import { FolderConnectionSettings } from "./types";
import { isExistDirectory } from "src/utils/pathUtils";
import MarkdownHijacker from "main";

export async function loadSettings(plugin: Plugin) {
    // Merge both default settings objects
    const settings = Object.assign({}, DEFAULT_SETTINGS, await plugin.loadData());
    return settings;
}

export function validateConnectionPaths(connection: FolderConnectionSettings): { valid: boolean, message?: string } {
	const externalValid = isExistDirectory(connection.externalPath);
	if (!externalValid) {
		return { valid: false, message: "External Path is not valid" };
	}

	const internalValid = connection.internalPath.trim() !== '';
	if (!internalValid) {
		return { valid: false, message: "Please specify a valid Vault path." };
	}

	return { valid: true };
}

/**
 * 연결의 동기화를 비활성화하고 UI 토글 상태도 false로 반영
 */
export function disableSync(connection: FolderConnectionSettings, syncToggleComponent: ToggleComponent): void {
    // 여기서 syncToggle 에 처리하면 안되나?

    if(!connection.syncEnabled) return
    connection.syncEnabled = false;
    syncToggleComponent.setValue(false);
    new Notice("Sync disabled. Re-enable after changes.");
}

export async function saveSettings(plugin: MarkdownHijacker) {
    await plugin.saveData(plugin.settings);    
    (plugin.app.workspace as any).trigger('markdown-hijacker:settings-changed');
}