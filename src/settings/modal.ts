import { Modal } from "obsidian";
import { App } from "obsidian";

export class PromptModal extends Modal {
	constructor(
		app: App, 
		title: string, 
		message: string, 
		defaultValue: string, 
		onConfirm: (value: string) => void
	) {
		super(app);
		this.title = title;
		this.message = message;
		this.defaultValue = defaultValue;
		this.onConfirm = onConfirm;
	}

	title: string;
	message: string;
	defaultValue: string;
	onConfirm: (value: string) => void;
	inputEl: HTMLInputElement;

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("markdown-hijacker-modal");

		contentEl.createEl("h3", { text: this.title });
		contentEl.createEl("p", { text: this.message });

		this.inputEl = contentEl.createEl("input", { 
			type: "text",
			value: this.defaultValue
		});
		this.inputEl.addClass("markdown-hijacker-input");
		this.inputEl.style.width = "100%";
		this.inputEl.style.marginBottom = "10px";

		// Enter 키로 확인
		this.inputEl.addEventListener("keydown", (e) => {
			if (e.key === "Enter") {
				this.onConfirm(this.inputEl.value);
				this.close();
			} else if (e.key === "Escape") {
				this.close();
			}
		});

		const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });

		const confirmButton = buttonContainer.createEl("button", { text: "Confirm" });
		const cancelButton = buttonContainer.createEl("button", { text: "Cancel" });

		confirmButton.addClass("mod-cta");
		confirmButton.onclick = () => {
			this.onConfirm(this.inputEl.value);
			this.close();
		};

		cancelButton.onclick = () => this.close();

		// 입력 필드에 포커스
		setTimeout(() => {
			this.inputEl.focus();
			this.inputEl.select();
		}, 10);
	}

	onClose() {
		this.contentEl.empty();
	}
}

export class RemoveConnectionModal extends Modal {
	constructor(app: App, connectionName: string, onConfirm: () => void) {
		super(app);
		this.connectionName = connectionName;
		this.onConfirm = onConfirm;
	}

	connectionName: string;
	onConfirm: () => void;

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
        contentEl.addClass("markdown-hijacker-modal");

		contentEl.createEl("h4", { text: `Are you sure you want to remove the connection "${this.connectionName}"?` });

		const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });

		const yesButton = buttonContainer.createEl("button", { text: "Yes" });
		const noButton = buttonContainer.createEl("button", { text: "No" });

		yesButton.addClass("mod-cta");
		yesButton.onclick = () => {
			this.onConfirm();
			this.close();
		};

		noButton.onclick = () => this.close();
        noButton.addClass("mod-cta");
	}

	onClose() {
		this.contentEl.empty();
	}
}