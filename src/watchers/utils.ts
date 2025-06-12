import { FSWatcher } from "chokidar";
import { Stats } from "fs";
import { App, FileSystemAdapter } from "obsidian";
import * as path from "path";
import { FolderConnectionSettings } from "src/settings";

// Simple glob pattern matching function
function matchGlobPattern(filename: string, pattern: string): boolean {
  // Convert glob pattern to regex
  const regexPattern = pattern
    .replace(/\./g, '\\.')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.')
    .replace(/\[([^\]]+)\]/g, '[$1]');
  
  const regex = new RegExp(`^${regexPattern}$`, 'i');
  return regex.test(filename);
}

export function ignoreFilter(
  app: App,
  connection: FolderConnectionSettings,
  watchExternal: boolean = true
): (fullPath: string, stats: Stats) => boolean {
  const { externalPath, internalPath, excludeFolders, includeFolders, extensions, ignoreHiddenFiles, includeFileNames, excludeFileNames } = connection;
  
  const internalAbsolutePath = (app.vault.adapter as FileSystemAdapter).getBasePath() + '/' + internalPath;
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

    if (stats.isFile()) {
      // Extension filtering
      if (loweredExtensions.length > 0) {
        if (!loweredExtensions.some(ext => lowerFullPath.endsWith(`.${ext}`))) {
          return true;
        }
      }

      // File name pattern filtering
      const filename = path.basename(fullPath);
      const includePatterns = includeFileNames || [];
      const excludePatterns = excludeFileNames || [];
      
      // If both arrays are empty, no filename filtering
      if (includePatterns.length === 0 && excludePatterns.length === 0) {
        return false;
      }
      
      // Check include patterns first
      if (includePatterns.length > 0) {
        const matchesInclude = includePatterns.some(pattern => {
          // Check for glob patterns (* ? [])
          if (pattern.includes('*') || pattern.includes('?') || pattern.includes('[')) {
            return matchGlobPattern(filename, pattern);
          } else {
            // Exact match (case insensitive)
            return filename.toLowerCase() === pattern.toLowerCase();
          }
        });
        
        // If file doesn't match any include pattern, ignore it
        if (!matchesInclude) {
          return true;
        }
      }
      
      // Check exclude patterns (intersection logic)
      if (excludePatterns.length > 0) {
        const matchesExclude = excludePatterns.some(pattern => {
          // Check for glob patterns (* ? [])
          if (pattern.includes('*') || pattern.includes('?') || pattern.includes('[')) {
            return matchGlobPattern(filename, pattern);
          } else {
            // Exact match (case insensitive)
            return filename.toLowerCase() === pattern.toLowerCase();
          }
        });
        
        // If file matches any exclude pattern, ignore it
        if (matchesExclude) {
          return true;
        }
      }
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