import * as fs from 'fs';

/* 주어진 경로가 존재하고 폴더인지 확인 */
export function isExistDirectory(path: string): boolean {
  try {
    return fs.existsSync(path) && fs.statSync(path).isDirectory();
  } catch {
    return false;
  }
}