import MarkdownHijacker from "main";
import { App } from "obsidian";

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
    
        // 5. 동기화 폴더에만 badge 추가
        const syncFolders = this.plugin.settings.connections
            .filter(conn => conn.syncEnabled)
            .map(conn => conn.internalPath);
    
        const folderTitles = document.querySelectorAll('.nav-folder-title');
    
        folderTitles.forEach(folderTitle => {
            const dataPath = (folderTitle as HTMLElement).getAttribute('data-path');
            if (!dataPath) return;
    
            if (syncFolders.some(syncPath => dataPath.endsWith(syncPath))) {
                if (folderTitle.querySelector('.sync-folder-badge')) {
                    return;
                }
                const contentEl = folderTitle.querySelector('.nav-folder-title-content');
                if (contentEl) {
                    const badge = document.createElement('span');
                    badge.className = 'sync-folder-badge';
                    badge.title = 'This folder is being synced';
                    // SVG를 DOM API로 안전하게 생성
                    const svgNS = "http://www.w3.org/2000/svg";
                    const svg = document.createElementNS(svgNS, "svg");
                    svg.setAttribute("width", "10");
                    svg.setAttribute("height", "10");
                    svg.classList.add("sync-folder-badge-svg");
                    const circle = document.createElementNS(svgNS, "circle");
                    circle.setAttribute("cx", "5");
                    circle.setAttribute("cy", "5");
                    circle.setAttribute("r", "4");
                    circle.setAttribute("fill", "var(--color-accent)");
                    svg.appendChild(circle);
                    badge.appendChild(svg);
                    contentEl.appendChild(badge);
                    this.decoratedPaths.add(dataPath);
                }
            }
        });
    
        // 6. MutationObserver 다시 등록
        this.observeExplorer();
    }
}