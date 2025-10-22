import MarkdownHijacker from "main";

export class StatusBarManager {
    private statusBarEl: HTMLElement;

    constructor(
        private plugin: MarkdownHijacker,
        private label: string = "Synaptic Bridge"
    ) {
        this.statusBarEl = this.plugin.addStatusBarItem();
        this.update();
        this.statusBarEl.setAttr('title', this.label);

        // 설정 변경 이벤트 등록
        this.plugin.registerEvent(
            this.plugin.app.workspace.on("markdown-hijacker:settings-changed", () => {
                this.update();
                this.toggleVisibility(this.plugin.settings.showStatusBar);
            })
        );
        // 최초 표시 상태 반영
        this.toggleVisibility(this.plugin.settings.showStatusBar);
    }

    update() {
        const isEnabled = this.plugin.settings.enableGlobalSync;
        const statusSymbol = isEnabled ? '🟢' : '⚪️';
        this.statusBarEl.setText(`${statusSymbol} Synaptic Bridge`);
    }

    setText(text: string) {
        this.statusBarEl.setText(text);
    }

    toggleVisibility(visible: boolean) {
        this.statusBarEl.style.display = visible ? "" : "none";
    }
}