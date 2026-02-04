import * as fs from 'fs';
import { Vault, FileSystemAdapter } from 'obsidian';
import * as pathModule from 'path';

/**
 * 경로를 정규화합니다.
 * - 백슬래시(\)를 슬래시(/)로 변환
 * - 끝에 있는 슬래시 제거
 * @param path 정규화할 경로
 * @returns 정규화된 경로
 */
export function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '');
}

/**
 * 비교용으로 경로를 정규화합니다. (Windows 대소문자 무시)
 * - 백슬래시(\)를 슬래시(/)로 변환
 * - 끝에 있는 슬래시 제거
 * - Windows에서는 소문자로 변환
 * @param path 정규화할 경로
 * @returns 비교용 정규화된 경로
 */
export function normalizePathForCompare(path: string): string {
  const normalized = normalizePath(path);
  // Windows 환경에서만 소문자 변환 (process.platform === 'win32')
  if (process.platform === 'win32') {
    return normalized.toLowerCase();
  }
  return normalized;
}

/**
 * 두 경로가 같은지 비교합니다. (Windows 대소문자 무시)
 * @param path1 첫 번째 경로
 * @param path2 두 번째 경로
 * @returns 경로가 같으면 true
 */
export function pathsEqual(path1: string, path2: string): boolean {
  return normalizePathForCompare(path1) === normalizePathForCompare(path2);
}

/**
 * path가 basePath로 시작하는지 확인합니다. (Windows 대소문자 무시)
 * @param path 확인할 경로
 * @param basePath 기준 경로
 * @returns path가 basePath로 시작하면 true
 */
export function pathStartsWith(path: string, basePath: string): boolean {
  const normalizedPath = normalizePathForCompare(path);
  const normalizedBase = normalizePathForCompare(basePath);
  return normalizedPath.startsWith(normalizedBase);
}

/**
 * 상대 경로를 계산합니다. (Windows 호환)
 * @param fullPath 전체 경로
 * @param basePath 기준 경로
 * @returns 상대 경로 (슬래시로 시작)
 */
export function getRelativePathFromBase(fullPath: string, basePath: string): string {
  const normalizedFull = normalizePath(fullPath);
  const normalizedBase = normalizePath(basePath);

  // 대소문자 무시 비교용
  const fullForCompare = normalizePathForCompare(fullPath);
  const baseForCompare = normalizePathForCompare(basePath);

  if (fullForCompare.startsWith(baseForCompare)) {
    // 원본 경로에서 basePath 길이만큼 잘라서 상대 경로 추출
    return normalizedFull.slice(normalizedBase.length);
  }

  return normalizedFull;
}

/* 주어진 경로가 존재하고 폴더인지 확인 */
export function isExistDirectory(path: string): boolean {
  try {
    return fs.existsSync(path) && fs.statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/**
 * 플러그인 데이터 경로를 반환합니다.
 * @param vault Obsidian Vault 인스턴스
 * @returns 플러그인 데이터 폴더의 전체 경로
 */
export function getPluginDataPath(vault: Vault): string {
  const basePath = (vault.adapter as FileSystemAdapter).getBasePath();
  return pathModule.join(basePath, vault.configDir, 'plugins', 'markdown-hijacker', 'data');
}