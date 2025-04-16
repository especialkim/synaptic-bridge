import * as path from 'path';

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
 * 파일 내용에 originPath 프론트매터 추가
 * @param content 파일 내용
 * @param filePath 파일 경로
 */
export function addOriginPathFrontMatter(content: string, filePath: string): string {
    console.log(`[FrontMatter] addOriginPathFrontMatter 호출됨: path=${filePath}`);
    
    if (!content) {
        console.log('[FrontMatter] 내용이 비어있어 기본 프론트매터만 추가');
        return `---\noriginPath: ${filePath}\n---\n\n`;
    }
    
    // 내용 앞쪽의 공백 제거 (정확한 매칭을 위해)
    const trimmedContent = content.trim();
    
    // 이미 프론트매터가 있는 경우
    if (trimmedContent.startsWith('---')) {
        console.log('[FrontMatter] 기존 프론트매터 발견, 분석 중...');
        
        // 전체 프론트매터 블록 찾기
        const fmMatch = trimmedContent.match(/^---([\s\S]*?)---/);
        if (fmMatch) {
            const fullFrontMatter = fmMatch[0];
            console.log(`[FrontMatter] 전체 프론트매터: ${fullFrontMatter}`);
            
            // originPath가 이미 있는지 확인
            const originPath = getOriginPath(trimmedContent);
            
            if (originPath !== null) {
                console.log(`[FrontMatter] 기존 originPath 값 발견: ${originPath}, 업데이트 중...`);
                // originPath 값 업데이트
                const updated = trimmedContent.replace(
                    /originPath:\s*[^\n]+/,
                    `originPath: ${filePath}`
                );
                console.log(`[FrontMatter] 업데이트된 내용 시작 부분: ${updated.substring(0, Math.min(100, updated.length))}`);
                return updated;
            } else {
                console.log('[FrontMatter] originPath 값 없음, 새로 추가 중...');
                // originPath 키-값 추가
                const updated = trimmedContent.replace(
                    /^---/,
                    `---\noriginPath: ${filePath}`
                );
                console.log(`[FrontMatter] 업데이트된 내용 시작 부분: ${updated.substring(0, Math.min(100, updated.length))}`);
                return updated;
            }
        } else {
            console.log('[FrontMatter] 프론트매터 형식이 잘못됨, 새로 추가');
        }
    }
    
    console.log('[FrontMatter] 프론트매터 없음, 새로 추가 중...');
    // 프론트매터가 없는 경우 새로 추가
    const updated = `---\noriginPath: ${filePath}\n---\n\n${trimmedContent}`;
    console.log(`[FrontMatter] 새 프론트매터 추가 결과: ${updated.substring(0, Math.min(100, updated.length))}`);
    return updated;
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