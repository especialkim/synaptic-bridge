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
				tree.style.maxHeight = '400px';
				tree.style.overflowY = 'auto';
		
				// 루트 폴더 가져오기
				const folders = this.getAllFolders()
					.filter(f => f.path.split('/').length === 1)
					.sort((a, b) => a.name.localeCompare(b.name));

				folders.forEach(folder => {
					this.createNode(tree, folder, 0);
				});
		
				// 취소 버튼
				const footer = contentEl.createDiv({ cls: 'vault-modal-footer' });
				footer.style.display = 'flex';
				footer.style.justifyContent = 'flex-end';
				footer.style.marginTop = '15px';
		
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
				return this.app.vault.getAllLoadedFiles().filter(f => f instanceof TFolder) as TFolder[];
			}
		
			private createNode(container: HTMLElement, folder: TFolder, depth: number) {
				const itemEl = container.createDiv({ cls: 'vault-folder-item' });
				itemEl.style.display = 'flex';
				itemEl.style.alignItems = 'center';
				itemEl.style.padding = '4px 0';
				itemEl.style.cursor = 'pointer';
				itemEl.style.paddingLeft = `${depth * 20}px`;
		
				// 접기/펼치기 아이콘
				const toggleEl = itemEl.createSpan({ cls: 'vault-folder-toggle' });
				setIcon(toggleEl, 'chevron-right');
				toggleEl.style.marginRight = '6px';
		
				// 폴더 아이콘
				const folderIconEl = itemEl.createSpan({ cls: 'vault-folder-icon' });
				setIcon(folderIconEl, 'folder');
				folderIconEl.style.marginRight = '6px';
		
				// 폴더 이름
				const nameEl = itemEl.createSpan({ text: folder.name, cls: 'vault-folder-name' });
		
				// 자식 컨테이너
				const childrenContainer = container.createDiv({ cls: 'vault-folder-children collapsed' });
				childrenContainer.style.transition = 'max-height 0.2s ease-out';
		
				// 토글 이벤트
				toggleEl.addEventListener('click', (e) => {
					e.stopPropagation();
					const isCollapsed = childrenContainer.classList.toggle('collapsed');
					setIcon(toggleEl, isCollapsed ? 'chevron-right' : 'chevron-down');
		
					if (!isCollapsed && childrenContainer.childElementCount === 0) {
						const subfolders = folder.children.filter(c => c instanceof TFolder) as TFolder[];
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
					itemEl.style.backgroundColor = 'var(--background-modifier-hover)';
				});
				itemEl.addEventListener('mouseleave', () => {
					itemEl.style.backgroundColor = '';
				});
			}
		}

        new VaultFolderModal(app, (folderPath: string | null) => {
            resolve(folderPath);
        }).open();
    })
}