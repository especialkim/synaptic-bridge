import { FSWatcher } from "chokidar";
import { Stats } from "fs";
import * as path from "path";
import { FolderConnectionSettings } from "reSrc/settings";

export function ignoreFilter(connection: FolderConnectionSettings): (fullPath: string, stats: Stats) => boolean {
    const { externalPath, excludeFolders, includeFolders, extensions, ignoreHiddenFiles } = connection;

    const loweredExtensions = extensions.map(e => e.toLowerCase());
    const loweredExcludes = excludeFolders.map(f => f.toLowerCase());
    const loweredIncludes = includeFolders.map(f => f.toLowerCase());

    return (fullPath: string, stats: Stats) => {
        if (!stats) return false;
    
        const relativePath = path.relative(externalPath, fullPath);
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