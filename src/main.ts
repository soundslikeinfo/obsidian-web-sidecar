import { Plugin, WorkspaceLeaf, Menu, TFile, MarkdownView } from 'obsidian';
import { WebSidecarSettings, DEFAULT_SETTINGS, TrackedWebViewer, VirtualTab } from './types';
import { WebSidecarSettingTab } from './settings/settingsTab';
import { WebSidecarView, VIEW_TYPE_WEB_SIDECAR } from './views/webSidecarView';
import { WebViewerActions } from './experimental/webViewerActions';
import { CreateNoteModal } from './modals/createNoteModal';

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
	private webViewerActions: WebViewerActions | null = null;
	/** Cache of URL -> title for virtual tabs */
	private urlTitleCache: Map<string, string> = new Map();

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
					() => this.getTrackedTabs(),
					() => this.getVirtualTabs()
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

		// Initialize web viewer actions (experimental feature)
		this.webViewerActions = new WebViewerActions(this.app, () => this.settings);
		this.webViewerActions.initialize();

		// Listen for custom event from webViewerActions to open create note modal
		const handleCreateNote = (e: Event) => {
			const customEvent = e as CustomEvent<{ url: string }>;
			if (customEvent.detail?.url) {
				new CreateNoteModal(
					this.app,
					customEvent.detail.url,
					this.settings,
					async (path) => {
						const file = this.app.vault.getAbstractFileByPath(path);
						if (file instanceof TFile) {
							await this.app.workspace.openLinkText(path, '', true);
						}
						this.scanAllWebViewers();
					}
				).open();
			}
		};
		window.addEventListener('web-sidecar:create-note', handleCreateNote);
		this.register(() => window.removeEventListener('web-sidecar:create-note', handleCreateNote));

		// Register file-menu event for "More Options" menu in web viewers
		this.registerEvent(
			this.app.workspace.on('file-menu', (menu: Menu, _file, _source, leaf?: WorkspaceLeaf) => {
				if (leaf && this.webViewerActions) {
					this.webViewerActions.addMenuItems(menu, leaf);
				}
			})
		);
	}

	onunload(): void {
		this.stopPolling();
		this.webViewerActions?.destroy();
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		this.refreshView();
		this.webViewerActions?.onSettingsChanged();
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
			this.view?.updateTabs(this.getTrackedTabs(), this.getVirtualTabs());
		}

		// Update experimental header buttons (dynamic)
		this.webViewerActions?.updateAllButtons();
	}

	/**
	 * Generate a hash of current tab state for change detection
	 */
	private getTabsHash(): string {
		const tabs = Array.from(this.trackedTabs.values());
		return tabs.map(t => `${t.leafId}:${t.url}:${t.title}`).join('|');
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
				// Detect if leaf is in a popout window
				const leafWindow = (leaf.getRoot() as any).containerEl?.win;
				const isPopout = leafWindow !== undefined && leafWindow !== window;

				// Cache title if available (for virtual tabs)
				if (info.title && info.url) {
					this.urlTitleCache.set(info.url, info.title);
				}

				const existing = this.trackedTabs.get(leafId);

				// Update or create entry
				if (existing) {
					// Only update URL and title if changed
					if (existing.url !== info.url || existing.title !== info.title || existing.isPopout !== isPopout) {
						this.trackedTabs.set(leafId, {
							...existing,
							url: info.url,
							title: info.title || existing.title,
							isPopout,
						});
					}
				} else {
					// New tab
					this.trackedTabs.set(leafId, {
						leafId,
						url: info.url,
						title: info.title || this.extractTitleFromUrl(info.url),
						lastFocused: Date.now(),
						isPopout,
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
	 * Get virtual tabs from open notes with URL properties
	 * Excludes notes whose URLs are already open in web viewers
	 */
	getVirtualTabs(): VirtualTab[] {
		const virtualTabs: VirtualTab[] = [];
		const openUrls = new Set(Array.from(this.trackedTabs.values()).map(t => t.url));

		// Get all open markdown leaves
		const markdownLeaves = this.app.workspace.getLeavesOfType('markdown');

		for (const leaf of markdownLeaves) {
			const view = leaf.view;
			if (!(view instanceof MarkdownView)) continue;

			const file = view.file;
			if (!file) continue;

			// Get frontmatter
			const cache = this.app.metadataCache.getFileCache(file);
			const frontmatter = cache?.frontmatter;
			if (!frontmatter) continue;

			// Check each URL property field
			for (const propName of this.settings.urlPropertyFields) {
				const propValue = frontmatter[propName];
				if (typeof propValue === 'string' && propValue.startsWith('http')) {
					// Skip if URL is already open in a web viewer
					if (openUrls.has(propValue)) continue;

					virtualTabs.push({
						file,
						url: propValue,
						propertyName: propName,
						cachedTitle: this.urlTitleCache.get(propValue),
					});
					break; // Only add one virtual tab per note
				}
			}
		}

		return virtualTabs;
	}

	/**
	 * Refresh the view manually
	 */
	refreshView(): void {
		this.scanAllWebViewers();
		this.cleanupClosedTabs();
		this.view?.updateTabs(this.getTrackedTabs(), this.getVirtualTabs());
	}

	/**
	 * Handle active leaf changes to update focus time and refresh view
	 */
	private onActiveLeafChange(leaf: WorkspaceLeaf | null): void {
		if (!leaf) return;

		const viewType = leaf.view.getViewType();

		if (WEB_VIEW_TYPES.includes(viewType)) {
			const leafId = (leaf as any).id || viewType + '-0';
			const info = this.getWebViewerInfo(leaf);

			if (info) {
				// Detect if leaf is in a popout window
				const leafWindow = (leaf.getRoot() as any).containerEl?.win;
				const isPopout = leafWindow !== undefined && leafWindow !== window;

				// Update focus time
				this.trackedTabs.set(leafId, {
					leafId,
					url: info.url,
					title: info.title || this.extractTitleFromUrl(info.url),
					lastFocused: Date.now(),
					isPopout,
				});
			}
		}

		// Always refresh the view to update virtual tabs (from open markdown notes)
		this.view?.updateTabs(this.getTrackedTabs(), this.getVirtualTabs());
	}

	/**
	 * Get info from a specific web viewer leaf
	 */
	private getWebViewerInfo(leaf: WorkspaceLeaf): { url: string; title?: string } | null {
		const state = leaf.view.getState();
		const url = state?.url;

		if (url && typeof url === 'string') {
			const rawTitle = typeof state?.title === 'string' ? state.title : undefined;
			// Filter out invalid/loading titles
			const title = this.isValidTitle(rawTitle) ? rawTitle : undefined;
			return { url, title };
		}

		return null;
	}

	/**
	 * Check if a title is valid (not a loading/placeholder state)
	 */
	private isValidTitle(title: string | undefined): boolean {
		if (!title || title.trim() === '') return false;
		// Filter out data: URIs (actual URIs have format like data:text/plain, data:image/png)
		if (/^data:[a-z]+\//.test(title)) return false;
		// Filter out about: pages (about:blank, about:newtab, etc. - actual URLs)
		if (/^about:(blank|newtab|srcdoc)/.test(title)) return false;
		if (title === 'New Tab' || title === 'Loading...') return false;
		return true;
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
