import { App, PluginSettingTab, Setting, Notice, TFolder, TAbstractFile, setIcon, DropdownComponent, TextComponent, Modal } from 'obsidian';
import { v4 as uuidv4 } from 'uuid';
import MarkdownHijacker from './main';
import * as fs from 'fs';

// 폴더 매핑 인터페이스
export interface FolderMapping {
    id: string;            // 고유 ID (UUID)
    vaultPath: string;     // Vault 내 상대 경로
    externalPath: string;  // 외부 폴더 절대 경로
    enabled: boolean;      // 활성화 여부
}

// 플러그인 설정 인터페이스
export interface MarkdownHijackerSettings {
    pluginEnabled: boolean;         // 플러그인 전체 활성화 여부
    folderMappings: FolderMapping[];// 폴더 매핑 목록
    
    excludeFoldersEnabled: boolean; // 제외할 서브폴더 옵션 활성화 여부
    excludeFolders: string;         // 제외할 서브폴더 목록 (콤마 구분)
    
    includeFoldersEnabled: boolean; // 포함할 서브폴더 옵션 활성화 여부
    includeFolders: string;         // 포함할 서브폴더 목록 (콤마 구분)
    
    syncInterval: number;           // 동기화 확인 간격 (밀리초)
    debugMode: boolean;             // 디버그 모드 활성화 여부
    enableExternalSync: boolean;     // 외부 폴더 동기화 활성화 여부
    showNotifications: boolean;      // 변경 알림 표시 여부
    enableVaultSync: boolean;        // 내부 변경 동기화 활성화 여부
}

// 기본 설정값 정의
export const DEFAULT_SETTINGS: MarkdownHijackerSettings = {
    pluginEnabled: false,
    folderMappings: [],
    excludeFoldersEnabled: false,
    excludeFolders: "",
    includeFoldersEnabled: false,
    includeFolders: "",
    syncInterval: 1000,    // 1초
    debugMode: false,
    enableExternalSync: false,
    showNotifications: true,
    enableVaultSync: false
}

// 설정 탭 클래스
export class MarkdownHijackerSettingTab extends PluginSettingTab {
    plugin: MarkdownHijacker;

    constructor(app: App, plugin: MarkdownHijacker) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const {containerEl} = this;
        containerEl.empty();

        containerEl.createEl('h2', {text: 'Markdown Hijacker 설정'});

        this.addPluginEnableToggle(containerEl);
        this.addFolderMappingSection(containerEl);
        this.addSubfolderFilterSection(containerEl);
        this.addExternalSyncSection(containerEl);
        this.addAdvancedSettingsSection(containerEl);
    }

    private addPluginEnableToggle(containerEl: HTMLElement): void {
        new Setting(containerEl)
            .setName('플러그인 활성화')
            .setDesc('플러그인 기능을 전체적으로 활성화 또는 비활성화합니다.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.pluginEnabled)
                .onChange(async (value) => {
                    this.plugin.settings.pluginEnabled = value;
                    await this.plugin.saveSettings();
                    
                    if (value) {
                        this.plugin.startMonitoring();
                        new Notice('Markdown Hijacker가 활성화되었습니다.');
                    } else {
                        this.plugin.stopMonitoring();
                        new Notice('Markdown Hijacker가 비활성화되었습니다.');
                    }
                }));
    }

    private addFolderMappingSection(containerEl: HTMLElement): void {
        containerEl.createEl('h3', {text: '폴더 매핑 설정'});
        
        const mappingContainer = containerEl.createDiv('mapping-list-container');
        
        // 기존 매핑 목록 표시
        this.plugin.settings.folderMappings.forEach(mapping => {
            this.createMappingElement(mappingContainer, mapping);
        });
        
        // 새 매핑 추가 버튼
        new Setting(containerEl)
            .setName('새 폴더 매핑 추가')
            .setDesc('Vault 내 폴더와 외부 폴더를 연결합니다.')
            .addButton(button => button
                .setButtonText('매핑 추가')
                .setCta()
                .onClick(() => {
                    const newMapping: FolderMapping = {
                        id: uuidv4(),
                        vaultPath: '',
                        externalPath: '',
                        enabled: false
                    };
                    
                    this.plugin.settings.folderMappings.push(newMapping);
                    this.createMappingElement(mappingContainer, newMapping);
                    this.plugin.saveSettings();
                }));
    }
    
    private createMappingElement(container: HTMLElement, mapping: FolderMapping): void {
        const mappingEl = container.createDiv('mapping-item');
        mappingEl.createEl('h4', {text: '폴더 매핑'});
        
        // Vault 경로 설정 (드롭다운 제거, 폴더 선택 버튼만 사용)
        new Setting(mappingEl)
            .setName('Vault 경로')
            .setDesc('Vault 내 상대 경로를 입력하거나 폴더 선택 버튼을 사용하세요.')
            .addText(text => text
                .setPlaceholder('예: 프로젝트/문서')
                .setValue(mapping.vaultPath)
                .onChange(async (value) => {
                    mapping.vaultPath = value;
                    await this.plugin.saveSettings();
                })
            )
            .addButton(button => button
                .setButtonText('폴더 찾기')
                .onClick(() => {
                    // 폴더 브라우저 모달 표시
                    this.showFolderBrowserModal(mapping);
                })
            );
        
        // 외부 경로 설정 (폴더 선택 기능 추가)
        new Setting(mappingEl)
            .setName('외부 폴더 경로')
            .setDesc('동기화할 외부 폴더의 절대 경로를 입력하세요.')
            .addText(text => text
                .setPlaceholder('예: /Users/username/projects/docs')
                .setValue(mapping.externalPath)
                .onChange(async (value) => {
                    mapping.externalPath = value;
                    await this.plugin.saveSettings();
                }))
            .addButton(button => button
                .setButtonText('폴더 선택')
                .onClick(async () => {
                    // 폴더 선택 대화상자 표시
                    await this.openFolderSelectionDialog(mapping);
                }));
        
        // 활성화 토글
        new Setting(mappingEl)
            .setName('매핑 활성화')
            .setDesc('이 폴더 매핑을 활성화 또는 비활성화합니다.')
            .addToggle(toggle => toggle
                .setValue(mapping.enabled)
                .onChange(async (value) => {
                    mapping.enabled = value;
                    await this.plugin.saveSettings();
                    
                    if (this.plugin.settings.pluginEnabled) {
                        if (value) {
                            // 매핑 활성화 시 워처 설정 및 초기 스캔 수행
                            this.plugin.setupWatcher(mapping);
                            
                            // 외부 폴더가 존재하는지 확인
                            if (fs.existsSync(mapping.externalPath)) {
                                new Notice(`폴더 스캔 시작: ${mapping.externalPath}`);
                                
                                // 폴더의 모든 마크다운 파일에 대해 프론트매터 추가 처리
                                try {
                                    // 폴더 초기 스캔 시작
                                    new Notice(`폴더 스캔 중: ${mapping.externalPath}`);
                                    await this.plugin.scanFolderAndSyncToVault(mapping);
                                    new Notice(`폴더 스캔 완료: ${mapping.externalPath}`);
                                } catch (error) {
                                    console.error(`폴더 스캔 오류: ${error}`);
                                    new Notice(`폴더 스캔 중 오류 발생: ${error.message}`);
                                }
                            } else {
                                new Notice(`외부 폴더가 존재하지 않습니다: ${mapping.externalPath}`);
                            }
                        } else {
                            this.plugin.removeWatcher(mapping.id);
                        }
                    }
                }));
        
        // 삭제 버튼
        new Setting(mappingEl)
            .addButton(button => button
                .setButtonText('매핑 삭제')
                .setClass('mod-warning')
                .onClick(async () => {
                    // 매핑 배열에서 해당 항목 제거
                    this.plugin.settings.folderMappings = 
                        this.plugin.settings.folderMappings.filter(m => m.id !== mapping.id);
                    
                    // 관련 파일 워처 제거
                    this.plugin.removeWatcher(mapping.id);
                    
                    // 설정 저장 및 UI 업데이트
                    await this.plugin.saveSettings();
                    mappingEl.remove();
                }));
        
        // 구분선 추가
        mappingEl.createEl('hr');
    }

    private addSubfolderFilterSection(containerEl: HTMLElement): void {
        containerEl.createEl('h3', {text: '서브폴더 필터링 설정'});
        
        // 제외할 서브폴더 설정
        new Setting(containerEl)
            .setName('제외할 서브폴더 활성화')
            .setDesc('특정 서브폴더를 동기화에서 제외합니다.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.excludeFoldersEnabled)
                .onChange(async (value) => {
                    // 제외와 포함 옵션이 동시에 활성화되지 않도록 함
                    if (value && this.plugin.settings.includeFoldersEnabled) {
                        this.plugin.settings.includeFoldersEnabled = false;
                        // UI 갱신을 위해 display()를 다시 호출하는 것이 이상적이지만, 
                        // 간단함을 위해 알림만 표시
                        new Notice('포함 옵션이 비활성화되었습니다.');
                    }
                    
                    this.plugin.settings.excludeFoldersEnabled = value;
                    await this.plugin.saveSettings();
                }));
        
        new Setting(containerEl)
            .setName('제외할 서브폴더 목록')
            .setDesc('동기화에서 제외할 서브폴더 이름을 콤마(,)로 구분하여 입력하세요.')
            .addTextArea(text => text
                .setPlaceholder('예: .git, node_modules, .obsidian')
                .setValue(this.plugin.settings.excludeFolders)
                .onChange(async (value) => {
                    this.plugin.settings.excludeFolders = value;
                    await this.plugin.saveSettings();
                }))
            .setDisabled(!this.plugin.settings.excludeFoldersEnabled);
        
        // 포함할 서브폴더 설정
        new Setting(containerEl)
            .setName('포함할 서브폴더 활성화')
            .setDesc('지정된 서브폴더만 동기화합니다.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.includeFoldersEnabled)
                .onChange(async (value) => {
                    // 제외와 포함 옵션이 동시에 활성화되지 않도록 함
                    if (value && this.plugin.settings.excludeFoldersEnabled) {
                        this.plugin.settings.excludeFoldersEnabled = false;
                        new Notice('제외 옵션이 비활성화되었습니다.');
                    }
                    
                    this.plugin.settings.includeFoldersEnabled = value;
                    await this.plugin.saveSettings();
                }));
        
        new Setting(containerEl)
            .setName('포함할 서브폴더 목록')
            .setDesc('동기화할 서브폴더 이름을 콤마(,)로 구분하여 입력하세요.')
            .addTextArea(text => text
                .setPlaceholder('예: docs, notes, research')
                .setValue(this.plugin.settings.includeFolders)
                .onChange(async (value) => {
                    this.plugin.settings.includeFolders = value;
                    await this.plugin.saveSettings();
                }))
            .setDisabled(!this.plugin.settings.includeFoldersEnabled);
        
        // 경고 메시지
        containerEl.createEl('div', {
            cls: 'setting-warning',
            text: '주의: 제외 옵션과 포함 옵션은 동시에 활성화할 수 없습니다.'
        });
    }

    private addExternalSyncSection(containerEl: HTMLElement): void {
        containerEl.createEl('h3', {text: '외부 폴더 동기화 설정'});
        
        // Enable external sync toggle
        new Setting(containerEl)
            .setName('외부 폴더 동기화 활성화')
            .setDesc('외부 폴더의 변경사항을 실시간으로 감지하고 동기화합니다.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableExternalSync || false)
                .onChange(async (value) => {
                    this.plugin.settings.enableExternalSync = value;
                    await this.plugin.saveSettings();
                    
                    if (value) {
                        this.plugin.startMonitoringExternalChanges();
                        new Notice('외부 폴더 동기화가 활성화되었습니다.');
                    } else {
                        this.plugin.stopMonitoringExternalChanges();
                        new Notice('외부 폴더 동기화가 비활성화되었습니다.');
                    }
                }));
        
        // Enable vault sync toggle (내부 변경 동기화 옵션 추가)
        new Setting(containerEl)
            .setName('내부 변경 동기화 활성화')
            .setDesc('Vault 내부의 변경사항을 감지하고 외부 폴더와 동기화합니다.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableVaultSync || false)
                .onChange(async (value) => {
                    this.plugin.settings.enableVaultSync = value;
                    await this.plugin.saveSettings();
                    
                    if (value) {
                        this.plugin.startMonitoringInternalChanges();
                        new Notice('내부 변경 동기화가 활성화되었습니다.');
                    } else {
                        this.plugin.stopMonitoringInternalChanges();
                        new Notice('내부 변경 동기화가 비활성화되었습니다.');
                    }
                }));
        
        // Show notifications toggle
        new Setting(containerEl)
            .setName('변경 알림 표시')
            .setDesc('파일이 변경되면 알림을 표시합니다.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.showNotifications || true)
                .onChange(async (value) => {
                    this.plugin.settings.showNotifications = value;
                    await this.plugin.saveSettings();
                }));
    }

    private addAdvancedSettingsSection(containerEl: HTMLElement): void {
        containerEl.createEl('h3', {text: '고급 설정'});
        
        // 동기화 간격 설정
        new Setting(containerEl)
            .setName('동기화 간격 (밀리초)')
            .setDesc('파일 변경 확인 간격을 설정합니다. 낮은 값은 빠른 응답을 제공하지만 시스템 리소스를 더 많이 사용합니다.')
            .addSlider(slider => slider
                .setLimits(500, 5000, 100)
                .setValue(this.plugin.settings.syncInterval)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.syncInterval = value;
                    await this.plugin.saveSettings();
                    
                    // 활성화된 경우 모니터링 재시작
                    if (this.plugin.settings.pluginEnabled) {
                        this.plugin.restartMonitoring();
                    }
                }));
        
        // 디버그 모드 설정
        new Setting(containerEl)
            .setName('디버그 모드')
            .setDesc('활성화하면 콘솔에 상세한 로그가 출력됩니다.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.debugMode)
                .onChange(async (value) => {
                    this.plugin.settings.debugMode = value;
                    await this.plugin.saveSettings();
                }));
        
        // 설정 초기화 버튼
        new Setting(containerEl)
            .setName('설정 초기화')
            .setDesc('모든 설정을 기본값으로 되돌립니다.')
            .addButton(button => button
                .setButtonText('초기화')
                .setClass('mod-warning')
                .onClick(async () => {
                    // 확인 대화상자 표시 후 초기화
                    if (confirm('모든 설정을 초기화하시겠습니까?')) {
                        this.plugin.settings = {...DEFAULT_SETTINGS};
                        await this.plugin.saveSettings();
                        this.display(); // UI 다시 로드
                        new Notice('설정이 초기화되었습니다.');
                    }
                }));
    }

    // 모든 폴더 가져오기 헬퍼 메서드
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
    
    // 폴더 브라우저 모달 표시
    private showFolderBrowserModal(mapping: FolderMapping) {
        const modal = new FolderSelectionModal(this.app, this.plugin, (folderPath: string) => {
            mapping.vaultPath = folderPath;
            this.plugin.saveSettings();
            this.display(); // UI 새로고침
        });
        modal.open();
    }

    // 외부 폴더 선택 대화상자 표시 함수
    private async openFolderSelectionDialog(mapping: FolderMapping): Promise<void> {
        try {
            // @electron/remote 패키지를 통한 접근 방식 - 최신 Electron 버전과 호환됨
            // @ts-ignore
            const electron = require('electron');
            // @ts-ignore
            const remote = require('@electron/remote');
            
            if (!remote || !remote.dialog) {
                // Electron API를 사용할 수 없는 경우 수동 입력으로 대체
                throw new Error('Electron API를 사용할 수 없습니다.');
            }
            
            // 플랫폼 확인
            // @ts-ignore
            const platform = process.platform;
            const isWindows = platform === 'win32';
            const isMac = platform === 'darwin';
            const isLinux = platform === 'linux';
            
            // 플랫폼별 특수 옵션 설정
            const options: any = {
                properties: ['openDirectory', 'createDirectory'],
                title: '동기화할 외부 폴더 선택',
                buttonLabel: '선택',
                // 플랫폼별 메시지 조정
                message: isMac ? '동기화할 외부 폴더를 선택하세요 (새 폴더 생성 가능)' : undefined
            };
            
            // 시작 디렉토리 설정 (기존 경로가 있으면 해당 경로의 상위 폴더)
            if (mapping.externalPath) {
                try {
                    // @ts-ignore
                    const path = require('path');
                    const dirPath = path.dirname(mapping.externalPath);
                    if (dirPath) {
                        options.defaultPath = dirPath;
                    }
                } catch (e) {
                    console.error('경로 처리 오류:', e);
                }
            } else {
                // 기본 시작 디렉토리 (사용자 홈 디렉토리)
                try {
                    // @ts-ignore
                    const os = require('os');
                    options.defaultPath = os.homedir();
                } catch (e) {
                    console.error('홈 디렉토리 접근 오류:', e);
                }
            }
            
            // 폴더 선택 대화상자 표시
            const result = await remote.dialog.showOpenDialog(options);
            
            // 사용자가 폴더를 선택한 경우
            if (!result.canceled && result.filePaths.length > 0) {
                const selectedPath = result.filePaths[0];
                
                // 매핑 업데이트 및 설정 저장
                mapping.externalPath = selectedPath;
                await this.plugin.saveSettings();
                
                // UI 새로고침
                this.display();
                
                new Notice(`선택된 폴더: ${selectedPath}`);
            }
        } catch (error) {
            console.error('폴더 선택 대화상자 오류:', error);
            
            // Obsidian의 내장 파일 브라우저 사용 시도
            try {
                // @ts-ignore - Obsidian의 비공개 API 사용
                if (this.app.vault.adapter.basePath && typeof this.app.vault.adapter.showDirectoryPicker === 'function') {
                    new Notice('Obsidian 파일 선택기를 사용합니다.');
                    // @ts-ignore
                    const selectedPath = await this.app.vault.adapter.showDirectoryPicker();
                    if (selectedPath) {
                        mapping.externalPath = selectedPath;
                        await this.plugin.saveSettings();
                        this.display();
                        return;
                    }
                }
            } catch (obsidianError) {
                console.error('Obsidian 파일 선택기 오류:', obsidianError);
            }
            
            // 대체 방법: 사용자에게 경로 직접 입력 요청
            new Notice('시스템 폴더 선택기를 불러올 수 없습니다. 수동으로 경로를 입력해주세요.');
            
            // 대체 방법으로 모달 표시
            this.showManualPathInputModal(mapping);
        }
    }
    
    // 수동 경로 입력을 위한 모달 표시
    private showManualPathInputModal(mapping: FolderMapping): void {
        const modal = new ExternalFolderPathModal(this.app, mapping.externalPath, async (path) => {
            if (path) {
                mapping.externalPath = path;
                await this.plugin.saveSettings();
                this.display();
            }
        });
        modal.open();
    }
}

// 폴더 선택 모달 클래스
export class FolderSelectionModal extends Modal {
    private plugin: MarkdownHijacker;
    private callback: (folderPath: string) => void;
    
    constructor(app: App, plugin: MarkdownHijacker, callback: (folderPath: string) => void) {
        super(app);
        this.plugin = plugin;
        this.callback = callback;
    }
    
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
    
    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
    
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
        
        // 클릭 이벤트
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
        
        // 하위 폴더 처리
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

// 수동 경로 입력을 위한 모달 클래스
class ExternalFolderPathModal extends Modal {
    private path: string;
    private onSubmit: (path: string) => void;
    
    constructor(app: App, initialPath: string, onSubmit: (path: string) => void) {
        super(app);
        this.path = initialPath;
        this.onSubmit = onSubmit;
    }
    
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
    
    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
