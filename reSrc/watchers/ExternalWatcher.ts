import MarkdownHijacker from "main";
import { App } from "obsidian";
import chokidar, { FSWatcher } from 'chokidar';
import { getAllWatchedPaths, ignoreFilter } from "./utils";
import { fsReadFrontmatter } from "reSrc/sync/utils";
import { WatcherEvent } from "reSrc/sync/types/whatcherEvent";
export class ExternalWatcher{

    private app: App;
    private plugin: MarkdownHijacker;
    private debugMode: boolean;
    private enableGlobalSync: boolean;
    private watchers: FSWatcher[] = [];

    constructor(app: App, plugin: MarkdownHijacker){
        this.app = app;
        this.plugin = plugin;
        this.debugMode = plugin.settings.debugMode;
        this.enableGlobalSync = plugin.settings.enableGlobalSync;
    }

    public setupWatcher(){

        this.stopWatching();
        if(!this.plugin.settings.enableGlobalSync) return;
        
        const connections = this.plugin.settings.connections;

        connections.forEach(connection => {
            const { externalPath, syncEnabled } = connection;
            const syncManager = new SyncManager(this.app, this.plugin, connection);
            const syncExternalManager = new SyncExternalManager(this.app, this.plugin, connection);
    
            if(!syncEnabled) return;

            let watcher: FSWatcher;

            watcher = chokidar.watch(externalPath, {
                ignored: ignoreFilter(connection),
                ignoreInitial: true,
                persistent: true,
                awaitWriteFinish: {
                  stabilityThreshold: 300,
                  pollInterval: 100
                }
            });

            watcher.on('add', (path: string) => {
                syncExternalManager.handleAddFile(path);
            });
            watcher.on('change', (path: string) => {
                syncExternalManager.handleChangeFile(path);
            });
            watcher.on('unlink', (path: string) => {
                syncExternalManager.handleDeleteFile(path);
            });
            watcher.on('addDir', (path: string) => {
                syncExternalManager.handleAddFolder(path);
            });
            watcher.on('unlinkDir', (path: string) => {
                syncExternalManager.handleDeleteFolder(path);
            });
            watcher.on('error', (error: Error) => {
                console.log(`[ExternalWatcher] 외부 파일 시스템 오류 발생: ${error.message}`);
            });

            watcher.on('ready', () => {
                const paths = getAllWatchedPaths(watcher);
                syncManager.handleExternalWatcherReady(paths);
                // test(paths);
            });

            this.watchers.push(watcher);
        })
    }

    public stopWatching() {
        this.watchers.forEach(w => w.close());
        this.watchers = [];
    }
}

import * as fs from 'fs';
import { GrayMatterFile } from 'gray-matter';
import { SyncManager } from "reSrc/sync/SyncManager";
import { SyncExternalManager } from "reSrc/sync/SyncExternalManager";

async function test(paths: string[]): Promise<{ path: string, frontmatter: GrayMatterFile<string> }[]> {
    const result: { path: string, frontmatter: GrayMatterFile<string> }[] = [];

    for (const path of paths) {
        try {
            const stat = fs.statSync(path);
            if (!stat.isFile()) continue;

            const frontmatter = await fsReadFrontmatter(path);
            result.push({ path, frontmatter });
        } catch (err) {
            console.warn(`⚠️ 파일 처리 중 오류 발생: ${path}`, err);
        }
    }

    console.log(JSON.stringify(result, null, 2));
    return result;
}