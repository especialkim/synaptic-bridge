import MarkdownHijacker from "main";
import { App, Notice } from "obsidian";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export class ExplorerSyncDecorator {
    private app: App;
    private plugin: MarkdownHijacker;
    private decoratedPaths: Set<string> = new Set();
    private isSetup: boolean = false;
    private explorerObserver: MutationObserver | null = null;

    constructor(app: App, plugin: MarkdownHijacker) {
        this.app = app;
        this.plugin = plugin;
    }

    /**
     * Set up explorer decoration, event listener, and MutationObserver. Safe to call multiple times.
     */
    public setup() {
        if (this.isSetup) return;
        this.isSetup = true;
        this.plugin.registerEvent(
            this.app.workspace.on('layout-change', this.decorateAllSyncFolders)
        );
        this.observeExplorer();
    }

    /**
     * Set up a MutationObserver to watch for file explorer DOM changes.
     */
    private observeExplorer() {
        if (this.explorerObserver) return;
        // Try to find the file explorer panel
        // This selector may need adjustment depending on Obsidian version/skin
        const explorer = document.querySelector('.workspace-leaf-content[data-type="file-explorer"]') || document.body;
        this.explorerObserver = new MutationObserver(() => {
            const count = document.querySelectorAll('.nav-folder-title').length;
            if (count > 0) {
                this.decorateAllSyncFolders();
            }
        });
        this.explorerObserver.observe(explorer, { childList: true, subtree: true });
    }

    /**
     * Remove all decorations and disconnect MutationObserver.
     */
    public cleanup() {
        document.querySelectorAll('.sync-folder-badge').forEach(el => el.remove());
        this.decoratedPaths.clear();
        this.isSetup = false;
        if (this.explorerObserver) {
            this.explorerObserver.disconnect();
            this.explorerObserver = null;
        }
    }

    public decorateAllSyncFolders = () => {
        // 1. MutationObserver 일시 해제
        if (this.explorerObserver) {
            this.explorerObserver.disconnect();
        }
    
        // 2. 기존 badge 모두 제거
        document.querySelectorAll('.sync-folder-badge').forEach(el => el.remove());
        this.decoratedPaths.clear();
    
        // 3. enableGlobalSync가 꺼져 있으면 바로 종료
        if (!this.plugin.settings.enableGlobalSync) {
            // 4. MutationObserver 다시 등록
            this.observeExplorer();
            return;
        }
    
        // 5. 활성화된 동기화 connections 가져오기
        const enabledConnections = this.plugin.settings.connections
            .filter(conn => conn.syncEnabled);
    
        const folderTitles = document.querySelectorAll('.nav-folder-title');
    
        folderTitles.forEach(folderTitle => {
            const dataPath = (folderTitle as HTMLElement).getAttribute('data-path');
            if (!dataPath) return;
    
            // 매칭되는 connection 찾기
            const matchedConnection = enabledConnections.find(conn => 
                dataPath.endsWith(conn.internalPath)
            );
    
            if (matchedConnection) {
                // 이미 배지가 있으면 건너뛰기
                if (folderTitle.querySelector('.sync-folder-badge')) {
                    return;
                }
                
                const contentEl = folderTitle.querySelector('.nav-folder-title-content');
                if (contentEl) {
                    // 텍스트 배지 생성
                    const badge = document.createElement('span');
                    badge.className = 'sync-folder-badge';
                    badge.textContent = matchedConnection.name;
                    badge.style.cursor = 'pointer';
                    
                    // Tooltip 설정 (빠른 표시를 위해 data-tooltip 사용)
                    badge.setAttribute('aria-label', `Click to open synced folder\n${matchedConnection.externalPath}`);
                    badge.setAttribute('data-tooltip-delay', '100'); // 100ms 지연
                    
                    // 배지 클릭 이벤트 - 외부 폴더 열기
                    badge.addEventListener('click', async (e) => {
                        e.stopPropagation(); // 폴더 열기 방지
                        await this.openExternalFolder(matchedConnection.externalPath);
                    });
                    
                    // // Tooltip을 빠르게 표시하기 위한 이벤트
                    // let tooltipTimeout: NodeJS.Timeout;
                    // badge.addEventListener('mouseenter', () => {
                    //     tooltipTimeout = setTimeout(() => {
                    //         badge.title = `Click to open synced folder\n${matchedConnection.externalPath}`;
                    //     }, 100);
                    // });
                    // badge.addEventListener('mouseleave', () => {
                    //     clearTimeout(tooltipTimeout);
                    //     badge.title = '';
                    // });
                    
                    // 폴더 타이틀에 sync-folder 클래스와 connection ID 추가 (우클릭 메뉴용)
                    (folderTitle as HTMLElement).classList.add('sync-folder');
                    (folderTitle as HTMLElement).setAttribute('data-sync-connection-id', matchedConnection.id);
                    
                    contentEl.appendChild(badge);
                    this.decoratedPaths.add(dataPath);
                }
            }
        });
    
        // 6. MutationObserver 다시 등록
        this.observeExplorer();
    }

    /**
     * 외부 폴더를 OS의 파일 관리자에서 열기
     */
    public async openExternalFolder(externalPath: string): Promise<void> {
        const platform = process.platform;
        let command: string;

        try {
            switch (platform) {
                case 'darwin':
                    // macOS: Finder에서 열기
                    command = `open "${externalPath}"`;
                    break;
                case 'win32':
                    // Windows: Explorer에서 열기
                    command = `explorer "${externalPath}"`;
                    break;
                default:
                    // Linux: xdg-open 사용
                    command = `xdg-open "${externalPath}"`;
                    break;
            }

            await execAsync(command);
        } catch (error) {
            console.error('[ExplorerSyncDecorator] Failed to open folder:', error);
            new Notice(`Failed to open folder: ${error.message}`);
        }
    }
}