# Windows sync path bug report

작성일: 2026-02-04

## 요약
Windows 11에서 외부 폴더 → Obsidian 내부 폴더로 동기화가 전혀 동작하지 않는 증상이 확인됨. 원인은 경로 정규화(슬래시/대소문자) 없이 `startsWith`/`replace`/`includes`로 상대 경로를 계산하는 로직에 있으며, Windows의 `\` 구분자 및 대소문자 차이 때문에 상대 경로 계산이 실패해 내부 경로가 깨지는 것이 핵심.

---

## 문제 상황 (재현 정보)
- 환경: Windows 11 25H2, Obsidian 1.11.5, Synaptic Bridge 0.1.7
- Vault 경로: `D:\obs`
- 내부 동기화 폴더: `D:\obs\TEST` (connection.internalPath = `TEST`)
- 외부 동기화 폴더: `D:\TESTINGEXTERNAL`
- 확장자: `md`, `txt`
- 외부 폴더 내 파일: `.md`, `.txt`, `.jpg`, `.pdf`
- 증상: Global sync 및 Connection sync 활성화 후에도 외부 파일이 내부로 전혀 복사되지 않음

---

## 기대 동작
외부 폴더의 `.md`, `.txt` 파일이 내부 폴더 `TEST/` 아래로 복사·생성되고, 스냅샷이 업데이트되어야 함.

## 실제 동작
- 동기화 이벤트가 발생하더라도 내부 경로 계산이 실패하여 복사가 진행되지 않거나 잘못된 경로로 시도됨
- 결과적으로 내부 폴더에 파일이 생성되지 않음

---

## 분석 결과 (코드 기준)

### 1) 외부→내부 복사 시 상대 경로 계산 실패 (핵심)
**파일:** `src/sync/SyncService.ts:20-33`
- `syncFileToInternal()`에서 상대 경로를 아래처럼 계산함:
  - `const relativePath = path.replace(connection.externalPath, '')`
- Windows에서는 다음 문제가 발생 가능:
  - `connection.externalPath`는 보통 `D:\TESTINGEXTERNAL` 형태
  - 실제 이벤트 경로는 `D:/TESTINGEXTERNAL/...` 또는 대소문자 차이(`d:\testingexternal`)가 섞일 수 있음
  - 결과적으로 `replace()`가 실패 → `relativePath`가 절대경로 전체로 남음
  - 이후 `getInternalPath()`가 잘못된 값을 만들고, 내부 복사 경로가 깨짐

### 2) 상대 경로 계산이 슬래시/대소문자 정규화 없이 동작
**파일:**
- `src/sync/SyncService.ts:122-133`
- `src/sync/SnapShotService.ts:37-48`

현재 `getRelativePath()`는:
- `startsWith(connection.externalPath)`
- `startsWith(connection.internalPath + '/')`

위 로직은 Windows의 `\` 구분자와 대소문자 차이를 고려하지 않음.
즉, 다음 경우 상대 경로 계산이 깨짐:
- `D:\TESTINGEXTERNAL` vs `D:/TESTINGEXTERNAL/...`
- `D:\TESTINGEXTERNAL` vs `d:\testingexternal\...`

### 3) 내부/외부 경로 판별에서 `includes` 사용으로 오탐
**파일:** `src/sync/SyncService.ts:320-324`

`isFrontmatterValid()`에서:
- `if (path.includes(connection.internalPath))` 사용

이 경우 내부 폴더명이 `TEST`일 때:
- 외부 경로 `D:\TESTINGEXTERNAL\file.md`도 `TEST`를 포함하므로 **내부 경로로 오인**
- 내부 경로 처리 분기로 들어가 잘못된 절대경로 계산 가능

### 4) 경로 구분자 불일치가 Obsidian Vault API와 충돌
Obsidian의 내부 경로는 항상 `/` 기준인데, Windows 경로가 `\`를 포함한 상태로 전달될 수 있음.
- 예: `TEST\file.md`
- `this.app.vault.getFileByPath()`/`createFolder()`는 `/` 경로를 기대
- 이로 인해 내부 파일 인식 및 생성 실패 가능

---

## 관련 파일 경로
- `src/sync/SyncService.ts`
  - `syncFileToInternal()` 상대 경로 계산 (line 20-33)
  - `getRelativePath()` 문자열 기반 처리 (line 122-133)
  - `isFrontmatterValid()` 내부/외부 판별 `includes` (line 320-324)
- `src/sync/SnapShotService.ts`
  - `getRelativePath()` 동일 로직 (line 37-48)

---

## 권장 수정 방향
1. 경로 정규화 유틸 추가
   - `\` → `/` 변환
   - 비교용 경로는 Windows에서 소문자화
   - `path.relative()` 기반으로 상대 경로 계산

2. `syncFileToInternal()`에서 **반드시** `getRelativePath()` 사용
   - 현재처럼 `replace()` 직접 사용 금지

3. `isFrontmatterValid()`의 `includes` 체크 제거
   - `startsWith` + 정규화된 경로 기반 prefix 체크로 교체

---

## 결론
Windows 환경에서는 경로 구분자/대소문자 차이로 인해 상대 경로 계산이 실패하고, 그 결과 내부 파일 경로가 깨져 동기화가 진행되지 않는다. 현재 코드는 macOS(`/`) 기준으로만 동작하며, Windows 경로 정규화를 반드시 도입해야 한다.
