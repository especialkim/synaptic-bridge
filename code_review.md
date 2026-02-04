# Code Review Report: Synaptic Bridge (Markdown Hijacker)

**프로젝트**: Synaptic Bridge (markdown-hijacker)
**버전**: 0.1.7
**분석일**: 2026-02-04
**분석 범위**: 전체 코드베이스 (3,783줄 TypeScript, 35개 소스 파일)

---

## 목차
1. [크리티컬 이슈](#1%EF%B8%8F%E2%83%A3-크리티컬-이슈)
2. [잠재적 버그](#2%EF%B8%8F%E2%83%A3-잠재적-버그)
3. [성능 문제](#3%EF%B8%8F%E2%83%A3-성능-문제)
4. [구조 및 설계 검토](#4%EF%B8%8F%E2%83%A3-구조-및-설계-검토)
5. [리팩토링 제안](#5%EF%B8%8F%E2%83%A3-리팩토링-제안)
6. [설계 관점 평가](#6%EF%B8%8F%E2%83%A3-설계-관점-평가)
7. [요약](#7%EF%B8%8F%E2%83%A3-요약)

---

## 1️⃣ 크리티컬 이슈

### CRITICAL-001: Command Injection 보안 취약점

- **위치**: `src/explorer/ExplorerSyncDecorator.ts:147-172` (`openExternalFolder` 메서드)
- **분류**: 크리티컬 / 보안
- **심각도**: 🔴 높음
- **현재 상태**:
  외부 폴더 경로를 셸 명령어로 실행할 때 단순 따옴표만 사용하고 있음. 경로에 특수문자(예: `"; rm -rf /; echo "`)가 포함되면 임의의 명령어가 실행될 수 있음.
  ```typescript
  case 'darwin':
      command = `open "${externalPath}"`;  // 따옴표만 있고 escape 없음
  case 'win32':
      command = `explorer "${externalPath}"`;  // 동일한 취약점
  ```
- **영향**: 악의적인 폴더 이름을 통해 시스템에서 임의의 명령어 실행 가능. 데이터 삭제, 시스템 손상 위험.
- **개선 방향**: `child_process.exec()` 대신 `child_process.spawn()` 사용하거나, `open` 같은 npm 패키지를 사용하여 안전하게 경로 처리

---

### CRITICAL-002: 리소스 누수 - FSWatcher 미종료

- **위치**: `src/watchers/ExternalWatcher.ts:168-183` (`stopWatching` 메서드)
- **분류**: 크리티컬 / 런타임 에러 가능성
- **심각도**: 🔴 높음
- **현재 상태**:
  `stopWatching()` 메서드에서 watchers 배열을 비우지만 각 watcher의 `.close()` 메서드를 호출하지 않음.
  ```typescript
  public stopWatching(immediate: boolean = false) {
      // ... 중략 ...
      this.watchers = [];  // close()가 호출되지 않음!
  }
  ```
- **영향**:
  - File descriptor 고갈로 인한 시스템 불안정
  - 메모리 누수 (장시간 사용 시)
  - 동기화 재시작 시 이전 watcher가 여전히 동작할 수 있음
- **개선 방향**: 배열을 비우기 전에 각 watcher에 대해 `watcher.close()` 호출 필요

---

### CRITICAL-003: 비원자적 파일 쓰기로 인한 데이터 손실 가능성

- **위치**: `src/sync/SyncService.ts:102-120` (`updateExternalFileFrontmatter` 메서드)
- **분류**: 크리티컬 / 데이터 무결성
- **심각도**: 🔴 높음
- **현재 상태**:
  파일을 직접 덮어쓰기하여 프로세스 중단 시 파일 손상 가능.
  ```typescript
  fsSync.writeFileSync(path, updatedContent);  // 원자적 쓰기가 아님
  ```
- **영향**:
  - 동기화 중 프로세스 종료 시 파일 손상
  - 부분적으로 쓰여진 파일로 인한 데이터 손실
- **개선 방향**: 임시 파일에 먼저 쓰고 `fs.rename()`으로 원자적 교체 (write-to-temp-then-rename 패턴)

---

## 2️⃣ 잠재적 버그

### BUG-001: Race Condition in Watcher Initialization

- **위치**: `src/watchers/ExternalWatcher.ts:21-54`
- **분류**: 잠재적 버그 / 상태 관리
- **심각도**: 🟡 중간
- **현재 상태**:
  `isSettingUp` 플래그가 `false`로 설정된 후 watcher 생성이 동기적으로 진행됨. 빠른 연속 호출 시 플래그 보호가 무력화될 수 있음.
- **영향**: 동일 연결에 대해 중복 watcher 생성, 리소스 낭비
- **개선 방향**: 모든 watcher 생성이 완료된 후에 `isSettingUp = false` 설정

---

### BUG-002: Silent Failures in Snapshot Operations

- **위치**: `src/sync/SnapShotService.ts:50-63` (`saveSnapshot` 메서드)
- **분류**: 잠재적 버그 / 에러 처리
- **심각도**: 🔴 높음
- **현재 상태**:
  스냅샷 저장 실패 시 에러를 로그만 하고 조용히 반환함.
  ```typescript
  } catch (err) {
      console.error(`[SnapShotService] Snapshot 저장 실패`, err);
      // 에러 throw 없이 반환!
  }
  ```
- **영향**: 스냅샷 저장 실패 시 동기화 상태 불일치, 사용자 인지 불가
- **개선 방향**: 에러를 throw하거나 사용자에게 알림 표시

---

### BUG-003: Path Conversion Bug - String Replace 사용

- **위치**: `src/sync/SyncService.ts:20-22`
- **분류**: 잠재적 버그 / 경로 처리
- **심각도**: 🟡 중간
- **현재 상태**:
  단순 `.replace()` 사용으로 정규식 특수문자나 중복 경로명 처리 불가.
  ```typescript
  const relativePath = path.replace(connection.externalPath, '');
  ```
- **영향**:
  - 폴더명에 정규식 특수문자 포함 시 실패 (예: `[test]`, `(backup)`)
  - 경로에 외부 경로 문자열이 여러 번 나타나면 잘못된 변환
- **개선 방향**: `path.relative()` 또는 정확한 prefix 검사 후 slice 사용

---

### BUG-004: Stale State - 무한 증가하는 상태 객체

- **위치**: `src/sync/SyncExternalManager.ts:16, 41-50`
- **분류**: 잠재적 버그 / 메모리 누수
- **심각도**: 🟡 중간
- **현재 상태**:
  `state` 객체에 파일 상태가 추가되지만 절대 제거되지 않음.
  ```typescript
  private state: SyncExternalManagerState = {};
  // ...
  this.state[path] = { createdAt, modifiedAt, ... };  // 삭제 로직 없음
  ```
- **영향**: 장시간 사용 시 메모리 사용량 지속 증가
- **개선 방향**: 파일 처리 완료 후 또는 주기적으로 state 정리

---

### BUG-005: Missing Await on Delete Operations

- **위치**: `src/sync/SyncExternalDeleteEvent.ts:40-44`
- **분류**: 잠재적 버그 / 비동기 처리
- **심각도**: 🟡 중간
- **현재 상태**:
  비동기 삭제 작업에 await 누락.
  ```typescript
  this.plugin.syncService.deleteFileActionDeleteOnExternal(path, this.connection);
  // await 없음!
  ```
- **영향**: 삭제 완료 전 함수 반환, 후속 작업과 충돌 가능
- **개선 방향**: await 키워드 추가

---

### BUG-006: Uncaught Promise Rejection in Event Handlers

- **위치**: `src/watchers/InternalWatcher.ts:59-79`
- **분류**: 잠재적 버그 / 에러 처리
- **심각도**: 🟡 중간
- **현재 상태**:
  비동기 이벤트 핸들러에 try-catch 블록 없음.
- **영향**: 이벤트 처리 중 에러 발생 시 unhandled promise rejection으로 플러그인 불안정
- **개선 방향**: 모든 async 이벤트 핸들러에 try-catch 추가

---

### BUG-007: Empty Error Handler for Chokidar

- **위치**: `src/watchers/ExternalWatcher.ts:110-112`
- **분류**: 잠재적 버그 / 에러 처리
- **심각도**: 🟡 중간
- **현재 상태**:
  chokidar의 error 이벤트 핸들러가 비어있음.
  ```typescript
  watcher.on('error', (error: Error) => {
      // 아무 것도 하지 않음!
  });
  ```
- **영향**: 파일 시스템 에러 발생 시 무시되어 디버깅 어려움
- **개선 방향**: 에러 로깅 및 사용자 알림 추가

---

### BUG-008: Settings-Watcher Synchronization Gap

- **위치**: `src/watchers/InternalWatcher.ts:40-47`
- **분류**: 잠재적 버그 / 상태 관리
- **심각도**: 🟡 중간
- **현재 상태**:
  connections가 settings에서 shallow copy됨. 설정 변경 시 watcher가 stale 데이터 참조.
- **영향**: 설정 변경 후 잘못된 연결 정보로 동기화 수행 가능
- **개선 방향**: 설정 변경 시 watcher 재시작 또는 deep copy 사용

---

## 3️⃣ 성능 문제

### PERF-001: 이중 statSync 호출

- **위치**: `src/sync/SyncExternalManager.ts:84-94` (`checkChangeFileType` 메서드)
- **분류**: 성능
- **심각도**: 🟡 중간
- **현재 상태**:
  `isSameFile()` 내부에서 두 파일에 대해 각각 `statSync()` 호출. 변경 이벤트마다 실행됨.
- **영향**: 활발한 동기화 시 높은 CPU 사용량, I/O 병목
- **개선 방향**: stat 결과 캐싱 또는 mtime 비교 로직 최적화

---

### PERF-002: DOM MutationObserver 블로킹

- **위치**: `src/explorer/ExplorerSyncDecorator.ts:62-142`
- **분류**: 성능
- **심각도**: 🟡 중간
- **현재 상태**:
  `decorateAllSyncFolders()`가 레이아웃 변경마다 동기적으로 실행.
- **영향**: 대규모 폴더 트리에서 UI 프리징 가능
- **개선 방향**: debounce 적용 또는 requestAnimationFrame 사용

---

### PERF-003: 반복적 경로 변환

- **위치**: `src/sync/SnapShotService.ts:143-190`
- **분류**: 성능
- **심각도**: 🟢 낮음
- **현재 상태**:
  재귀 탐색 중 `getRelativePath()` 등 경로 변환 메서드 반복 호출.
- **영향**: 대규모 동기화 시 미미한 성능 저하
- **개선 방향**: 경로 변환 결과 캐싱

---

### PERF-004: Verbose Logging (107+ console.log)

- **위치**: 전체 코드베이스
- **분류**: 성능
- **심각도**: 🟢 낮음
- **현재 상태**:
  개발용 로그가 프로덕션 코드에 107개 이상 존재.
- **영향**: 콘솔 출력 오버헤드, 로그 스팸
- **개선 방향**: debugMode 설정에 따른 조건부 로깅 또는 로깅 서비스 도입

---

## 4️⃣ 구조 및 설계 검토

### 🧱 과도한 구현 (God Object / God Method)

#### STRUCT-001: SyncService God Object

- **위치**: `src/sync/SyncService.ts` (414줄, 25+ public 메서드)
- **분류**: 구조
- **심각도**: 🟡 중간
- **현재 상태**:
  단일 클래스가 파일 복사, 경로 변환, frontmatter 처리, 삭제 로직 등 너무 많은 책임을 가짐.
- **영향**: 테스트 어려움, 변경 시 파급 효과 큼, 재사용성 저하
- **개선 방향**:
  - `FileOperationService`: 파일 복사/삭제
  - `PathService`: 경로 변환
  - `MetadataService`: frontmatter 처리
  로 분리

---

#### STRUCT-002: MarkdownHijackerSettingUI.display() God Method

- **위치**: `src/settings/MarkdownHijackerSettingUI.ts` (514줄 메서드)
- **분류**: 구조
- **심각도**: 🟡 중간
- **현재 상태**:
  단일 메서드가 전체 설정 UI 렌더링, 모든 연결 관리, 이벤트 핸들러 등록을 담당.
- **영향**: 디버깅 어려움, UI 변경 시 전체 메서드 수정 필요
- **개선 방향**:
  - ConnectionListComponent
  - ConnectionEditorComponent
  - ValidationService
  등으로 분리

---

### ✂️ 코드 중복

#### STRUCT-003: Internal/External 이벤트 핸들러 중복

- **위치**:
  - `src/sync/SyncInternalAddEvent.ts` vs `src/sync/SyncExternalAddEvent.ts`
  - `src/sync/SyncInternalChangeEvent.ts` vs `src/sync/SyncExternalChangeEvent.ts`
  - `src/sync/SyncInternalDeleteEvent.ts` vs `src/sync/SyncExternalDeleteEvent.ts`
- **분류**: 구조
- **심각도**: 🟡 중간
- **현재 상태**:
  각 쌍이 거의 동일한 패턴을 구현하지만 공유 인터페이스나 베이스 클래스 없음.
- **영향**: 버그 수정 시 양쪽 모두 수정 필요, 유지보수 부담
- **개선 방향**: `BaseSyncEvent` 추상 클래스 도입 또는 전략 패턴 적용

---

#### STRUCT-004: Watcher Setup 로직 중복

- **위치**:
  - `src/watchers/ExternalWatcher.ts:setupWatcher()`
  - `src/watchers/InternalWatcher.ts:setupWatcher()`
- **분류**: 구조
- **심각도**: 🟢 낮음
- **현재 상태**:
  `isSettingUp` 플래그, 이벤트 등록, 에러 핸들링 패턴이 중복됨.
- **영향**: 코드 일관성 유지 어려움
- **개선 방향**: `BaseWatcher` 추상 클래스 또는 `WatcherFactory` 도입

---

### 🔁 인터페이스 추상화 부재

#### STRUCT-005: Missing Interfaces

- **위치**: 전체 sync 모듈
- **분류**: 설계
- **심각도**: 🟡 중간
- **현재 상태**:
  - `IWatcher` 인터페이스 없음
  - `ISyncEventHandler` 인터페이스 없음
  - `ISnapshotService` 인터페이스 없음
- **영향**:
  - 의존성 주입 어려움
  - 단위 테스트 시 모킹 어려움
  - 향후 구현체 교체 어려움
- **개선 방향**: 주요 서비스에 대한 인터페이스 정의

---

## 5️⃣ 리팩토링 제안

### 가독성 개선

| 현재 | 개선 제안 | 위치 |
|------|----------|------|
| `whatcherEvent.ts` | `watcherEvent.ts` (오타 수정) | sync/types/ |
| `snapShotService` | `snapshotService` (일관된 camelCase) | 전체 |
| `getCurrentStateSnapShotOfInternalRoot()` | `getInternalRootSnapshot()` | SnapShotService |
| `deleteFileActionPropertyOnExternal()` | `softDeleteExternal()` 또는 `markAsDeletedExternal()` | SyncService |

### 네이밍 개선

| 현재 | 문제점 | 개선 제안 |
|------|--------|----------|
| `AddFileType.USER_ADD_MD_BLANK` | 너무 세분화 | `AddFileType.BLANK_MARKDOWN` |
| `handleUserAddMdContent` | 불명확 | `handleMarkdownWithContent` |
| `deleteFileActionPropertyCore` | "property"의 의미 불명확 | `softDeleteCore` 또는 `markAsDeletedCore` |

### 불필요한 추상화

- `src/sync/utils/` 내 일부 유틸리티가 단일 용도로만 사용됨
- 일부 enum 값이 현재 사용되지 않음 (확장성을 위한 것인지 확인 필요)

### 테스트 용이성 개선

1. 서비스 클래스들에 의존성 주입 패턴 도입
2. 파일 시스템 작업을 추상화하여 테스트 시 모킹 가능하게
3. 현재 `null as any` 사용 부분 제거 (테스트 시 타입 오류 발생 가능)

---

## 6️⃣ 설계 관점 평가

### 확장성

| 항목 | 평가 | 비고 |
|------|------|------|
| 새로운 동기화 방향 추가 | 🟡 중간 | SyncType enum 확장은 쉬우나 핸들러 중복 필요 |
| 새로운 파일 타입 지원 | 🟡 중간 | extensions 설정은 있으나 타입별 처리 로직 확장 어려움 |
| 클라우드 동기화 추가 | 🔴 어려움 | 파일 시스템에 강하게 결합됨 |
| 새로운 충돌 해결 전략 | 🟡 중간 | BidirectionalType enum 확장 가능하나 로직 수정 필요 |

### 변경 취약 구조

1. **SyncService 의존성**: 거의 모든 sync 관련 클래스가 SyncService에 직접 의존
   - SyncService 변경 시 광범위한 영향

2. **설정 구조 변경**: `FolderConnectionSettings` 구조 변경 시 영향받는 파일이 15개 이상

3. **Obsidian API 결합**: `TFile`, `TFolder`, `Vault` 등에 직접 의존
   - Obsidian API 변경 시 전체 수정 필요

### 도메인/인프라 분리 상태

| 레이어 | 파일 | 분리 상태 |
|--------|------|----------|
| UI | MarkdownHijackerSettingUI.ts | 🟡 도메인 로직 일부 포함 |
| Domain | SyncService, SnapShotService | 🔴 인프라(fs) 직접 사용 |
| Infrastructure | ExternalWatcher (chokidar) | 🟢 적절히 분리됨 |

**개선 필요**: 도메인 로직에서 파일 시스템 작업을 추상화된 인터페이스로 분리

---

## 7️⃣ 요약

### 전체 코드 건강도: **C+**

안정적으로 동작하는 기능적 플러그인이나, 보안 취약점과 리소스 관리 문제를 포함한 크리티컬 이슈가 존재함.

### 심각도별 이슈 수 집계

| 심각도 | 개수 | 비율 |
|--------|------|------|
| 🔴 높음 (Critical/High) | 6 | 25% |
| 🟡 중간 (Medium) | 14 | 58% |
| 🟢 낮음 (Low) | 4 | 17% |
| **총계** | **24** | 100% |

### 우선 개선 권장 항목 Top 5

1. **🔴 CRITICAL-001**: Command Injection 보안 취약점 수정
   - 가장 심각한 보안 이슈, 즉시 수정 권장

2. **🔴 CRITICAL-002**: FSWatcher close() 호출 추가
   - 리소스 누수로 인한 시스템 불안정 방지

3. **🔴 CRITICAL-003**: 원자적 파일 쓰기 패턴 적용
   - 데이터 손실 방지

4. **🔴 BUG-002**: 스냅샷 저장 실패 시 에러 처리
   - 동기화 상태 일관성 보장

5. **🟡 STRUCT-001**: SyncService 분리
   - 장기적 유지보수성 개선의 기반

### 전반적인 아키텍처 소감

**장점:**
- 비동기 파일 작업에 async/await 적절히 사용
- 스냅샷 기반 상태 비교 방식은 양방향 동기화에 스마트한 접근
- 모듈별 폴더 구조로 기능 도메인 명확히 구분
- 이벤트 정리/해제 패턴 대부분 적절히 구현

**개선 필요:**
- God Object/Method 패턴으로 인한 유지보수 어려움
- 에러 처리가 대부분 silent failure로 되어있어 디버깅 어려움
- 인터페이스 추상화 부재로 테스트/확장성 저하
- 보안 및 리소스 관리에 대한 추가 주의 필요

---

*이 보고서는 코드 분석 결과만을 담고 있으며, 실제 코드 수정은 포함하지 않습니다.*
