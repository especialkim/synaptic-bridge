import { App, setIcon, TFolder, Modal } from "obsidian";

export function openVaultFolderSelectionDialog(app: App): Promise<string | null> {
    return new Promise(resolve => {
        class VaultFolderModal extends Modal {
			private callback: (folderPath: string | null) => void;
		
			constructor(app: App, callback: (folderPath: string | null) => void) {
				super(app);
				this.callback = callback;
			}
		
			onOpen() {
				const { contentEl } = this;
				contentEl.empty();
				contentEl.addClass("markdown-hijacker-modal-folder-selection");
		
				// 제목
				contentEl.createEl('h2', {
					text: 'Vault 폴더 선택',
					cls: 'vault-modal-title'
				});
		
				// 트리 컨테이너
				const treeContainer = contentEl.createDiv({ cls: 'vault-folder-tree-container' });
				const tree = treeContainer.createDiv({ cls: 'vault-folder-tree' });
		
				// 루트 폴더 가져오기
				const folders = this.getAllFolders()
					.filter(f => f.path.split('/').length === 1)
					.sort((a, b) => a.name.localeCompare(b.name));

				folders.forEach(folder => {
					this.createNode(tree, folder, 0);
				});
		
				// 취소 버튼
				const footer = contentEl.createDiv({ cls: 'vault-modal-footer' });
		
				const cancelBtn = footer.createEl('button', {
					text: '취소',
					cls: 'vault-cancel-button'
				});
				cancelBtn.addEventListener('click', () => {
					this.close();
					this.callback(null);
				});
			}
		
			onClose() {
				this.contentEl.empty();
			}
		
			private getAllFolders(): TFolder[] {
				return this.app.vault.getAllLoadedFiles().filter((f): f is TFolder => f instanceof TFolder);
			}
		
			private createNode(container: HTMLElement, folder: TFolder, depth: number) {
				const itemEl = container.createDiv({ cls: 'vault-folder-item' });
				itemEl.addClass('vault-folder-depth-' + Math.min(depth, 10));
		
				// 접기/펼치기 아이콘
				const toggleEl = itemEl.createSpan({ cls: 'vault-folder-toggle' });
				setIcon(toggleEl, 'chevron-right');
		
				// 폴더 아이콘
				const folderIconEl = itemEl.createSpan({ cls: 'vault-folder-icon' });
				setIcon(folderIconEl, 'folder');
		
				// 폴더 이름
				const subfolderCount = folder.children.filter(c => c instanceof TFolder).length;
				const nameEl = itemEl.createSpan({ text: folder.name, cls: 'vault-folder-name' });
				if (subfolderCount > 0) {
					itemEl.createSpan({ text: ` (${subfolderCount})`, cls: 'vault-folder-count' });
				}
		
				// 자식 컨테이너
				const childrenContainer = container.createDiv({ cls: 'vault-folder-children collapsed' });
		
				// 토글 이벤트
				toggleEl.addEventListener('click', (e) => {
					e.stopPropagation();
					const isCollapsed = childrenContainer.classList.toggle('collapsed');
					setIcon(toggleEl, isCollapsed ? 'chevron-right' : 'chevron-down');
		
					if (!isCollapsed && childrenContainer.childElementCount === 0) {
						const subfolders = folder.children.filter((c): c is TFolder => c instanceof TFolder);
						subfolders.sort((a, b) => a.name.localeCompare(b.name)).forEach(sub => {
							this.createNode(childrenContainer, sub, depth + 1);
						});
					}
				});
		
				// 폴더 이름 클릭 시
				nameEl.addEventListener('click', () => {
					this.close();
					this.callback(folder.path);
				});
		
				// 호버 스타일
				itemEl.addEventListener('mouseenter', () => {
					itemEl.addClass('is-hovered');
				});
				itemEl.addEventListener('mouseleave', () => {
					itemEl.removeClass('is-hovered');
				});
			}
		}

        new VaultFolderModal(app, (folderPath: string | null) => {
            resolve(folderPath);
        }).open();
    })
}