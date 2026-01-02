import { Plugin, WorkspaceLeaf } from 'obsidian';
import { WebSidecarSettings, DEFAULT_SETTINGS, WebViewerInfo } from './types';
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
	private lastUrl: string | null = null;
	private pollIntervalId: number | null = null;

	async onload(): Promise<void> {
		await this.loadSettings();

		// Register the sidebar view
		this.registerView(
			VIEW_TYPE_WEB_SIDECAR,
			(leaf) => {
				this.view = new WebSidecarView(leaf, () => this.settings, () => this.refreshView());
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

		// Add command to create note for current URL
		this.addCommand({
			id: 'create-note-for-url',
			name: 'Create note for current URL',
			checkCallback: (checking: boolean) => {
				const info = this.getCurrentWebViewerInfo();
				if (info) {
					if (!checking) {
						this.view?.updateWithInfo(info);
					}
					return true;
				}
				return false;
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

		// Start polling for URL changes within web viewers
		this.startPolling();
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
			window.setInterval(() => this.pollForUrlChanges(), POLL_INTERVAL)
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
	 * Poll for URL changes in web viewers
	 */
	private pollForUrlChanges(): void {
		const info = this.getCurrentWebViewerInfo();
		const currentUrl = info?.url ?? null;

		if (currentUrl !== this.lastUrl) {
			this.lastUrl = currentUrl;
			if (info) {
				this.view?.updateWithInfo(info);
			} else {
				this.view?.updateWithInfo(null);
			}
		}
	}

	/**
	 * Refresh the view manually
	 */
	refreshView(): void {
		const info = this.getCurrentWebViewerInfo();
		this.lastUrl = info?.url ?? null;
		this.view?.updateWithInfo(info);
	}

	/**
	 * Handle active leaf changes to detect web viewer URL changes
	 */
	private onActiveLeafChange(leaf: WorkspaceLeaf | null): void {
		if (!leaf) {
			return;
		}

		const viewType = leaf.view.getViewType();

		if (WEB_VIEW_TYPES.includes(viewType)) {
			// Immediate update when switching to a web viewer
			const info = this.getWebViewerInfo(leaf);
			if (info) {
				this.lastUrl = info.url;
				this.view?.updateWithInfo(info);
			}
		}
	}

	/**
	 * Get info from a specific web viewer leaf
	 */
	private getWebViewerInfo(leaf: WorkspaceLeaf): WebViewerInfo | null {
		const state = leaf.view.getState();
		const url = state?.url;

		if (url && typeof url === 'string') {
			return {
				url,
				title: typeof state?.title === 'string' ? state.title : this.extractTitleFromUrl(url),
			};
		}

		return null;
	}

	/**
	 * Get the current web viewer info from any open web viewer
	 */
	private getCurrentWebViewerInfo(): WebViewerInfo | null {
		// First check the active leaf
		const activeLeaf = this.app.workspace.activeLeaf;
		if (activeLeaf && WEB_VIEW_TYPES.includes(activeLeaf.view.getViewType())) {
			return this.getWebViewerInfo(activeLeaf);
		}

		// Then check all web viewer leaves
		const leaves = this.app.workspace.getLeavesOfType('webviewer')
			.concat(this.app.workspace.getLeavesOfType('surfing-view'));

		for (const leaf of leaves) {
			const info = this.getWebViewerInfo(leaf);
			if (info) {
				return info;
			}
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
