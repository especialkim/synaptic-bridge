import { Plugin } from "obsidian";
import { DEFAULT_SETTINGS, ADDITIONAL_DEFAULT_SETTINGS } from "./MarkdownHijackerSettingUI";


export async function loadSettings(plugin: Plugin) {
    // Merge both default settings objects
    const mergedDefaults = Object.assign({}, DEFAULT_SETTINGS, ADDITIONAL_DEFAULT_SETTINGS);
    const settings = Object.assign({}, mergedDefaults, await plugin.loadData());
    return settings;
}