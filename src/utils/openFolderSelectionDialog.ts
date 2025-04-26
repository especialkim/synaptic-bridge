import { Platform } from "obsidian";

export async function openFolderSelectionDialog(): Promise<string | null> {
    try {
        // @ts-ignore
        const electron = require('electron');
        // @ts-ignore
        const remote = require('@electron/remote');

        if (!remote || !remote.dialog) {
            throw new Error('Electron API is not available.');
        }

        const isMac = Platform.isMacOS;

        const options: any = {
            properties: ['openDirectory', 'createDirectory'],
            title: 'Select External Folder to Sync',
            buttonLabel: 'Select',
            message: isMac ? 'Select an external folder to sync (you can create a new folder)' : undefined
        };

        // defaultPath 아예 생략 가능

        const result = await remote.dialog.showOpenDialog(options);

        if (!result.canceled && result.filePaths.length > 0) {
            return result.filePaths[0];
        } else {
            return null;
        }
    } catch (error) {
        console.error('Error in folder selection dialog:', error);
        return null;
    }
}
