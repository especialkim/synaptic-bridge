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
            } else if (eventType === 'deleteDir') {
                // 폴더 삭제 이벤트 처리
                await this.handleDirectoryDelete(mapping, file);
            } else if (eventType === 'rename') {
                await this.handleRename(mapping, file, (file as any).oldPath, isMarkdown);
            } else if (eventType === 'renameDir') {
                // 폴더 이름 변경 이벤트 처리
                await this.handleDirectoryRename(mapping, file, (file as any).oldPath);
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
            
            // 정규화된 경로로 변환
            const normalizedPath = this.normalizeFilePath(externalPath);
            
            // 파일 존재 확인
            const exists = fs.existsSync(normalizedPath);
            console.log(`[Internal Sync] 🔍 외부 파일 존재 여부: ${exists ? '있음' : '없음'}`);
            
            if (exists) {
                // 파일 내용 쓰기
                fs.writeFileSync(normalizedPath, content, 'utf8');
                console.log(`[Internal Sync] ✅ 외부 파일 업데이트 완료: ${normalizedPath}`);
                
                // 알림 표시
                new Notice(`📤 외부 파일 업데이트: ${path.basename(normalizedPath)}`);
            } else {
                console.error(`[Internal Sync] ❌ 외부 파일이 존재하지 않음: ${normalizedPath}`);
                
                // 파일 생성을 시도할지 여부 (추후 설정으로 제어 가능)
                const shouldCreate = true;
                if (shouldCreate) {
                    console.log(`[Internal Sync] 🔄 없는 파일 생성 시도: ${normalizedPath}`);
                    this.ensureParentFolders(normalizedPath);
                    fs.writeFileSync(normalizedPath, content, 'utf8');
                    console.log(`[Internal Sync] ✅ 외부 파일 생성 완료: ${normalizedPath}`);
                    
                    // 알림 표시
                    new Notice(`📝 외부 파일 생성: ${path.basename(normalizedPath)}`);
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
            
            // 정규화된 경로로 변환
            const normalizedPath = this.normalizeFilePath(externalPath);
            
            // 외부 파일 존재 확인
            const exists = fs.existsSync(normalizedPath);
            console.log(`[Internal Sync] 🔍 외부 파일 존재 여부: ${exists ? '있음' : '없음'}`);
            
            // 파일 생성
            if (!exists) {
                // 상위 폴더 생성
                this.ensureParentFolders(normalizedPath);
                
                // 파일 쓰기
                fs.writeFileSync(normalizedPath, content, 'utf8');
                console.log(`[Internal Sync] ✅ 외부 파일 생성 완료: ${normalizedPath}`);
                
                // 알림 표시
                new Notice(`📝 외부 파일 생성: ${path.basename(normalizedPath)}`);
            } else {
                console.log(`[Internal Sync] ℹ️ 외부 파일이 이미 존재함. 내용 업데이트: ${normalizedPath}`);
                
                // 파일 내용 업데이트
                fs.writeFileSync(normalizedPath, content, 'utf8');
                console.log(`[Internal Sync] ✅ 외부 파일 업데이트 완료: ${normalizedPath}`);
                
                // 알림 표시
                new Notice(`📤 외부 파일 업데이트: ${path.basename(normalizedPath)}`);
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
            
            // 정규화된 경로로 변환
            const normalizedPath = this.normalizeFilePath(externalPath);
            
            // 외부 파일 존재 확인
            if (fs.existsSync(normalizedPath)) {
                console.log(`[Internal Sync] 🔍 삭제할 외부 파일 존재함: ${normalizedPath}`);
                
                // 파일 삭제
                fs.unlinkSync(normalizedPath);
                console.log(`[Internal Sync] ✅ 외부 파일 삭제 완료: ${normalizedPath}`);
                
                // 알림 표시
                new Notice(`🗑️ 외부 파일 삭제: ${path.basename(normalizedPath)}`);
                
                // 빈 폴더 정리 - 상위 폴더부터 시작하여 빈 폴더 삭제
                this.cleanEmptyFolders(path.dirname(normalizedPath), mapping.externalPath);
            } else {
                console.log(`[Internal Sync] ℹ️ 삭제할 외부 파일이 존재하지 않음: ${normalizedPath}`);
            }
        } catch (error) {
            console.error(`[Internal Sync] ❌ 파일 삭제 처리 중 오류:`, error);
        }
    }

    /**
     * 빈 폴더 정리 (재귀적으로 상위 폴더까지 검사)
     * @param folderPath 검사할 폴더 경로
     * @param rootPath 삭제 작업을 중단할 루트 경로 (매핑된 외부 폴더)
     */
    private cleanEmptyFolders(folderPath: string, rootPath: string): void {
        if (!folderPath || !fs.existsSync(folderPath)) {
            console.log(`[Internal Sync] ℹ️ 폴더가 존재하지 않음: ${folderPath}`);
            return;
        }
        
        // 루트 경로에 도달하면 중단
        if (folderPath === rootPath) {
            console.log(`[Internal Sync] ℹ️ 루트 폴더에 도달, 삭제 중단: ${rootPath}`);
            return;
        }
        
        try {
            // 폴더 내용 확인
            const items = fs.readdirSync(folderPath);
            
            // 폴더가 비어있으면 삭제
            if (items.length === 0) {
                console.log(`[Internal Sync] 🗑️ 빈 폴더 삭제: ${folderPath}`);
                fs.rmdirSync(folderPath);
                
                // 상위 폴더도 검사
                const parentFolder = path.dirname(folderPath);
                this.cleanEmptyFolders(parentFolder, rootPath);
            } else {
                console.log(`[Internal Sync] ℹ️ 폴더가 비어있지 않음 (${items.length}개 항목): ${folderPath}`);
            }
        } catch (error) {
            console.error(`[Internal Sync] ❌ 빈 폴더 정리 중 오류:`, error);
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
            
            // 정규화된 경로로 변환
            const normalizedOldPath = this.normalizeFilePath(oldExternalPath);
            const normalizedNewPath = this.normalizeFilePath(newExternalPath);
            
            // 새 경로가 비어있거나 유효하지 않은 경우 처리
            if (!normalizedNewPath) {
                console.error(`[Internal Sync] ❌ 새 외부 경로가 유효하지 않음`);
                throw new Error('새 외부 경로가 유효하지 않습니다.');
            }
            
            // 이전 파일 존재 확인
            const oldExists = fs.existsSync(normalizedOldPath);
            console.log(`[Internal Sync] 🔍 이전 외부 파일 존재 여부: ${oldExists ? '있음' : '없음'}`);
            
            // 새 파일 이미 존재하는지 확인
            const newExists = fs.existsSync(normalizedNewPath);
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
                this.ensureParentFolders(normalizedNewPath);
                console.log(`[Internal Sync] ✅ 새 경로 상위 폴더 생성 완료`);
            } catch (error) {
                console.error(`[Internal Sync] ❌ 상위 폴더 생성 오류:`, error);
                throw new Error(`상위 폴더 생성 실패: ${error.message}`);
            }
            
            try {
                // 파일 내용 다시 읽기 (originPath가 업데이트 되었을 수 있음)
                content = await this.app.vault.read(file);
                
                // 새 경로에 파일 작성
                fs.writeFileSync(normalizedNewPath, content, 'utf8');
                console.log(`[Internal Sync] ✅ 새 경로에 파일 생성 완료: ${normalizedNewPath}`);
                
                // 이전 파일이 존재하면 삭제
                if (oldExists) {
                    try {
                        fs.unlinkSync(normalizedOldPath);
                        console.log(`[Internal Sync] ✅ 이전 파일 삭제 완료: ${normalizedOldPath}`);
                    } catch (deleteError) {
                        console.error(`[Internal Sync] ⚠️ 이전 파일 삭제 오류:`, deleteError);
                        // 이전 파일 삭제 실패해도 작업은 계속 진행
                    }
                }
                
                // 알림 표시
                new Notice(`📋 외부 파일 이름 변경: ${path.basename(normalizedOldPath)} -> ${path.basename(normalizedNewPath)}`);
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
     * URL 또는 파일 경로를 정규화하여 fs 함수에서 사용 가능한 형태로 변환
     * file:// URL을 일반 파일 경로로 변환
     * @param filePath 변환할 파일 경로
     * @returns 정규화된 파일 경로
     */
    private normalizeFilePath(filePath: string): string {
        if (!filePath) return '';
        
        // file:// URL 처리
        if (filePath.startsWith('file://')) {
            const normalizedPath = decodeURI(filePath.replace(/^file:\/\//, ''));
            console.log(`[Internal Sync] 🔄 file:// URL을 경로로 변환: ${normalizedPath}`);
            return normalizedPath;
        }
        
        return filePath;
    }

    /**
     * 상위 폴더들 생성 (재귀적)
     * @param filePath 파일 경로
     */
    private ensureParentFolders(filePath: string): void {
        // 경로 정규화
        const normalizedPath = this.normalizeFilePath(filePath);
        
        const folderPath = path.dirname(normalizedPath);
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

    /**
     * 디렉토리 삭제 처리
     */
    private async handleDirectoryDelete(mapping: FolderMapping, file: TFile): Promise<void> {
        // file 매개변수는 실제로 TFolder이지만 인터페이스 호환성을 위해 TFile로 전달됨
        console.log(`[Internal Sync] 🗑️ 폴더 삭제 처리 시작: ${file.path}`);
        
        try {
            // 외부 경로 계산
            const externalPath = this.vaultToExternalPath(file.path, mapping);
            console.log(`[Internal Sync] 🔄 계산된 외부 경로: ${externalPath}`);
            
            // 정규화된 경로로 변환
            const normalizedPath = this.normalizeFilePath(externalPath);
            
            // 외부 폴더 존재 확인
            if (fs.existsSync(normalizedPath)) {
                console.log(`[Internal Sync] 🔍 삭제할 외부 폴더 존재함: ${normalizedPath}`);
                
                try {
                    // 폴더 내용 확인
                    const files = fs.readdirSync(normalizedPath);
                    
                    // 폴더 내 각 파일 삭제
                    for (const fileName of files) {
                        const filePath = path.join(normalizedPath, fileName);
                        const stats = fs.statSync(filePath);
                        
                        if (stats.isDirectory()) {
                            // 재귀적으로 하위 폴더 처리
                            console.log(`[Internal Sync] 🔄 하위 폴더 삭제 처리: ${filePath}`);
                            // 하위 폴더를 파일로 취급하여 같은 핸들러로 처리
                            const subFolderAsTFile = { path: `${file.path}/${fileName}` } as TFile;
                            await this.handleDirectoryDelete(mapping, subFolderAsTFile);
                        } else {
                            // 파일 삭제
                            console.log(`[Internal Sync] 🗑️ 폴더 내 파일 삭제: ${filePath}`);
                            fs.unlinkSync(filePath);
                        }
                    }
                    
                    // 빈 폴더 삭제
                    console.log(`[Internal Sync] 🗑️ 빈 폴더 삭제: ${normalizedPath}`);
                    fs.rmdirSync(normalizedPath);
                    
                    // 알림 표시
                    new Notice(`🗑️ 외부 폴더 삭제: ${path.basename(normalizedPath)}`);
                } catch (error) {
                    console.error(`[Internal Sync] ❌ 폴더 삭제 중 오류:`, error);
                    throw error;
                }
            } else {
                console.log(`[Internal Sync] ℹ️ 삭제할 외부 폴더가 존재하지 않음: ${normalizedPath}`);
            }
        } catch (error) {
            console.error(`[Internal Sync] ❌ 폴더 삭제 처리 중 오류:`, error);
        }
    }

    /**
     * 디렉토리 이름 변경/이동 처리
     */
    private async handleDirectoryRename(mapping: FolderMapping, file: TFile, oldPath: string): Promise<void> {
        console.log(`[Internal Sync] 📋 폴더 이름 변경 처리 시작: ${oldPath} -> ${file.path}`);
        
        try {
            // 이전 외부 경로 계산
            const oldExternalPath = this.vaultToExternalPath(oldPath, mapping);
            console.log(`[Internal Sync] 🔄 이전 외부 경로: ${oldExternalPath}`);
            
            // 새 외부 경로 계산
            const newExternalPath = this.vaultToExternalPath(file.path, mapping);
            console.log(`[Internal Sync] 🔄 계산된 새 외부 경로: ${newExternalPath}`);
            
            // 정규화된 경로로 변환
            const normalizedOldPath = this.normalizeFilePath(oldExternalPath);
            const normalizedNewPath = this.normalizeFilePath(newExternalPath);
            
            // 이전 폴더 존재 확인
            const oldExists = fs.existsSync(normalizedOldPath);
            console.log(`[Internal Sync] 🔍 이전 외부 폴더 존재 여부: ${oldExists ? '있음' : '없음'}`);
            
            // 새 폴더 이미 존재하는지 확인
            const newExists = fs.existsSync(normalizedNewPath);
            console.log(`[Internal Sync] 🔍 새 외부 폴더 존재 여부: ${newExists ? '있음' : '없음'}`);
            
            if (oldExists) {
                // 새 경로의 상위 폴더 생성
                try {
                    this.ensureParentFolders(normalizedNewPath);
                    console.log(`[Internal Sync] ✅ 새 경로 상위 폴더 생성 완료`);
                    
                    // 폴더 이동 또는 복사
                    if (!newExists) {
                        // 새 폴더 생성
                        fs.mkdirSync(normalizedNewPath, { recursive: true });
                        console.log(`[Internal Sync] ✅ 새 폴더 생성: ${normalizedNewPath}`);
                        
                        // 하위 파일 및 폴더 복사
                        this.copyFolderRecursive(normalizedOldPath, normalizedNewPath);
                        
                        // 이전 폴더 삭제
                        this.deleteFolderRecursive(normalizedOldPath);
                        
                        // 알림 표시
                        new Notice(`📋 외부 폴더 이름 변경: ${path.basename(normalizedOldPath)} -> ${path.basename(normalizedNewPath)}`);
                    } else {
                        console.log(`[Internal Sync] ⚠️ 새 경로에 이미 폴더 존재함: ${normalizedNewPath}`);
                        // 기존 폴더와 새 폴더 병합
                        this.mergeFolders(normalizedOldPath, normalizedNewPath);
                        
                        // 알림 표시
                        new Notice(`📋 외부 폴더 병합됨: ${path.basename(normalizedOldPath)} -> ${path.basename(normalizedNewPath)}`);
                    }
                } catch (error) {
                    console.error(`[Internal Sync] ❌ 폴더 이름 변경 중 오류:`, error);
                    throw error;
                }
            } else {
                console.log(`[Internal Sync] ⚠️ 이전 폴더가 존재하지 않음: ${normalizedOldPath}`);
            }
        } catch (error) {
            console.error(`[Internal Sync] ❌ 폴더 이름 변경 처리 중 오류:`, error);
        }
    }
    
    /**
     * 폴더를 재귀적으로 복사
     */
    private copyFolderRecursive(source: string, target: string): void {
        // 대상 폴더가 없으면 생성
        if (!fs.existsSync(target)) {
            fs.mkdirSync(target, { recursive: true });
            console.log(`[Internal Sync] ✅ 대상 폴더 생성: ${target}`);
        }
        
        // 소스 폴더의 모든 파일과 하위 폴더 복사
        const files = fs.readdirSync(source);
        for (const file of files) {
            const sourcePath = path.join(source, file);
            const targetPath = path.join(target, file);
            
            const stats = fs.statSync(sourcePath);
            if (stats.isDirectory()) {
                // 하위 폴더 재귀적 복사
                this.copyFolderRecursive(sourcePath, targetPath);
            } else {
                // 파일 복사
                fs.copyFileSync(sourcePath, targetPath);
                console.log(`[Internal Sync] ✅ 파일 복사: ${sourcePath} -> ${targetPath}`);
            }
        }
    }
    
    /**
     * 폴더 재귀적 삭제
     */
    private deleteFolderRecursive(folderPath: string): void {
        if (fs.existsSync(folderPath)) {
            const files = fs.readdirSync(folderPath);
            
            for (const file of files) {
                const currentPath = path.join(folderPath, file);
                
                if (fs.statSync(currentPath).isDirectory()) {
                    // 하위 폴더 재귀적 삭제
                    this.deleteFolderRecursive(currentPath);
                } else {
                    // 파일 삭제
                    fs.unlinkSync(currentPath);
                    console.log(`[Internal Sync] ✅ 파일 삭제: ${currentPath}`);
                }
            }
            
            // 빈 폴더 삭제
            fs.rmdirSync(folderPath);
            console.log(`[Internal Sync] ✅ 폴더 삭제: ${folderPath}`);
        }
    }
    
    /**
     * 두 폴더를 병합 (소스의 내용을 대상으로 복사 후 소스 삭제)
     */
    private mergeFolders(source: string, target: string): void {
        console.log(`[Internal Sync] 🔄 폴더 병합 시작: ${source} -> ${target}`);
        
        // 소스 폴더의 모든 파일과 하위 폴더를 대상 폴더로 복사
        this.copyFolderRecursive(source, target);
        
        // 소스 폴더 삭제
        this.deleteFolderRecursive(source);
        console.log(`[Internal Sync] ✅ 폴더 병합 완료: ${source} -> ${target}`);
    }
} 