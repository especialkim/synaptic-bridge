import { Modal } from "obsidian";
import { App } from "obsidian";

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