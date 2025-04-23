import MarkdownHijacker from "main";
import { App } from "obsidian";

export class StartUpSyncManager {
    private app: App;
    private plugin: MarkdownHijacker;

    constructor(app: App, plugin: MarkdownHijacker){
        this.app = app;
        this.plugin = plugin;
    }

    /* From Snapshot */
    public initialize(){
        console.log("[StartUpSyncManager] 초기화 시작");
    }
}