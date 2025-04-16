markdown-hijacker/
│
├── src/                           # 소스 코드 폴더
│   ├── main.ts                    # 플러그인 메인 파일
│   ├── settings.ts                # 설정 관련 코드
│   │
│   ├── core/                      # 핵심 로직
│   │   ├── index.ts               # 핵심 모듈 내보내기
│   │   ├── types.ts               # 타입 정의
│   │   ├── constants.ts           # 상수 정의
│   │   └── events.ts              # 이벤트 정의 및 이벤트 버스
│   │
│   ├── watchers/                  # 파일 시스템 감시 관련 모듈
│   │   ├── index.ts               # 워처 모듈 내보내기
│   │   ├── external-watcher.ts    # 외부 폴더 감시 로직
│   │   ├── vault-watcher.ts       # Vault 감시 로직
│   │   └── utils.ts               # 워처 관련 유틸리티 함수
│   │
│   ├── sync/                      # 동기화 관련 모듈
│   │   ├── index.ts               # 동기화 모듈 내보내기
│   │   ├── external-to-vault.ts   # 외부→Vault 동기화 로직
│   │   ├── vault-to-external.ts   # Vault→외부 동기화 로직
│   │   ├── delete-handler.ts      # 삭제 처리 로직
│   │   └── utils.ts               # 동기화 관련 유틸리티 함수
│   │
│   ├── filters/                   # 필터링 관련 모듈
│   │   ├── index.ts               # 필터 모듈 내보내기
│   │   ├── path-filter.ts         # 경로 필터링 로직
│   │   ├── exclude-filter.ts      # 제외 규칙 처리
│   │   ├── include-filter.ts      # 포함 규칙 처리
│   │   └── utils.ts               # 필터링 관련 유틸리티 함수
│   │
│   └── ui/                        # 사용자 인터페이스 관련
│       ├── index.ts               # UI 모듈 내보내기
│       ├── status-bar.ts          # 상태 바 관련 코드
│       ├── notifications.ts       # 알림 관련 코드
│       └── modals/                # 모달 대화상자 관련 코드
│           ├── folder-select.ts   # 폴더 선택 모달
│           └── path-input.ts      # 경로 입력 모달
│
├── styles.css                     # 스타일시트
├── manifest.json                  # 플러그인 매니페스트
├── package.json                   # npm 패키지 정보
└── tsconfig.json                  # TypeScript 설정