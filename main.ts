import { Plugin } from 'obsidian';

export default class MarkdownHijacker extends Plugin {
	async onload() {
		console.log('MarkdownHijacker plugin loaded');
	}

	onunload() {
		console.log('MarkdownHijacker plugin unloaded');
	}
}
