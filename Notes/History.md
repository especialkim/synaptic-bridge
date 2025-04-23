# 작업 기록

## 완료된 작업

### 기본 환경 설정
- [x] Obsidian 플러그인 템플릿 분석 및 이해
- [x] 개발 환경 설정 (Node.js, npm, TypeScript)
- [x] 기본 플러그인 구조 이해 및 설계
- [x] 플러그인 리포지토리 생성 및 초기화

### 핵심 모듈 설계
- [x] 기본 설정 페이지 구현
- [x] 폴더 매핑 인터페이스 설계
- [x] 파일 감시(Watcher) 기능 구현
- [x] 경로 변환 유틸리티 설계
- [x] 파일 동기화 로직 구현 (외부 → Vault)
- [x] 서브폴더 동기화 지원 구현
- [x] Vault 파일 삭제 로직 구현
- [x] frontmatter 처리 로직 구현
- [x] 초기 스캔 및 동기화 메커니즘 구현
- [x] 서브폴더 필터링 UI 개선 (콤마 방식에서 줄바꿈 방식으로 변경)
- [x] 서브폴더 필터링 "*" 기능 추가 (모든 서브폴더 무시 기능)

### 문제 해결
- [x] 기본 디버깅 로직 추가
- [x] 경로 구분자 호환성 문제 해결
- [x] 파일 업데이트 무한 루프 방지 로직 추가
- [x] frontmatter 추가로 원본 경로 추적 기능 구현
- [x] 파일 이벤트 중복 처리 방지
- [x] 빌드 오류 해결 (node 내장 모듈 처리)
- [x] 다중 매핑 폴더 간 frontmatter 충돌 방지 로직 구현
- [x] vaultLink 처리 로직 개선으로 파일 동기화 안정성 향상
- [x] 서브폴더 파일 생성 시 부모 폴더 자동 생성 개선
- [x] 파일 삭제 이벤트 처리 로직 강화
- [x] frontmatter 생성 시 빈 줄 최적화 (7줄로 제한)
- [x] TypeScript 에러 수정 (null 체크 추가)
- [x] 새 매핑 추가 시 기본 비활성화 설정 적용
- [x] ExternalSync와 InternalSync 간 연동 문제 해결

### 2025-04-19

- [x] 동기화 항목 활성화 시 경로 유효성 확인  
  - 외부 경로 실제 폴더인지 확인 (fs.existsSync)
  - Vault 경로 비어있는지 검사
  - 둘 중 하나라도 조건 안되면 자동으로 `syncEnabled = false` 처리
  - Toast 메시지로 사용자에게 안내
- [x] 경로 수정시 동기화 해제
- [x] this.display() 최소화  
  - 입력값 반영 시 DOM 직접 갱신 → 전체 리렌더 방지
  - 필요 없는 전체 새로고침 제거 → UX 자연스럽게 유지

## 진행 중인 작업
- [x] **Vault 내부 변경 감지 이벤트 처리**: Vault 내 파일이 변경되었을 때 이벤트를 감지하고 처리하는 기능
- [x] **초기 스캔 및 동기화 메커니즘**: 플러그인 활성화 시 또는 수동으로 전체 폴더 동기화를 실행하는 기능
- [ ] 설정 UI 개선
  - [x] 폴더 매핑 관리 인터페이스 향상
  - [x] 개별 폴더 매핑 활성화/비활성화 옵션
  - [x] 폴더 필터링 설정 UI
  - [ ] 폴더 필터링 기능 버그 수정 ("*" 문자로 모든 서브폴더 제외 시 여전히 하위 폴더가 동기화되는 문제)
- [ ] 성능 최적화
  - [ ] 대용량 파일 처리 개선
  - [ ] 변경 감지 이벤트 처리 최적화
  - [ ] 비동기 처리 및 작업 큐 구현
- [ ] 오류 처리 강화
  - [x] 사용자 친화적인 오류 메시지
  - [ ] 오류 복구 메커니즘
  - [x] 디버깅 정보 로깅 개선
- [x] 양방향 동기화 지원
  - [x] Vault → 외부 폴더 동기화 로직
  - [x] 충돌 감지 및 해결 메커니즘
  - [x] 동기화 방향 설정 옵션

## 2025-04-23 : Rebuilding 시작

- [ ] SyncExternalManager
  - [x] Method : handleAddFile
  - [x] Method : handleChangeFile
    - [x] handleUserChangeMd
    - [x] handleUserChangeNotMd
  - [x] Method : handleDeleteFile
  - [x] Method : handleAddFolder
  - [x] Method : handleDeleteFolder

  


## 미래 앞으로 할 작업
- [ ] Frontmatter 처리
  - [ ] 양방향 링크 등록하기
- [ ] 버그 수정
  - [ ] 서브폴더 필터링 "*" 기능 수정 (모든 서브폴더를 정상적으로 제외하도록)
  - [ ] 필터링 로직이 실제 폴더 스캔 과정에 올바르게 적용되는지 확인
  - [ ] 파일 동기화 중 발생하는 간헐적 오류 해결
- [ ] 플러그인 배포 준비
  - [ ] 릴리스 노트 작성
  - [ ] 사용자 문서 작성
  - [ ] 코드 정리 및 최적화
- [ ] 사용자 피드백 수집 및 개선
  - [ ] 베타 테스터 모집
  - [ ] 피드백 수집 및 분석
  - [ ] 개선 사항 구현
- [ ] 추가 기능 검토
  - [x] 동기화 필터 (파일 타입, 폴더 패턴)
  - [ ] 고급 충돌 해결 메커니즘
  - [ ] 배치 처리 및 스케줄링
  - [ ] 상태 모니터링 및 로그 뷰어
  - [ ] 사용자 인터페이스 고급 기능 
- [ ] 파일 이동 및 파일명 변경 감시 할 수 있다.(미래 최적화 작업 필요시 고려사항)
  - mtime 비교
  - content 비교
  - content를 비교하면 파일 이동인지 파일명 변경인지 감시 가능
    - bidirectionalReconcile 옵션 필요없이 지능화된 옵션 사용가능
- [ ] {not markdown file}.meta.yaml.md  -> This is the end of Synaptic Route
  - markdown이 아닌 모든 파일에 대해 의미 기반 메타데이터를 별도로 기록  
  - Obsidian에서 열 수 있도록 `.md` 확장자 사용  
  - YAML frontmatter와 함께 `![]()`로 원본 파일 연결 
  - Obsidian에서 미리보기가 되지 않는 파일은 컨텐츠를 넣어버림
    - ms-word
    - pdf
      - python : `PyMuPDF` + `pdfplumber`
        - 
    - pptx
    - epub
    - html
    - json
    - csv
    - txt
    - ico
    - font
    - image
    - mp3
      - 가사
      - voice to text
    - mp4
    - url
      - webpage
      - youtube
    - 한글로 번역된 문서로 가공?
      - 무료로 사용가능한 것도 존재함
    - ※ OCR은 파이썬 생태계가 품질 속도 몇에서 압도적으로 Chatgpt가 말함 이거 하나 만들어 놓으면 쉽게 잘 쓸 듯
    - 전용도구 Python을 만들어보자. 이거 Tool 로 사용할 수 있어. 나중에는 나만의 MCP로 확장가능
  - 사이드바나 팝업으로 metadata 입력하게 하고 입력값있으면 자동으로 .meta.yaml.md 파일 생성
  - Devonthink, EagleFiler, KeepIt 같은 전통적인 정보 관리 툴들이 놓치고 있는 ‘의미 기반 연결’을 Obsidian 안에서 구현
- [ ] 옵시디언은 마크다운 편집기로써 최고이기 때문
