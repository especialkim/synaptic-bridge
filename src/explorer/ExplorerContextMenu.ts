import MarkdownHijacker from "main";
import { App, TFolder, Menu, Notice } from "obsidian";

/**
 * ExplorerContextMenu
 * 
 * 파일 탐색기에서 동기화 폴더에 대한 컨텍스트 메뉴를 추가하는 모듈
 * - 동기화 폴더에 우클릭 시 "Open in Finder/Explorer" 메뉴 항목 추가
 * - OS별로 적절한 명령어 실행 (macOS/Windows/Linux)
 */
export class ExplorerContextMenu {
    private app: App;
    private plugin: MarkdownHijacker;
    private isSetup: boolean = false;

    constructor(app: App, plugin: MarkdownHijacker) {
        this.app = app;
        this.plugin = plugin;
    }

    /**
     * 컨텍스트 메뉴 이벤트 리스너 등록
     */
    public setup() {
        if (this.isSetup) return;
        this.isSetup = true;

        // 파일 메뉴 이벤트 리스너 등록
        this.plugin.registerEvent(
            this.app.workspace.on('file-menu', (menu, file, source) => {
                this.handleFileMenu(menu, file, source);
            })
        );

        console.log('[ExplorerContextMenu] Context menu setup complete');
    }

    /**
     * 파일 메뉴 핸들러
     */
    private handleFileMenu(menu: Menu, file: any, source: string) {
        // 폴더가 아니면 무시
        if (!(file instanceof TFolder)) {
            return;
        }

        // 동기화가 비활성화되어 있으면 무시
        if (!this.plugin.settings.enableGlobalSync) {
            return;
        }

        // 매칭되는 connection 찾기
        const matchedConnection = this.plugin.settings.connections
            .filter(conn => conn.syncEnabled)
            .find(conn => file.path === conn.internalPath || file.path.endsWith(conn.internalPath));

        if (!matchedConnection) {
            return;
        }

        // 구분선 추가 (Synaptic Bridge 섹션 시작)
        menu.addSeparator();

        // Synaptic Bridge 섹션 헤더 (굵게 표시)
        menu.addItem((item) => {
            item
                .setTitle('Synaptic Bridge')
                .setIcon('zap')
                .setDisabled(true);
        });

        // 1. Rename Connection
        menu.addItem((item) => {
            item
                .setTitle('  Rename Connection')  // 들여쓰기
                .setIcon('pencil')
                .onClick(async () => {
                    await this.renameConnection(matchedConnection);
                });
        });

        // 2. Open in Finder/Explorer
        menu.addItem((item) => {
            const menuLabel = this.getOpenFolderMenuLabel();
            
            item
                .setTitle(`  ${menuLabel}`)  // 들여쓰기
                .setIcon('folder-open')
                .onClick(async () => {
                    await this.plugin.explorerSyncDecorator.openExternalFolder(matchedConnection.externalPath);
                });
        });

        // 3. Copy External Path
        menu.addItem((item) => {
            item
                .setTitle('  Copy External Path')  // 들여쓰기
                .setIcon('copy')
                .onClick(() => {
                    navigator.clipboard.writeText(matchedConnection.externalPath);
                    new Notice(`Copied: ${matchedConnection.externalPath}`);
                });
        });

        // 4. Open Synaptic Bridge Settings
        menu.addItem((item) => {
            item
                .setTitle('  Open Synaptic Bridge Settings')  // 들여쓰기
                .setIcon('settings')
                .onClick(() => {
                    // @ts-ignore - Obsidian internal API
                    this.app.setting.open();
                    // @ts-ignore - Obsidian internal API
                    this.app.setting.openTabById(this.plugin.manifest.id);
                });
        });

        console.log(`[ExplorerContextMenu] Added menu for: ${matchedConnection.name}`);
    }

    /**
     * OS에 맞는 메뉴 레이블 반환
     */
    private getOpenFolderMenuLabel(): string {
        const platform = process.platform;
        
        switch (platform) {
            case 'darwin':
                return 'Open Synced Folder in Finder';
            case 'win32':
                return 'Open Synced Folder in Explorer';
            default:
                return 'Open Synced Folder in File Manager';
        }
    }

    /**
     * Connection 이름 변경
     */
    private async renameConnection(connection: any): Promise<void> {
        const { PromptModal } = await import('../settings/modal');
        
        const modal = new PromptModal(
            this.app,
            'Rename Connection',
            'Enter new connection name:',
            connection.name,
            async (newName: string) => {
                if (!newName || newName.trim() === '') {
                    new Notice('Connection name cannot be empty');
                    return;
                }

                if (newName === connection.name) {
                    return; // 이름이 같으면 변경하지 않음
                }

                // 이름 변경
                connection.name = newName.trim();
                
                // 설정 저장
                await this.plugin.saveData(this.plugin.settings);
                
                // 탐색기 배지 즉시 업데이트
                if (this.plugin.explorerSyncDecorator) {
                    this.plugin.explorerSyncDecorator.decorateAllSyncFolders();
                }
                
                new Notice(`Connection renamed to: ${newName}`);
                console.log(`[ExplorerContextMenu] Connection renamed to: ${newName}`);
            }
        );
        
        modal.open();
    }

    /**
     * 정리 (현재는 특별한 정리 작업 없음)
     */
    public cleanup() {
        this.isSetup = false;
        console.log('[ExplorerContextMenu] Cleanup complete');
    }
}

