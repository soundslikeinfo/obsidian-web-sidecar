import { Plugin, WorkspaceLeaf } from 'obsidian';
import { WebSidecarSettings, DEFAULT_SETTINGS, TrackedWebViewer } from './types';
import { WebSidecarSettingTab } from './settings';
import { WebSidecarView, VIEW_TYPE_WEB_SIDECAR } from './webSidecarView';

/**
 * Supported web viewer types
 */
const WEB_VIEW_TYPES = ['webviewer', 'surfing-view'];

/**
 * Polling interval for URL changes (ms)
 */
const POLL_INTERVAL = 500;

/**
 * Web Sidecar Plugin
 * Watches active web viewer URLs and displays related notes in a sidebar
 */
export default class WebSidecarPlugin extends Plugin {
	settings: WebSidecarSettings;
	private view: WebSidecarView | null = null;
	private trackedTabs: Map<string, TrackedWebViewer> = new Map();
	private pollIntervalId: number | null = null;

	async onload(): Promise<void> {
		await this.loadSettings();

		// Register the sidebar view
		this.registerView(
			VIEW_TYPE_WEB_SIDECAR,
			(leaf) => {
				this.view = new WebSidecarView(
					leaf,
					() => this.settings,
					() => this.refreshView(),
					() => this.getTrackedTabs()
				);
				return this.view;
			}
		);

		// Add ribbon icon to open sidebar
		this.addRibbonIcon('globe', 'Open Web Sidecar', () => {
			this.activateView();
		});

		// Add command to toggle sidebar
		this.addCommand({
			id: 'open-web-sidecar',
			name: 'Open Web Sidecar sidebar',
			callback: () => {
				this.activateView();
			},
		});

		// Add command to refresh sidebar
		this.addCommand({
			id: 'refresh-web-sidecar',
			name: 'Refresh Web Sidecar',
			callback: () => {
				this.refreshView();
			},
		});

		// Add settings tab
		this.addSettingTab(new WebSidecarSettingTab(this.app, this));

		// Listen for active leaf changes
		this.registerEvent(
			this.app.workspace.on('active-leaf-change', (leaf) => {
				this.onActiveLeafChange(leaf);
			})
		);

		// Start polling for URL changes and tab cleanup
		this.startPolling();

		// Initial scan of all web viewers
		this.scanAllWebViewers();
	}

	onunload(): void {
		this.stopPolling();
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		this.refreshView();
	}

	/**
	 * Start polling for URL changes
	 */
	private startPolling(): void {
		this.pollIntervalId = this.registerInterval(
			window.setInterval(() => this.pollForChanges(), POLL_INTERVAL)
		);
	}

	/**
	 * Stop polling
	 */
	private stopPolling(): void {
		if (this.pollIntervalId !== null) {
			window.clearInterval(this.pollIntervalId);
			this.pollIntervalId = null;
		}
	}

	/**
	 * Poll for URL changes and cleanup closed tabs
	 */
	private pollForChanges(): void {
		const previousHash = this.getTabsHash();
		this.scanAllWebViewers();
		this.cleanupClosedTabs();
		const newHash = this.getTabsHash();

		// Only update view if something actually changed
		if (previousHash !== newHash) {
			this.view?.updateTabs(this.getTrackedTabs());
		}
	}

	/**
	 * Generate a hash of current tab state for change detection
	 */
	private getTabsHash(): string {
		const tabs = Array.from(this.trackedTabs.values());
		return tabs.map(t => `${t.leafId}:${t.url}`).join('|');
	}

	/**
	 * Scan all web viewers and update tracked tabs
	 */
	private scanAllWebViewers(): void {
		const leaves = this.app.workspace.getLeavesOfType('webviewer')
			.concat(this.app.workspace.getLeavesOfType('surfing-view'));

		for (const leaf of leaves) {
			const leafId = (leaf as any).id || leaf.view.getViewType() + '-' + leaves.indexOf(leaf);
			const info = this.getWebViewerInfo(leaf);

			if (info) {
				const existing = this.trackedTabs.get(leafId);

				// Update or create entry
				if (existing) {
					// Only update URL and title if changed
					if (existing.url !== info.url || existing.title !== info.title) {
						this.trackedTabs.set(leafId, {
							...existing,
							url: info.url,
							title: info.title || existing.title,
						});
					}
				} else {
					// New tab
					this.trackedTabs.set(leafId, {
						leafId,
						url: info.url,
						title: info.title || this.extractTitleFromUrl(info.url),
						lastFocused: Date.now(),
					});
				}
			}
		}
	}

	/**
	 * Remove tabs that are no longer open
	 */
	private cleanupClosedTabs(): void {
		const leaves = this.app.workspace.getLeavesOfType('webviewer')
			.concat(this.app.workspace.getLeavesOfType('surfing-view'));

		const activeLeafIds = new Set(
			leaves.map((leaf, index) => (leaf as any).id || leaf.view.getViewType() + '-' + index)
		);

		for (const leafId of this.trackedTabs.keys()) {
			if (!activeLeafIds.has(leafId)) {
				this.trackedTabs.delete(leafId);
			}
		}
	}

	/**
	 * Get tracked tabs sorted according to settings
	 */
	getTrackedTabs(): TrackedWebViewer[] {
		const tabs = Array.from(this.trackedTabs.values());

		switch (this.settings.tabSortOrder) {
			case 'title':
				return tabs.sort((a, b) => a.title.localeCompare(b.title));
			case 'focus':
			default:
				return tabs.sort((a, b) => b.lastFocused - a.lastFocused);
		}
	}

	/**
	 * Refresh the view manually
	 */
	refreshView(): void {
		this.scanAllWebViewers();
		this.cleanupClosedTabs();
		this.view?.updateTabs(this.getTrackedTabs());
	}

	/**
	 * Handle active leaf changes to update focus time
	 */
	private onActiveLeafChange(leaf: WorkspaceLeaf | null): void {
		if (!leaf) return;

		const viewType = leaf.view.getViewType();

		if (WEB_VIEW_TYPES.includes(viewType)) {
			const leafId = (leaf as any).id || viewType + '-0';
			const info = this.getWebViewerInfo(leaf);

			if (info) {
				// Update focus time
				this.trackedTabs.set(leafId, {
					leafId,
					url: info.url,
					title: info.title || this.extractTitleFromUrl(info.url),
					lastFocused: Date.now(),
				});

				this.view?.updateTabs(this.getTrackedTabs());
			}
		}
	}

	/**
	 * Get info from a specific web viewer leaf
	 */
	private getWebViewerInfo(leaf: WorkspaceLeaf): { url: string; title?: string } | null {
		const state = leaf.view.getState();
		const url = state?.url;

		if (url && typeof url === 'string') {
			const title = typeof state?.title === 'string' ? state.title : undefined;
			return { url, title };
		}

		return null;
	}

	/**
	 * Extract a title from URL as fallback
	 */
	private extractTitleFromUrl(url: string): string {
		try {
			let urlWithProtocol = url;
			if (!url.match(/^https?:\/\//)) {
				urlWithProtocol = 'https://' + url;
			}
			const parsed = new URL(urlWithProtocol);
			return parsed.hostname.replace(/^www\./, '');
		} catch {
			return url;
		}
	}

	/**
	 * Activate and reveal the sidebar view
	 */
	async activateView(): Promise<void> {
		const { workspace } = this.app;

		let leaf: WorkspaceLeaf | null = null;
		const leaves = workspace.getLeavesOfType(VIEW_TYPE_WEB_SIDECAR);

		if (leaves.length > 0) {
			leaf = leaves[0] ?? null;
		} else {
			// Create in right sidebar
			leaf = workspace.getRightLeaf(false);
			if (leaf) {
				await leaf.setViewState({
					type: VIEW_TYPE_WEB_SIDECAR,
					active: true,
				});
			}
		}

		if (leaf) {
			workspace.revealLeaf(leaf);
			this.refreshView();
		}
	}
}
