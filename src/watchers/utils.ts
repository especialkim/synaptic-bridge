import { FSWatcher } from "chokidar";
import { Stats } from "fs";
import { App } from "obsidian";
import * as path from "path";
import { FolderConnectionSettings } from "src/settings";

export function ignoreFilter(
  app: App,
  connection: FolderConnectionSettings,
  watchExternal: boolean = true
): (fullPath: string, stats: Stats) => boolean {
  const { externalPath, internalPath, excludeFolders, includeFolders, extensions, ignoreHiddenFiles } = connection;
  
  const internalAbsolutePath = (app.vault.adapter as any).getBasePath() + '/' + internalPath;
  const loweredExtensions = extensions.map(e => e.toLowerCase());
  const loweredExcludes = excludeFolders.map(f => f.toLowerCase());
  const loweredIncludes = includeFolders.map(f => f.toLowerCase());

  return (fullPath: string, stats: Stats) => {
    if (!stats) return false;

    const basePath = watchExternal ? externalPath : internalAbsolutePath;
    const relativePath = path.relative(basePath, fullPath);
    const parts = relativePath.split(path.sep).map(p => p.toLowerCase());
    const lowerFullPath = fullPath.toLowerCase();

    if (ignoreHiddenFiles && parts.some(p => p.startsWith('.'))) {
      return true;
    }

    if (loweredExcludes.length > 0 && parts.some(p => loweredExcludes.includes(p))) {
      return true;
    }

    if (loweredIncludes.length > 0) {
      const allowed = parts.slice(0, 2);
      if (!allowed.some(p => loweredIncludes.includes(p))) {
        return true;
      }
    }

    if (stats.isFile() && loweredExtensions.length > 0) {
      return !loweredExtensions.some(ext => lowerFullPath.endsWith(`.${ext}`));
    }

    return false;
  };
}

export function getAllWatchedPaths(watcher: FSWatcher): string[] {
    const watched = watcher.getWatched();
    const paths: string[] = [];
  
    for (const dir in watched) {
      const files = watched[dir];
      for (const name of files) {
        paths.push(`${dir}/${name}`);
      }
    }
  
    return paths;
}