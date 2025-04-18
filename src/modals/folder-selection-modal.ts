import { App, Modal, TFolder, TAbstractFile, setIcon } from 'obsidian';
import MarkdownHijacker from '../../main';

/**
 * Vault 내 폴더 선택을 위한 모달 클래스
 * 트리 형태로 Vault의 폴더 구조를 표시하고 선택할 수 있습니다.
 */
export class FolderSelectionModal extends Modal {
    /** 플러그인 인스턴스 */
    private plugin: MarkdownHijacker;
    /** 폴더 선택 시 호출될 콜백 함수 */
    private callback: (folderPath: string) => void;
    
    /**
     * 생성자
     * @param app Obsidian 앱 인스턴스
     * @param plugin 플러그인 인스턴스
     * @param callback 폴더 선택 시 호출될 콜백 함수
     */
    constructor(app: App, plugin: MarkdownHijacker, callback: (folderPath: string) => void) {
        super(app);
        this.plugin = plugin;
        this.callback = callback;
    }
    
    /**
     * 모달이 열릴 때 호출되는 메서드
     * 폴더 트리 UI를 구성합니다.
     */
    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        
        contentEl.createEl('h2', { text: 'Vault 폴더 선택' });
        
        const folderList = contentEl.createDiv('folder-list');
        folderList.style.maxHeight = '400px';
        folderList.style.overflow = 'auto';
        
        // 모든 폴더 가져오기
        const folders = this.getAllFolders();
        
        // 폴더 트리 구성
        const rootFolder = folders.find(f => f.path === '/') || folders[0];
        this.createFolderTreeItem(folderList, rootFolder, '/');
        
        // 취소 버튼
        const buttonContainer = contentEl.createDiv('modal-button-container');
        buttonContainer.style.display = 'flex';
        buttonContainer.style.justifyContent = 'flex-end';
        buttonContainer.style.marginTop = '15px';
        
        const cancelButton = buttonContainer.createEl('button', { text: '취소' });
        cancelButton.addEventListener('click', () => {
            this.close();
        });
    }
    
    /**
     * 모달이 닫힐 때 호출되는 메서드
     * 정리 작업을 수행합니다.
     */
    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
    
    /**
     * Vault 내의 모든 폴더를 가져옵니다.
     * @returns 폴더 객체 배열
     */
    private getAllFolders(): TFolder[] {
        const folders: TFolder[] = [];
        const files = this.app.vault.getAllLoadedFiles();
        
        files.forEach((file: TAbstractFile) => {
            if (file instanceof TFolder) {
                folders.push(file);
            }
        });
        
        return folders;
    }
    
    /**
     * 폴더 트리 항목을 생성합니다.
     * 재귀적으로 하위 폴더도 표시합니다.
     * 
     * @param container 부모 컨테이너 요소
     * @param folder 표시할 폴더 객체
     * @param path 폴더 경로
     */
    private createFolderTreeItem(container: HTMLElement, folder: TFolder, path: string) {
        const itemEl = container.createDiv('folder-tree-item');
        itemEl.style.padding = '4px 0';
        itemEl.style.cursor = 'pointer';
        
        // 들여쓰기 및 아이콘
        const indentation = path.split('/').length - 1;
        const itemContent = itemEl.createDiv('folder-item-content');
        itemContent.style.paddingLeft = `${indentation * 20}px`;
        
        const iconContainer = itemContent.createSpan('folder-icon');
        setIcon(iconContainer, 'folder');
        iconContainer.style.marginRight = '6px';
        
        // 폴더 이름
        const nameEl = itemContent.createSpan({ text: folder.name || '/' });
        
        // 클릭 이벤트 - 폴더 선택
        itemEl.addEventListener('click', (e) => {
            e.stopPropagation();
            this.callback(folder.path);
            this.close();
        });
        
        // 호버 효과
        itemEl.addEventListener('mouseenter', () => {
            itemEl.style.backgroundColor = 'var(--background-modifier-hover)';
        });
        
        itemEl.addEventListener('mouseleave', () => {
            itemEl.style.backgroundColor = '';
        });
        
        // 하위 폴더 처리 - 재귀적으로 표시
        const subfolders = folder.children
            .filter(child => child instanceof TFolder)
            .sort((a, b) => a.name.localeCompare(b.name));
            
        subfolders.forEach(subfolder => {
            if (subfolder instanceof TFolder) {
                this.createFolderTreeItem(container, subfolder, folder.path + '/' + subfolder.name);
            }
        });
    }
} 