import { App, Modal, TextComponent } from 'obsidian';

/**
 * 외부 폴더 경로 수동 입력을 위한 모달 클래스
 * 시스템 파일 선택 대화상자를 사용할 수 없는 경우 대체 수단으로 사용됩니다.
 */
export class ExternalFolderPathModal extends Modal {
    /** 현재 설정된 경로 */
    private path: string;
    /** 제출 시 콜백 함수 */
    private onSubmit: (path: string) => void;
    
    /**
     * 생성자
     * @param app Obsidian 앱 인스턴스
     * @param initialPath 초기 경로 값
     * @param onSubmit 사용자가 확인을 클릭했을 때 호출될 콜백 함수
     */
    constructor(app: App, initialPath: string, onSubmit: (path: string) => void) {
        super(app);
        this.path = initialPath;
        this.onSubmit = onSubmit;
    }
    
    /**
     * 모달이 열릴 때 호출되는 메서드
     * UI 요소를 구성합니다.
     */
    onOpen() {
        const { contentEl } = this;
        
        contentEl.createEl('h2', { text: '외부 폴더 경로 입력' });
        
        // 설명 추가
        contentEl.createEl('p', { 
            text: '동기화할 외부 폴더의 절대 경로를 입력하세요.' 
        });
        
        // 경로 입력 필드
        const inputContainer = contentEl.createDiv();
        inputContainer.style.margin = '10px 0';
        
        const pathInput = new TextComponent(inputContainer)
            .setPlaceholder('예: /Users/username/projects/docs')
            .setValue(this.path);
        
        pathInput.inputEl.style.width = '100%';
        
        // 버튼 컨테이너
        const buttonContainer = contentEl.createDiv();
        buttonContainer.style.display = 'flex';
        buttonContainer.style.justifyContent = 'flex-end';
        buttonContainer.style.marginTop = '20px';
        
        // 취소 버튼
        const cancelButton = buttonContainer.createEl('button', { text: '취소' });
        cancelButton.style.marginRight = '10px';
        cancelButton.addEventListener('click', () => {
            this.close();
        });
        
        // 확인 버튼
        const confirmButton = buttonContainer.createEl('button', { text: '확인' });
        confirmButton.classList.add('mod-cta');
        confirmButton.addEventListener('click', () => {
            this.onSubmit(pathInput.getValue());
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
} 