# Markdown Hijacker for Obsidian
Markdown Hijacker는 외부 폴더의 마크다운 파일을 Obsidian 볼트와 실시간으로 동기화하는 플러그인입니다. 권한을 요청하지 않고 직접 가져오세요.

## 주요 기능

- 외부 폴더의 마크다운 파일을 Obsidian 볼트와 실시간 동기화
- 양방향 동기화 지원: Obsidian에서 편집한 내용이 원본 파일에도 반영
- 다양한 동기화 옵션 및 필터링 기능
- 커스터마이징 가능한 설정

## 설치 방법

1. Obsidian 설정에서 커뮤니티 플러그인 탭으로 이동
2. 커뮤니티 플러그인 열기를 클릭하고 "Markdown Hijacker"를 검색
3. 설치 및 활성화

## 수동 설치

1. 이 리포지토리에서 `main.js`, `styles.css`, `manifest.json` 파일을 다운로드합니다.
2. Obsidian 볼트 폴더 내의 `.obsidian/plugins/markdown-hijacker/` 디렉토리에 파일을 복사합니다.
3. Obsidian에서 플러그인을 활성화합니다.

## 개발 방법

- 이 리포지토리를 클론합니다.
- Node.js v16 이상이 설치되어 있는지 확인합니다 (`node --version`).
- `npm i` 또는 `yarn`으로 의존성을 설치합니다.
- `npm run dev`로 개발 모드에서 컴파일을 시작합니다.

## 라이센스

MIT
