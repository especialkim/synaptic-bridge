// 수동으로 프론트매터를 추가하는 스크립트
const fs = require('fs');
const path = require('path');

// 파일 경로와 내용 설정
const testFilePath = '/Users/yongminkim/Workspace/Temp/test/test-frontmatter.md';
const fileContent = `이것은 테스트입니다.
마크다운 파일에 프론트매터를 추가하기 위한 예시입니다.`;

// 프론트매터 추가 함수
function addFrontMatter(content, originPath) {
    console.log(`프론트매터 추가 시작: ${originPath}`);
    // 내용이 없으면 기본 내용 추가
    if (!content || content.trim() === '') {
        return `---\noriginPath: ${originPath}\n---\n\n`;
    }

    // 이미 프론트매터가 있는지 확인
    const trimmed = content.trim();
    if (trimmed.startsWith('---')) {
        console.log('기존 프론트매터 감지됨');
        
        // 프론트매터 영역 추출 시도
        const fmMatch = trimmed.match(/^---\s*\n([\s\S]*?)\n---/);
        if (fmMatch) {
            const frontMatter = fmMatch[1];
            console.log(`기존 프론트매터 내용: ${frontMatter}`);
            
            // originPath가 이미 있는지 확인
            const hasOriginPath = frontMatter.includes('originPath:');
            if (hasOriginPath) {
                console.log('기존 originPath 발견, 업데이트');
                // originPath 값 업데이트
                return trimmed.replace(
                    /originPath:\s*[^\n]+/,
                    `originPath: ${originPath}`
                );
            } else {
                console.log('originPath 없음, 추가');
                // originPath 키-값 추가
                return trimmed.replace(
                    /^---/,
                    `---\noriginPath: ${originPath}`
                );
            }
        }
    }
    
    console.log('프론트매터 없음, 새로 추가');
    // 프론트매터가 없는 경우 새로 추가
    return `---\noriginPath: ${originPath}\n---\n\n${trimmed}`;
}

// 파일 생성 및 프론트매터 추가
try {
    console.log(`파일 경로: ${testFilePath}`);
    
    // 파일 디렉토리 확인 및 생성
    const dir = path.dirname(testFilePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`디렉토리 생성됨: ${dir}`);
    }
    
    // 파일 내용 작성
    fs.writeFileSync(testFilePath, fileContent, 'utf8');
    console.log('기본 파일 내용 작성됨');
    
    // 파일 내용 읽기
    const content = fs.readFileSync(testFilePath, 'utf8');
    console.log(`파일 읽기 완료: ${content.substring(0, 50)}...`);
    
    // 프론트매터 추가
    const updatedContent = addFrontMatter(content, testFilePath);
    console.log(`업데이트된 내용: ${updatedContent.substring(0, 50)}...`);
    
    // 업데이트된 내용 쓰기
    fs.writeFileSync(testFilePath, updatedContent, 'utf8');
    console.log('프론트매터 추가 완료');
    
    // 최종 내용 확인
    const finalContent = fs.readFileSync(testFilePath, 'utf8');
    console.log(`최종 파일 내용:\n${finalContent}`);
    
    console.log('작업 완료');
} catch (err) {
    console.error(`오류 발생: ${err.message}`);
    console.error(err.stack);
} 