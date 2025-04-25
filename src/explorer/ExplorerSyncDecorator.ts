import MarkdownHijacker from "main";
import { App } from "obsidian";

export class ExplorerSyncDecorator {
    private app: App;
    private plugin: MarkdownHijacker;
    private decoratedPaths: Set<string> = new Set();

    constructor(app: App, plugin: MarkdownHijacker) {
        this.app = app;
        this.plugin = plugin;
    }

    public setup() {
        this.decorateAllSyncFolders();
        // 탐색기 갱신(폴더 추가/이동 등)에도 다시 적용
        this.app.workspace.on('layout-change', this.decorateAllSyncFolders);
    }

    public cleanup() {
        // 모든 뱃지 제거
        document.querySelectorAll('.sync-folder-badge').forEach(el => el.remove());
        this.decoratedPaths.clear();
        // 이벤트 리스너 해제 (필요시)
        // Obsidian의 this.registerEvent로 등록하면 자동 해제됨
    }

    private decorateAllSyncFolders = () => {
        // 동기화 폴더 목록 (internalPath 기준, 절대경로 or 상대경로)
        const syncFolders = this.plugin.settings.connections
            .filter(conn => conn.syncEnabled)
            .map(conn => conn.internalPath);

        // 모든 폴더 타이틀 DOM 탐색
        document.querySelectorAll('.nav-folder-title').forEach(folderTitle => {
            const dataPath = (folderTitle as HTMLElement).getAttribute('data-path');
            if (!dataPath) return;

            // 동기화 폴더에 해당하는지 체크
            if (syncFolders.some(syncPath => dataPath.endsWith(syncPath))) {
                // 이미 뱃지가 있으면 중복 추가 방지
                if (folderTitle.querySelector('.sync-folder-badge')) return;

                // 폴더명 오른쪽에 작은 원 추가
                const contentEl = folderTitle.querySelector('.nav-folder-title-content');
                if (contentEl) {
                    const badge = document.createElement('span');
                    badge.className = 'sync-folder-badge';
                    badge.title = 'This folder is being synced';
                    // 작은 초록색 원 SVG
                    badge.innerHTML = `<svg width="10" height="10" style="vertical-align: middle;"><circle cx="5" cy="5" r="4" fill="var(--color-accent)"/></svg>`;
                    badge.style.marginLeft = '6px';
                    contentEl.appendChild(badge);
                    this.decoratedPaths.add(dataPath);
                }
            }
        });
    }
}