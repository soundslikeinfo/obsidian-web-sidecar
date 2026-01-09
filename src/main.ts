/*
 * Web Sidecar
 * Copyright (c) 2025 soundslikeinfo
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { Plugin, WorkspaceLeaf, Menu } from 'obsidian';
import { WebSidecarSettings, DEFAULT_SETTINGS } from './types';
import { WebSidecarSettingTab } from './settings/settingsTab';
import { WebSidecarView, VIEW_TYPE_WEB_SIDECAR } from './views/webSidecarView';
import { WebViewerManager } from './experimental/WebViewerManager';
import { registerCommands } from './commands';
import { UrlIndex } from './services/UrlIndex';
import { TabStateService } from './services/TabStateService';
import { NoteCreationService } from './services/NoteCreationService';

/**
 * Web Sidecar Plugin
 * Watches active web viewer URLs and displays related notes in a sidebar
 */
export default class WebSidecarPlugin extends Plugin {
	settings!: WebSidecarSettings;
	private webViewerManager: WebViewerManager | null = null;
	private noteCreationService!: NoteCreationService;
	public urlIndex!: UrlIndex;
	public tabStateService!: TabStateService;

	async onload(): Promise<void> {
		await this.loadSettings();

		// 1. Initialize Services
		this.urlIndex = new UrlIndex(this.app, () => this.settings);
		this.tabStateService = new TabStateService(this, () => this.settings, () => this.updateView());
		this.noteCreationService = new NoteCreationService(this.app, () => this.settings);

		this.app.workspace.onLayoutReady(() => {
			this.urlIndex.initialize();
			this.tabStateService.initialize();
		});

		this.webViewerManager = new WebViewerManager(this.app, () => this.settings, this.urlIndex);
		this.webViewerManager.initialize();

		this.urlIndex.on('index-updated', () => {
			this.tabStateService.refreshState();
		});

		// 2. Register View
		this.registerView(
			VIEW_TYPE_WEB_SIDECAR,
			(leaf) => new WebSidecarView(
				leaf,
				() => this.settings,
				() => this.tabStateService.refreshState(),
				() => this.tabStateService.getTrackedTabs(),
				() => this.tabStateService.getVirtualTabs(),
				this.urlIndex,
				this.tabStateService,
				async () => { await this.saveData(this.settings); }
			)
		);

		// 3. Register Commands & Settings
		registerCommands(this);
		this.addSettingTab(new WebSidecarSettingTab(this.app, this));

		// 4. Register Events
		this.registerNoteCreationEvent();
		this.registerFileMenuEvent();
	}

	onunload(): void {
		this.tabStateService?.destroy();
		this.webViewerManager?.destroy();
		this.urlIndex?.destroy();
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, (await this.loadData()) as unknown);

		// Migration: Ensure new sections are in sectionOrder
		const allSections = ['recent', 'domain', 'subreddit', 'youtube', 'twitter', 'github', 'tag', 'selected-tag'];
		for (const sec of allSections) {
			if (!this.settings.sectionOrder.includes(sec)) {
				this.settings.sectionOrder.push(sec);
			}
		}
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		this.tabStateService?.refreshState();
		this.webViewerManager?.onSettingsChanged();
		this.urlIndex?.rebuildIndex();
	}

	async activateView(): Promise<void> {
		const { workspace } = this.app;
		const leaves = workspace.getLeavesOfType(VIEW_TYPE_WEB_SIDECAR);
		let leaf: WorkspaceLeaf | null = leaves[0] ?? null;

		if (!leaf) {
			leaf = workspace.getRightLeaf(false);
			if (leaf) {
				await leaf.setViewState({ type: VIEW_TYPE_WEB_SIDECAR, active: true });
			}
		}

		if (leaf) {
			void workspace.revealLeaf(leaf);
			this.tabStateService.refreshState();
		}
	}

	private updateView(): void {
		for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_WEB_SIDECAR)) {
			if (leaf.view instanceof WebSidecarView) {
				leaf.view.updateTabs(
					this.tabStateService.getTrackedTabs(),
					this.tabStateService.getVirtualTabs()
				);
			}
		}
		this.webViewerManager?.updateAllButtons();
	}

	private registerNoteCreationEvent(): void {
		const handleCreateNote = async (e: Event) => {
			const customEvent = e as CustomEvent<{ url: string; leafId?: string }>;
			if (!customEvent.detail?.url) return;

			const newFile = await this.noteCreationService.createLinkedNoteFromUrl(
				customEvent.detail.url,
				customEvent.detail.leafId
			);

			if (newFile) {
				this.urlIndex?.updateFileIndex(newFile);
				this.tabStateService.refreshState();
				this.forceRenderAllViews();
				setTimeout(() => {
					this.tabStateService?.refreshState();
					this.forceRenderAllViews();
				}, 300);
			}
		};

		const listener = (e: Event) => void handleCreateNote(e);
		window.addEventListener('web-sidecar:create-note', listener);
		this.register(() => window.removeEventListener('web-sidecar:create-note', listener));
	}

	private registerFileMenuEvent(): void {
		this.registerEvent(
			this.app.workspace.on('file-menu', (menu: Menu, _file, _source, leaf?: WorkspaceLeaf) => {
				if (leaf && this.webViewerManager) {
					this.webViewerManager.addMenuItems(menu, leaf);
				}
			})
		);
	}

	private forceRenderAllViews(): void {
		for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_WEB_SIDECAR)) {
			if (leaf.view instanceof WebSidecarView) {
				leaf.view.render(true);
			}
		}
	}
}
