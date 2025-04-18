import { App, PluginSettingTab, Setting, Notice, TFolder, TAbstractFile } from 'obsidian';
import * as fs from 'fs';
import MarkdownHijacker from '../main';
import { FolderMapping, DEFAULT_SETTINGS } from './types';
import { FolderSelectionModal } from './modals/folder-selection-modal';
import { ExternalFolderPathModal } from './modals/external-folder-path-modal';
import { generateUUID } from './utils/uuid-utils';

/**
 * 플러그인 설정 탭 클래스
 * 사용자가 플러그인 설정을 변경할 수 있는 UI를 제공합니다.
 */
export class MarkdownHijackerSettingTab extends PluginSettingTab {
    /** 플러그인 인스턴스 */
    plugin: MarkdownHijacker;

    /**
     * 생성자
     * @param app Obsidian 앱 인스턴스
     * @param plugin 플러그인 인스턴스
     */
    constructor(app: App, plugin: MarkdownHijacker) {
        super(app, plugin);
        this.plugin = plugin;
    }

    /**
     * 설정 탭이 표시될 때 호출됩니다.
     * 모든 설정 UI 요소를 구성합니다.
     */
    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h2', { text: 'Markdown Hijacker 설정' });

        // 플러그인 활성화 토글
        this.addPluginEnableToggle(containerEl);

        // 폴더 매핑 섹션
        this.addFolderMappingSection(containerEl);

        // 서브폴더 필터링 섹션
        this.addSubfolderFilterSection(containerEl);

        // 외부 동기화 설정 섹션
        this.addExternalSyncSection(containerEl);

        // 고급 설정 섹션
        this.addAdvancedSettingsSection(containerEl);
    }

    /**
     * 플러그인 활성화 토글 설정을 추가합니다.
     * @param containerEl 컨테이너 요소
     */
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

    /**
     * 폴더 매핑 설정 섹션을 추가합니다.
     * @param containerEl 컨테이너 요소
     */
    private addFolderMappingSection(containerEl: HTMLElement): void {
        containerEl.createEl('h3', {text: '폴더 매핑 설정'});
        
        const mappingContainer = containerEl.createDiv('mapping-list-container');
        
        // 기존 매핑 목록 표시
        this.plugin.settings.folderMappings.forEach(mapping => {
            this.createMappingElement(mappingContainer, mapping);
        });
        
        // 새 매핑 추가 버튼
        if (mappingContainer.parentElement) {
            new Setting(mappingContainer.parentElement)
                .setName('폴더 매핑 추가')
                .setDesc('외부 폴더와 Vault 폴더 간의 새 매핑을 추가합니다.')
                .addButton(button => button
                    .setButtonText('+ 새 매핑 추가')
                    .setCta()
                    .onClick(async () => {
                        // 새 매핑 생성
                        const newMapping: FolderMapping = {
                            id: generateUUID(),
                            externalPath: '',
                            vaultPath: '',
                            enabled: false
                        };
                        
                        // 설정에 추가
                        this.plugin.settings.folderMappings.push(newMapping);
                        await this.plugin.saveSettings();
                        
                        // 설정 UI 새로고침
                        this.display();
                        
                        // 새 매핑이 활성화되고 경로가 설정된 후 초기 스캔을 수행하도록 안내
                        new Notice('새 매핑이 추가되었습니다. 경로를 설정한 후 동기화가 시작됩니다.');
                    }));
        }
    }
    
    /**
     * 개별 매핑 설정 요소를 생성합니다.
     * @param container 컨테이너 요소
     * @param mapping 폴더 매핑 객체
     */
    private createMappingElement(container: HTMLElement, mapping: FolderMapping): void {
        const mappingEl = container.createDiv('mapping-item');
        mappingEl.createEl('h4', {text: '폴더 매핑'});
        
        // Vault 경로 설정
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
        
        // 외부 경로 설정
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
                            try {
                                // 새로운 scanAndSetupMapping 함수를 사용하여 매핑 설정 및 초기화
                                new Notice(`폴더 스캔 및 설정 시작: ${mapping.externalPath}`);
                                await this.plugin.scanAndSetupMapping(mapping);
                                new Notice(`폴더 스캔 및 설정 완료: ${mapping.externalPath}`);
                            } catch (error) {
                                console.error(`폴더 스캔 및 설정 오류: ${error}`);
                                new Notice(`폴더 스캔 및 설정 중 오류 발생: ${error.message}`);
                            }
                        } else {
                            // 매핑 비활성화 시 워처 제거
                            this.plugin.removeWatcher(mapping.id);
                            new Notice(`매핑 비활성화됨: ${mapping.externalPath}`);
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

    /**
     * 서브폴더 필터링 설정 섹션을 추가합니다.
     * @param containerEl 컨테이너 요소
     */
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

    /**
     * 외부 동기화 설정 섹션을 추가합니다.
     * @param containerEl 컨테이너 요소
     */
    private addExternalSyncSection(containerEl: HTMLElement): void {
        containerEl.createEl('h3', {text: '외부 폴더 동기화 설정'});
        
        // 외부 폴더 동기화 활성화 토글
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
        
        // 내부 변경 동기화 활성화 토글
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
        
        // 변경 알림 표시 토글
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

    /**
     * 고급 설정 섹션을 추가합니다.
     * @param containerEl 컨테이너 요소
     */
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

    /**
     * Vault 내 폴더 선택 모달을 표시합니다.
     * @param mapping 현재 수정 중인 폴더 매핑
     */
    private showFolderBrowserModal(mapping: FolderMapping) {
        const modal = new FolderSelectionModal(this.app, this.plugin, (folderPath: string) => {
            mapping.vaultPath = folderPath;
            this.plugin.saveSettings();
            this.display(); // UI 새로고침
        });
        modal.open();
    }

    /**
     * 외부 폴더 선택 대화상자를 표시합니다.
     * 시스템의 네이티브 폴더 선택 대화상자를 사용하며,
     * 실패 시 수동 입력 모달로 대체합니다.
     * 
     * @param mapping 현재 수정 중인 폴더 매핑
     */
    private async openFolderSelectionDialog(mapping: FolderMapping): Promise<void> {
        try {
            // @electron/remote 패키지를 통한 접근
            // @ts-ignore
            const remote = require('@electron/remote');
            
            if (!remote || !remote.dialog) {
                throw new Error('Electron API를 사용할 수 없습니다.');
            }
            
            // 플랫폼 확인
            // @ts-ignore
            const platform = process.platform;
            const isMac = platform === 'darwin';
            
            // 대화상자 옵션 설정
            const options: any = {
                properties: ['openDirectory', 'createDirectory'],
                title: '동기화할 외부 폴더 선택',
                buttonLabel: '선택',
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
            
            // 대체 방법: 사용자에게 경로 직접 입력 요청
            new Notice('시스템 폴더 선택기를 불러올 수 없습니다. 수동으로 경로를 입력해주세요.');
            
            // 대체 방법으로 모달 표시
            this.showManualPathInputModal(mapping);
        }
    }
    
    /**
     * 수동 경로 입력을 위한 모달을 표시합니다.
     * 시스템 파일 선택 대화상자를 사용할 수 없는 경우 대체 수단으로 사용됩니다.
     * 
     * @param mapping 현재 수정 중인 폴더 매핑
     */
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