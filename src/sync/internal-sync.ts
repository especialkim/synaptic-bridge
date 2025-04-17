import { App, Notice, TFile } from 'obsidian';
import * as fs from 'fs';
import * as path from 'path';
import { FolderMapping } from '../../settings';
import { InternalWatcher } from '../watchers/internal-watcher';
import { extractOriginPathFromFrontMatter } from '../utils/frontmatter-utils';

export class InternalSync {
    private app: App;
    private internalWatcher: InternalWatcher;

    constructor(app: App, internalWatcher: InternalWatcher) {
        this.app = app;
        this.internalWatcher = internalWatcher;
        
        console.log(`[Internal Sync] 📊 객체 생성됨: ${this.constructor.name}`);
        console.log(`[Internal Sync] 📊 내부 감시자 참조: ${this.internalWatcher ? '있음' : '없음'}`);
    }

    /**
     * 내부 파일 변경 이벤트 처리 연결
     * @param mapping 폴더 매핑 정보
     */
    public setupSyncHandlers(mapping: FolderMapping): void {
        console.log(`[Internal Sync] 🔌 동기화 핸들러 설정 시작: 매핑 ID=${mapping.id}, 경로=${mapping.vaultPath}`);
        
        // 매핑 ID 검증
        if (!mapping.id) {
            console.error(`[Internal Sync] ⚠️ 매핑 ID가 없습니다! 경로: ${mapping.vaultPath}`);
            return;
        }
        
        // 핸들러 생성 및 등록
        const handler = (eventType: string, file: TFile) => {
            console.log(`[Internal Sync] 🎯 동기화 핸들러 호출됨: ${eventType}, ${file.path}`);
            this.handleInternalChange(mapping, eventType, file);
        };
        
        // 핸들러 등록
        this.internalWatcher.registerSyncHandler(mapping, handler);
        
        // 매핑 등록
        this.internalWatcher.addMapping(mapping);
        
        console.log(`[Internal Sync] ✅ 동기화 핸들러 설정 완료: 매핑 ID=${mapping.id}`);
    }

    /**
     * 내부 파일 변경 이벤트에 따른 외부 파일 동기화 처리
     */
    private async handleInternalChange(
        mapping: FolderMapping, 
        eventType: string, 
        file: TFile
    ): Promise<void> {
        console.log(`[Internal Sync] 💫 이벤트 처리 시작 - 유형: ${eventType}, 파일: ${file.path}`);
        
        try {
            // 마크다운 파일인지 확인
            const isMarkdown = file.extension === 'md';
            console.log(`[Internal Sync] 📄 파일 유형: ${isMarkdown ? '마크다운' : '일반'}`);
            
            // 이벤트 유형에 따라 처리
            if (eventType === 'modify') {
                await this.handleModify(mapping, file, isMarkdown);
            } else if (eventType === 'create') {
                await this.handleCreate(mapping, file, isMarkdown);
            } else if (eventType === 'delete') {
                await this.handleDelete(mapping, file);
            } else if (eventType === 'rename') {
                await this.handleRename(mapping, file, (file as any).oldPath, isMarkdown);
            } else {
                console.log(`[Internal Sync] ⚠️ 지원하지 않는 이벤트 유형: ${eventType}`);
            }
        } catch (error) {
            console.error(`[Internal Sync] 💥 이벤트 처리 중 오류 발생:`, error);
        }
    }

    /**
     * 파일 수정 처리
     */
    private async handleModify(mapping: FolderMapping, file: TFile, isMarkdown: boolean): Promise<void> {
        console.log(`[Internal Sync] 🔄 파일 수정 처리 시작: ${file.path}`);
        
        try {
            // 파일 내용 읽기
            const content = await this.app.vault.read(file);
            console.log(`[Internal Sync] 📄 파일 내용 읽기 완료 (${content.length} 바이트)`);
            
            // 마크다운 파일인 경우 frontmatter에서 originPath 확인
            let externalPath = '';
            if (isMarkdown) {
                const originPath = extractOriginPathFromFrontMatter(content);
                if (originPath) {
                    externalPath = originPath;
                    console.log(`[Internal Sync] 🔍 FrontMatter에서 원본 경로 찾음: ${externalPath}`);
                } else {
                    console.log(`[Internal Sync] ⚠️ FrontMatter에 originPath가 없음`);
                    // originPath가 없으면 매핑 기반으로 계산
                    externalPath = this.vaultToExternalPath(file.path, mapping);
                    console.log(`[Internal Sync] 🔄 계산된 외부 경로: ${externalPath}`);
                }
            } else {
                // 일반 파일은 매핑 기반으로 계산
                externalPath = this.vaultToExternalPath(file.path, mapping);
                console.log(`[Internal Sync] 🔄 계산된 외부 경로: ${externalPath}`);
            }
            
            // 외부 경로 확인
            if (!externalPath) {
                console.error(`[Internal Sync] ❌ 외부 파일 경로를 결정할 수 없음: ${file.path}`);
                return;
            }
            
            // 파일 존재 확인
            const exists = fs.existsSync(externalPath);
            console.log(`[Internal Sync] 🔍 외부 파일 존재 여부: ${exists ? '있음' : '없음'}`);
            
            if (exists) {
                // 파일 내용 쓰기
                fs.writeFileSync(externalPath, content, 'utf8');
                console.log(`[Internal Sync] ✅ 외부 파일 업데이트 완료: ${externalPath}`);
                
                // 알림 표시
                new Notice(`📤 외부 파일 업데이트: ${path.basename(externalPath)}`);
            } else {
                console.error(`[Internal Sync] ❌ 외부 파일이 존재하지 않음: ${externalPath}`);
                
                // 파일 생성을 시도할지 여부 (추후 설정으로 제어 가능)
                const shouldCreate = true;
                if (shouldCreate) {
                    console.log(`[Internal Sync] 🔄 없는 파일 생성 시도: ${externalPath}`);
                    this.ensureParentFolders(externalPath);
                    fs.writeFileSync(externalPath, content, 'utf8');
                    console.log(`[Internal Sync] ✅ 외부 파일 생성 완료: ${externalPath}`);
                    
                    // 알림 표시
                    new Notice(`📝 외부 파일 생성: ${path.basename(externalPath)}`);
                }
            }
        } catch (error) {
            console.error(`[Internal Sync] ❌ 파일 수정 처리 중 오류:`, error);
        }
    }

    /**
     * 파일 생성 처리
     */
    private async handleCreate(mapping: FolderMapping, file: TFile, isMarkdown: boolean): Promise<void> {
        console.log(`[Internal Sync] ➕ 파일 생성 처리 시작: ${file.path}`);
        
        try {
            // 파일 내용 읽기
            const content = await this.app.vault.read(file);
            console.log(`[Internal Sync] 📄 파일 내용 읽기 완료 (${content.length} 바이트)`);
            
            // 외부 경로 계산
            const externalPath = this.vaultToExternalPath(file.path, mapping);
            console.log(`[Internal Sync] 🔄 계산된 외부 경로: ${externalPath}`);
            
            // 외부 파일 존재 확인
            const exists = fs.existsSync(externalPath);
            console.log(`[Internal Sync] 🔍 외부 파일 존재 여부: ${exists ? '있음' : '없음'}`);
            
            // 파일 생성
            if (!exists) {
                // 상위 폴더 생성
                this.ensureParentFolders(externalPath);
                
                // 파일 쓰기
                fs.writeFileSync(externalPath, content, 'utf8');
                console.log(`[Internal Sync] ✅ 외부 파일 생성 완료: ${externalPath}`);
                
                // 알림 표시
                new Notice(`📝 외부 파일 생성: ${path.basename(externalPath)}`);
            } else {
                console.log(`[Internal Sync] ℹ️ 외부 파일이 이미 존재함. 내용 업데이트: ${externalPath}`);
                
                // 파일 내용 업데이트
                fs.writeFileSync(externalPath, content, 'utf8');
                console.log(`[Internal Sync] ✅ 외부 파일 업데이트 완료: ${externalPath}`);
                
                // 알림 표시
                new Notice(`📤 외부 파일 업데이트: ${path.basename(externalPath)}`);
            }
        } catch (error) {
            console.error(`[Internal Sync] ❌ 파일 생성 처리 중 오류:`, error);
        }
    }

    /**
     * 파일 삭제 처리
     */
    private async handleDelete(mapping: FolderMapping, file: TFile): Promise<void> {
        console.log(`[Internal Sync] 🗑️ 파일 삭제 처리 시작: ${file.path}`);
        
        try {
            // 외부 경로 계산 (삭제된 파일은 내용을 읽을 수 없으므로 originPath를 참조할 수 없음)
            const externalPath = this.vaultToExternalPath(file.path, mapping);
            console.log(`[Internal Sync] 🔄 계산된 외부 경로: ${externalPath}`);
            
            // 외부 파일 존재 확인
            if (fs.existsSync(externalPath)) {
                console.log(`[Internal Sync] 🔍 삭제할 외부 파일 존재함: ${externalPath}`);
                
                // 파일 삭제
                fs.unlinkSync(externalPath);
                console.log(`[Internal Sync] ✅ 외부 파일 삭제 완료: ${externalPath}`);
                
                // 알림 표시
                new Notice(`🗑️ 외부 파일 삭제: ${path.basename(externalPath)}`);
            } else {
                console.log(`[Internal Sync] ℹ️ 삭제할 외부 파일이 존재하지 않음: ${externalPath}`);
            }
        } catch (error) {
            console.error(`[Internal Sync] ❌ 파일 삭제 처리 중 오류:`, error);
        }
    }

    /**
     * 파일 이름 변경/이동 처리
     */
    private async handleRename(mapping: FolderMapping, file: TFile, oldPath: string, isMarkdown: boolean): Promise<void> {
        console.log(`[Internal Sync] 📋 파일 이름 변경 처리 시작: ${oldPath} -> ${file.path}`);
        
        try {
            // 이전 외부 경로 계산
            const oldExternalPath = this.vaultToExternalPath(oldPath, mapping);
            console.log(`[Internal Sync] 🔄 이전 외부 경로: ${oldExternalPath}`);
            
            // 새 외부 경로 계산 (frontmatter의 originPath가 아닌 새 파일 경로 기반으로 계산)
            const newExternalPath = this.vaultToExternalPath(file.path, mapping);
            console.log(`[Internal Sync] 🔄 계산된 새 외부 경로: ${newExternalPath}`);
            
            // 새 경로가 비어있거나 유효하지 않은 경우 처리
            if (!newExternalPath) {
                console.error(`[Internal Sync] ❌ 새 외부 경로가 유효하지 않음`);
                throw new Error('새 외부 경로가 유효하지 않습니다.');
            }
            
            // 이전 파일 존재 확인
            const oldExists = fs.existsSync(oldExternalPath);
            console.log(`[Internal Sync] 🔍 이전 외부 파일 존재 여부: ${oldExists ? '있음' : '없음'}`);
            
            // 새 파일 이미 존재하는지 확인
            const newExists = fs.existsSync(newExternalPath);
            console.log(`[Internal Sync] 🔍 새 외부 파일 존재 여부: ${newExists ? '있음' : '없음'}`);
            
            // 파일 내용 읽기
            let content = await this.app.vault.read(file);
            console.log(`[Internal Sync] 📄 파일 내용 읽기 완료: ${content.length} 바이트`);
            
            // 마크다운 파일인 경우 frontmatter의 originPath 업데이트
            if (isMarkdown) {
                console.log(`[Internal Sync] 🔄 FrontMatter의 originPath 업데이트 필요 확인`);
                
                // originPath 확인
                const originPath = extractOriginPathFromFrontMatter(content);
                
                if (originPath) {
                    console.log(`[Internal Sync] 🔍 기존 originPath 발견: ${originPath}`);
                    
                    // originPath가 이전 경로와 관련이 있는지 확인
                    if (originPath === oldExternalPath || originPath.includes(path.basename(oldExternalPath))) {
                        console.log(`[Internal Sync] 🔄 FrontMatter의 originPath 업데이트: ${originPath} -> ${newExternalPath}`);
                        
                        // 정규식으로 frontmatter 내의 originPath 값만 변경
                        const regex = new RegExp(`originPath: .*?(?=\n|$)`, 'g');
                        content = content.replace(regex, `originPath: ${newExternalPath}`);
                        
                        // 변경된 내용으로 파일 업데이트
                        await this.app.vault.modify(file, content);
                        console.log(`[Internal Sync] ✅ 파일 내용의 originPath 업데이트 완료`);
                    } else {
                        console.log(`[Internal Sync] ℹ️ originPath가 이전 경로와 관련이 없어 업데이트 생략`);
                    }
                } else {
                    console.log(`[Internal Sync] ℹ️ originPath가 없어 업데이트 불필요`);
                }
            }
            
            // 새 경로의 상위 폴더 생성
            try {
                this.ensureParentFolders(newExternalPath);
                console.log(`[Internal Sync] ✅ 새 경로 상위 폴더 생성 완료`);
            } catch (error) {
                console.error(`[Internal Sync] ❌ 상위 폴더 생성 오류:`, error);
                throw new Error(`상위 폴더 생성 실패: ${error.message}`);
            }
            
            try {
                // 파일 내용 다시 읽기 (originPath가 업데이트 되었을 수 있음)
                content = await this.app.vault.read(file);
                
                // 새 경로에 파일 작성
                fs.writeFileSync(newExternalPath, content, 'utf8');
                console.log(`[Internal Sync] ✅ 새 경로에 파일 생성 완료: ${newExternalPath}`);
                
                // 이전 파일이 존재하면 삭제
                if (oldExists) {
                    try {
                        fs.unlinkSync(oldExternalPath);
                        console.log(`[Internal Sync] ✅ 이전 파일 삭제 완료: ${oldExternalPath}`);
                    } catch (deleteError) {
                        console.error(`[Internal Sync] ⚠️ 이전 파일 삭제 오류:`, deleteError);
                        // 이전 파일 삭제 실패해도 작업은 계속 진행
                    }
                }
                
                // 알림 표시
                new Notice(`📋 외부 파일 이름 변경: ${path.basename(oldExternalPath)} -> ${path.basename(newExternalPath)}`);
            } catch (fileOpError) {
                console.error(`[Internal Sync] ❌ 파일 작업 오류:`, fileOpError);
                throw new Error(`파일 작업 실패: ${fileOpError.message}`);
            }
        } catch (error) {
            console.error(`[Internal Sync] ❌ 파일 이름 변경 처리 중 오류:`, error);
            new Notice(`⚠️ 파일 이름 변경 실패: ${error.message}`);
        }
    }

    /**
     * Vault 경로를 외부 경로로 변환
     * @param vaultPath Vault 내부 경로
     * @param mapping 폴더 매핑 정보
     * @returns 외부 파일 경로
     */
    private vaultToExternalPath(vaultPath: string, mapping: FolderMapping): string {
        console.log(`[Internal Sync] 🔄 경로 변환 시작: ${vaultPath}`);
        
        // 상대 경로 추출
        const relativePath = vaultPath.replace(mapping.vaultPath, '');
        console.log(`[Internal Sync] 🔍 상대 경로 추출: ${relativePath}`);
        
        // 상대 경로가 없거나 폴더 자체인 경우
        if (!relativePath || relativePath === '/') {
            console.log(`[Internal Sync] ⚠️ 상대 경로가 비어있거나 루트 폴더`);
            return mapping.externalPath;
        }
        
        // 경로 구분자 정규화
        let normalizedPath = relativePath;
        if (normalizedPath.startsWith('/')) {
            normalizedPath = normalizedPath.substring(1);
        }
        console.log(`[Internal Sync] 🔧 정규화된 상대 경로: ${normalizedPath}`);
        
        // 외부 경로 생성
        const result = path.join(mapping.externalPath, normalizedPath);
        console.log(`[Internal Sync] ✅ 외부 경로 변환 결과: ${result}`);
        
        return result;
    }

    /**
     * 상위 폴더들 생성 (재귀적)
     * @param filePath 파일 경로
     */
    private ensureParentFolders(filePath: string): void {
        const folderPath = path.dirname(filePath);
        console.log(`[Internal Sync] 🗂️ 상위 폴더 생성 확인: ${folderPath}`);
        
        // 폴더가 이미 존재하면 종료
        if (fs.existsSync(folderPath)) {
            console.log(`[Internal Sync] ℹ️ 폴더가 이미 존재함: ${folderPath}`);
            return;
        }
        
        try {
            // 재귀적으로 폴더 생성
            fs.mkdirSync(folderPath, { recursive: true });
            console.log(`[Internal Sync] ✅ 폴더 생성 완료: ${folderPath}`);
        } catch (error) {
            console.error(`[Internal Sync] ❌ 폴더 생성 오류:`, error);
            throw error;
        }
    }
} 