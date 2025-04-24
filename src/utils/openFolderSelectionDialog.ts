export async function openFolderSelectionDialog(): Promise<string | null> {
    try {
        // @ts-ignore
        const electron = require('electron');
        // @ts-ignore
        const remote = require('@electron/remote');

        if (!remote || !remote.dialog) {
            throw new Error('Electron API를 사용할 수 없습니다.');
        }

        const isMac = process.platform === 'darwin';

        const options: any = {
            properties: ['openDirectory', 'createDirectory'],
            title: '동기화할 외부 폴더 선택',
            buttonLabel: '선택',
            message: isMac ? '동기화할 외부 폴더를 선택하세요 (새 폴더 생성 가능)' : undefined
        };

        // defaultPath 아예 생략 가능

        const result = await remote.dialog.showOpenDialog(options);

        if (!result.canceled && result.filePaths.length > 0) {
            return result.filePaths[0];
        } else {
            return null;
        }
    } catch (error) {
        console.error('폴더 선택 대화상자 오류:', error);
        return null;
    }
}
