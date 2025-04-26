import * as fs from 'fs';
import { Vault, FileSystemAdapter } from 'obsidian';
import * as pathModule from 'path';

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