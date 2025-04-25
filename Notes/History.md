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

- [x] SyncExternalManager
  - [x] Method : handleAddFile
  - [x] Method : handleChangeFile
    - [x] handleUserChangeMd
    - [x] handleUserChangeNotMd
  - [x] Method : handleDeleteFile
  - [x] Method : handleAddFolder
  - [x] Method : handleDeleteFolder
- [x] SyncInternalManager
  - [x] SyncInternalAddEvent
    - [x] handleUserAddFile
    - [x] handleUserAddMdBlank
    - [x] handleUserAddMdContent
    - [x] handleAddFolder
    - [x] handleSysetm~
  - [x] SyncInternalDeleteEvent
    - [x] handleUserDeleteMd
    - [x] handleUserDeleteNotMd
    - [x] handleUserDeleteFolder
    - [x] handleSystemDeleteMd
    - [x] handleSystemDeleteNotMd
    - [x] handleSystemDeleteFolder
  - [x] SyncInternalChangeEvent
- [ ] 콘솔에 있는 에러처리하기
  
## 2025-04-25 할일

- SettingUI
  - [x] 경로 드롭다운 바로가기 추가하기
  - [drop] 수동 Sync 버튼
    - 숨기기로 했음
    - 1회성 동기화 하기
  - [x] Remove 누르면
    - [x] Enable Sync -> False로 바꾸기
    - [x] data 파일도 삭제하기
  - [x] Maintenance 모드 숨김처리
  - [x] bidirectionalType 옵션 숨기기
  - [x] Set Internal 옵션 숨기기
  - [x] Sync 제목 눌렀을 때 범위 선택되게 하기
  - [x] Exclude Paths, Required Paths, File Extentions Text Area로 교체?
    - [x] PlaceHolder 만들기
- [x] 탐색기에 동기화 폴더 표시하기
- [toTBD] 삭제 이벤트 할 때 같은 이름 있으면 어떻하지? 덮어써?
- [drop] 탐색기에 동기화 폴더는 마우스 우클릭하면 이동하기 추가하기 -> 이건 필요 없음, 어차피 파인터로 열기 있음 or 다른 플러그인으로
- [ ] 문서 작성
- [ ] 배포 신청 하기
  
## TBD

- [Considering..] 
  - 동기화 상태 표시 방식
    - 파일명 변경 방식 (예: ❌ prefix)
      - 장점
        - 어디서든(탐색기, 파일 시스템, 외부 앱) 상태가 한눈에 보임
        - 삭제/비활성 파일이 정렬상 한 곳에 모여 관리가 쉬움
        - 외부 동기화/백업/협업 시에도 상태가 명확
      - 단점
        - 파일명 변경에 따른 링크/참조/외부 앱 호환성 문제
        - 파일명 충돌(이미 ❌ prefix 파일이 있을 때) 가능성
        - 복구/재동기화 시 원래 이름 복원 필요
        - 파일 시스템/외부 툴과의 예상치 못한 충돌 가능
    - UI 뱃지/아이콘 방식 (탐색기에서만 표시)
      - 장점
        - 파일명/경로는 그대로, 링크/참조/외부 앱과의 호환성 유지
        - 다양한 상태(동기화, 삭제, 에러 등)를 색상/아이콘/툴팁 등으로 세련되게 표현 가능
        - 유지보수/확장성 우수, 외부 시스템 영향 없음
      - 단점
        - Obsidian 내부에서만 표시, 외부에서는 상태 확인 불가
        - 정렬 효과 없음(삭제/비활성 파일이 한 곳에 모이지 않음)
        - 플러그인 비활성화/오류 시 상태 표시 사라질 수 있음
  - 파일명 충돌 문제
    - 파일명 변경 방식: ❌ prefix 등으로 이름 바꿀 때 이미 같은 이름이 있으면 충돌
    - UI 뱃지 방식: 파일명은 그대로지만, 외부 동기화/머지 시 충돌 가능성
    - 항상 예외 처리/충돌 해결 로직 필요
  - 상황별 선택 기준
    - 내부 관리/개인 사용/Obsidian 중심: UI 뱃지/아이콘 방식 추천
    - 외부 시스템/협업/백업/동기화 중요: 파일명 변경 방식 또는 property+UI 조합
    - 가장 안전한 기본값: 파일명은 그대로, 상태는 property(frontmatter 등)와 UI 뱃지로 관리


## Future

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
  - Devonthink, EagleFiler, KeepIt 같은 전통적인 정보 관리 툴들이 놓치고 있는 '의미 기반 연결'을 Obsidian 안에서 구현
- [ ] Why? 옵시디언은 마크다운 편집기로써 최고이기 때문
