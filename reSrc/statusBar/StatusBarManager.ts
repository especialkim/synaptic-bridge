import { Plugin } from "obsidian";

export class StatusBarManager {
	private statusBarEl: HTMLElement;

	constructor(
		private plugin: Plugin,
		private label: string = "Markdown Hijacker"
	) {
		this.statusBarEl = this.plugin.addStatusBarItem();
		this.update();
		this.statusBarEl.setAttr('title', this.label);

		// 설정 변경 이벤트 등록
		this.plugin.registerEvent(
			this.plugin.app.workspace.on("markdown-hijacker:settings-changed", () => {
				this.update();
			})
		);
	}

	update() {
		const isEnabled = (this.plugin as any).settings.enableGlobalSync;
		const statusSymbol = isEnabled ? '🟢' : '⚪️';
		this.statusBarEl.setText(`${statusSymbol} Hijacker`);
	}
}