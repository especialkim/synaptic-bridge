import * as path from 'path';
import { App, TFile } from 'obsidian';
import { FolderMapping } from '../../settings';

/**
 * 프론트매터 유틸리티 클래스
 */
export class FrontMatterUtils {
    private app: App;

    constructor(app: App) {
        this.app = app;
    }

    /**
     * 프론트매터 처리
     * @param content 파일 내용
     * @param options 옵션
     * @returns 처리된 내용과 수정 여부
     */
    public processFrontMatter(
        content: string, 
        options: {
            mappingId: string,
            vaultPath: string,
            appendFrontMatter?: boolean,
            frontMatterTemplate?: string,
            externalPath?: string
        }
    ): { content: string, modified: boolean } {
        console.log(`[FrontMatterUtils] 프론트매터 처리 시작: ${options.vaultPath}`);
        
        const vaultName = this.app.vault.getName();
        
        // 외부 파일 경로가 없는 경우 수정 없음
        if (!options.vaultPath) {
            return { content, modified: false };
        }
        
        // 프론트매터 추가 여부 확인
        if (options.appendFrontMatter === false) {
            console.log(`[FrontMatterUtils] 프론트매터 추가 비활성화됨`);
            return { content, modified: false };
        }
        
        // 사용할 실제 경로 결정
        const filePath = options.externalPath || options.vaultPath;
        console.log(`[FrontMatterUtils] 사용할 경로: ${filePath}`);
        
        // 기존 프론트매터에서 originPath와 vaultLink 확인
        const originPath = extractOriginPathFromFrontMatter(content);
        const hasVaultLink = checkHasVaultLink(content, vaultName, options.vaultPath);
        
        // originPath는 있지만 vaultLink가 없는 경우 또는 업데이트가 필요한 경우
        const needsUpdate = !originPath || !hasVaultLink || options.frontMatterTemplate || options.externalPath;
        
        if (!needsUpdate) {
            console.log(`[FrontMatterUtils] 모든 프론트매터 필드가 존재하고 업데이트 필요 없음`);
            return { content, modified: false };
        }
        
        console.log(`[FrontMatterUtils] 프론트매터 업데이트 필요: originPath=${!!originPath}, vaultLink=${hasVaultLink}`);
        
        // 프론트매터 추가 또는 업데이트
        const updatedContent = addOriginPathFrontMatter(
            content, 
            filePath, 
            vaultName, 
            options.vaultPath
        );
        
        // 수정 여부 확인
        const modified = content !== updatedContent;
        console.log(`[FrontMatterUtils] 프론트매터 처리 결과: ${modified ? '수정됨' : '변경 없음'}`);
        
        return { content: updatedContent, modified };
    }
}

/**
 * 프론트매터 유틸리티 함수
 */

/**
 * 파일에 프론트매터가 있는지 확인
 * @param content 파일 내용
 */
export function hasFrontMatter(content: string): boolean {
    if (!content) return false;
    const trimmedContent = content.trim();
    const result = trimmedContent.startsWith('---') && /^---\s*\n([\s\S]*?)\n---/.test(trimmedContent);
    console.log(`[FrontMatter] hasFrontMatter 결과: ${result}, 내용 시작: ${trimmedContent.substring(0, Math.min(20, trimmedContent.length))}`);
    return result;
}

/**
 * 파일의 originPath 프론트매터 값을 가져옴
 * @param content 파일 내용
 */
export function getOriginPath(content: string): string | null {
    if (!content) return null;
    
    // 프론트매터 영역 추출
    const frontMatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
    if (!frontMatterMatch) {
        console.log('[FrontMatter] 프론트매터 영역을 찾을 수 없음');
        return null;
    }
    
    const frontMatter = frontMatterMatch[1];
    console.log(`[FrontMatter] 추출된 프론트매터: ${frontMatter}`);
    
    // originPath 값 추출
    const originPathMatch = frontMatter.match(/originPath:\s*([^\n]+)/);
    const originPath = originPathMatch ? originPathMatch[1].trim() : null;
    
    console.log(`[FrontMatter] originPath 값: ${originPath}`);
    return originPath;
}

/**
 * Frontmatter에서 originPath 값을 추출하는 함수
 * @param content 마크다운 컨텐츠
 * @returns 추출된 originPath 값 또는 null
 */
export function extractOriginPathFromFrontMatter(content: string): string | null {
    console.log(`[FrontMatter Utils] originPath 추출 시작`);
    
    // Frontmatter 추출을 위한 정규식
    const frontmatterRegex = /^---\n([\s\S]*?)\n---/;
    
    const match = content.match(frontmatterRegex);
    if (!match) {
        console.log(`[FrontMatter Utils] Frontmatter가 없음`);
        return null;
    }
    
    const frontmatter = match[1];
    
    // originPath 값 추출
    const originPathRegex = /originPath:\s*(.+?)(?:\n|$)/;
    const originPathMatch = frontmatter.match(originPathRegex);
    
    if (originPathMatch) {
        const path = originPathMatch[1].trim();
        console.log(`[FrontMatter Utils] originPath 추출됨: ${path}`);
        return path;
    }
    
    console.log(`[FrontMatter Utils] originPath 없음`);
    return null;
}

/**
 * Frontmatter에 vaultLink가 있는지 확인하는 함수
 * @param content 마크다운 컨텐츠
 * @param vaultName Obsidian Vault 이름
 * @param vaultPath Vault 내 파일 경로
 * @returns vaultLink가 있는지 여부
 */
export function checkHasVaultLink(content: string, vaultName: string, vaultPath: string): boolean {
    console.log(`[FrontMatter Utils] vaultLink 확인 시작`);
    
    if (!vaultName || !vaultPath) {
        console.log(`[FrontMatter Utils] vaultName 또는 vaultPath가 없어 vaultLink 확인 불가`);
        return false;
    }
    
    // Frontmatter 추출을 위한 정규식
    const frontmatterRegex = /^---\n([\s\S]*?)\n---/;
    
    const match = content.match(frontmatterRegex);
    if (!match) {
        console.log(`[FrontMatter Utils] Frontmatter가 없음`);
        return false;
    }
    
    const frontmatter = match[1];
    
    // frontmatter에 vaultLink 필드가 있는지만 확인 (정확한 값 비교 없이)
    const hasVaultLinkField = /vaultLink:\s*.+/.test(frontmatter);
    console.log(`[FrontMatter Utils] vaultLink 필드 ${hasVaultLinkField ? '있음' : '없음'}`);
    
    return hasVaultLinkField;
}

/**
 * 마크다운 파일에 originPath frontmatter를 추가하는 함수
 * @param content 원본 마크다운 컨텐츠
 * @param filePath 파일 경로
 * @param vaultName Obsidian Vault 이름
 * @param vaultPath Vault 내 파일 경로
 * @param mappingRoot 매핑된 외부 폴더의 루트 경로
 * @returns frontmatter가 추가된 컨텐츠
 */
export function addOriginPathFrontMatter(
    content: string, 
    filePath: string, 
    vaultName: string = '', 
    vaultPath: string = '',
    mappingRoot: string = ''
): string {
    console.log(`[FrontMatter] addOriginPathFrontMatter 호출됨: path=${filePath}`);
    
    // 파일 경로를 URI 형식으로 인코딩 (file:// 형식으로 변환)
    const fileUri = `file://${encodeURI(filePath).replace(/#/g, '%23').replace(/\s/g, '%20')}`;
    const rootUri = mappingRoot ? `file://${encodeURI(mappingRoot).replace(/#/g, '%23').replace(/\s/g, '%20')}` : '';
    
    // Obsidian URI 링크 생성
    const obsidianUri = vaultName && vaultPath 
        ? `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(vaultPath)}`
        : '';
    
    console.log(`[FrontMatter] URI 생성: fileUri=${fileUri}, rootUri=${rootUri}, obsidianUri=${obsidianUri}`);
    
    // Frontmatter 있는지 확인
    const frontmatterRegex = /^---\n([\s\S]*?)\n---/;
    const match = content.match(frontmatterRegex);
    
    if (match) {
        console.log(`[FrontMatter] 기존 프론트매터 발견, 분석 중...`);
        
        // 전체 frontmatter
        const wholeFm = match[0];
        
        // frontmatter 내용
        const fmContent = match[1];
        
        // 항목별 패턴
        const originPathRegex = /originPath:\s*(.+?)(?:\n|$)/;
        const originRootRegex = /originRoot:\s*(.+?)(?:\n|$)/;
        const vaultLinkRegex = /vaultLink:\s*(.+?)(?:\n|$)/;
        
        // 각 항목별 업데이트된 내용
        let updatedFm = fmContent;
        
        // originPath 업데이트 또는 추가
        if (updatedFm.match(originPathRegex)) {
            updatedFm = updatedFm.replace(originPathRegex, `originPath: ${fileUri}\n`);
            console.log(`[FrontMatter] originPath 업데이트: ${fileUri}`);
        } else {
            updatedFm = updatedFm.trim() + (updatedFm.trim().endsWith('\n') ? '' : '\n') + `originPath: ${fileUri}\n`;
            console.log(`[FrontMatter] originPath 추가: ${fileUri}`);
        }
        
        // originRoot 업데이트 또는 추가
        if (rootUri) {
            if (updatedFm.match(originRootRegex)) {
                updatedFm = updatedFm.replace(originRootRegex, `originRoot: ${rootUri}\n`);
                console.log(`[FrontMatter] originRoot 업데이트: ${rootUri}`);
            } else {
                updatedFm = updatedFm.trim() + (updatedFm.trim().endsWith('\n') ? '' : '\n') + `originRoot: ${rootUri}\n`;
                console.log(`[FrontMatter] originRoot 추가: ${rootUri}`);
            }
        }
        
        // vaultLink 업데이트 또는 추가
        if (obsidianUri) {
            if (updatedFm.match(vaultLinkRegex)) {
                updatedFm = updatedFm.replace(vaultLinkRegex, `vaultLink: ${obsidianUri}\n`);
                console.log(`[FrontMatter] vaultLink 업데이트: ${obsidianUri}`);
            } else {
                updatedFm = updatedFm.trim() + (updatedFm.trim().endsWith('\n') ? '' : '\n') + `vaultLink: ${obsidianUri}\n`;
                console.log(`[FrontMatter] vaultLink 추가: ${obsidianUri}`);
            }
        }
        
        // 업데이트된 frontmatter로 교체
        const updatedContent = content.replace(wholeFm, `---\n${updatedFm.trim()}\n---`);
        console.log(`[FrontMatter] 프론트매터 업데이트 완료`);
        
        return updatedContent;
    } else {
        console.log(`[FrontMatter] 기존 프론트매터 없음, 새로 추가`);
        
        // 새 frontmatter 생성
        let newFm = `---\noriginPath: ${fileUri}\n`;
        
        // originRoot 추가
        if (rootUri) {
            newFm += `originRoot: ${rootUri}\n`;
        }
        
        // vaultLink 추가
        if (obsidianUri) {
            newFm += `vaultLink: ${obsidianUri}\n`;
        }
        
        // frontmatter 종료
        newFm += `---`;
        
        // 컨텐츠 시작에 새 frontmatter 추가 (원본 컨텐츠가 줄바꿈으로 시작하는지 확인)
        if (content && content.startsWith('\n')) {
            return newFm + content;
        } else {
            return newFm + (content ? '\n' + content : '');
        }
    }
}

/**
 * 파일 경로로 originPath 값 생성
 * @param externalPath 외부 파일 절대 경로
 * @param relativePath 매핑 폴더 내 상대 경로
 */
export function createOriginPathValue(externalPath: string, relativePath: string): string {
    // 경로 구분자 정규화 (슬래시로 통일)
    return path.join(externalPath, relativePath).replace(/\\/g, '/');
}

/**
 * 프론트매터가 이미 최신 상태인지 확인하는 함수
 * @param content 파일 내용
 * @param filePath 파일 경로
 * @param vaultName Obsidian Vault 이름
 * @param vaultPath Vault 내 파일 경로
 * @param mappingRoot 매핑된 외부 폴더의 루트 경로
 * @returns 프론트매터가 이미 최신 상태인지 여부
 */
export function isFrontMatterUpToDate(
    content: string, 
    filePath: string, 
    vaultName: string = '', 
    vaultPath: string = '',
    mappingRoot: string = ''
): boolean {
    console.log(`[FrontMatter] isFrontMatterUpToDate 호출됨: path=${filePath}`);
    
    // 프론트매터가 없는 경우
    if (!hasFrontMatter(content)) {
        console.log(`[FrontMatter] 프론트매터 없음, 업데이트 필요`);
        return false;
    }
    
    // 파일 경로를 URI 형식으로 인코딩 (file:// 형식으로 변환)
    const fileUri = `file://${encodeURI(filePath).replace(/#/g, '%23').replace(/\s/g, '%20')}`;
    const rootUri = mappingRoot ? `file://${encodeURI(mappingRoot).replace(/#/g, '%23').replace(/\s/g, '%20')}` : '';
    
    // 프론트매터 추출
    const frontmatterRegex = /^---\n([\s\S]*?)\n---/;
    const match = content.match(frontmatterRegex);
    
    if (!match) {
        return false;
    }
    
    const frontmatter = match[1];
    
    // 각 필드 확인 - originPath는 정확한 값 비교, vaultLink는 필드 존재 여부만 확인
    const hasOriginPath = frontmatter.includes(`originPath: ${fileUri}`);
    const hasOriginRoot = !rootUri || frontmatter.includes(`originRoot: ${rootUri}`);
    const hasVaultLinkField = /vaultLink:\s*.+/.test(frontmatter);
    
    // 모든 필드가 있고 최신 상태이면 true 반환
    const isUpToDate = hasOriginPath && hasOriginRoot && hasVaultLinkField;
    console.log(`[FrontMatter] 프론트매터 상태: originPath=${hasOriginPath}, originRoot=${hasOriginRoot}, vaultLink=${hasVaultLinkField}, 최종=${isUpToDate}`);
    
    return isUpToDate;
} 