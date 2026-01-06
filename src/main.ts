
import { Plugin, WorkspaceLeaf, Menu } from 'obsidian';
import { WebSidecarSettings, DEFAULT_SETTINGS } from './types';
import { WebSidecarSettingTab } from './settings/settingsTab';
import { WebSidecarView, VIEW_TYPE_WEB_SIDECAR } from './views/webSidecarView';
import { WebViewerManager } from './experimental/WebViewerManager';
import { UrlIndex } from './services/UrlIndex';
import { TabStateService } from './services/TabStateService';
import { capturePageAsMarkdown, findWebViewerLeafById } from './services/contentCapture';

/**
 * Web Sidecar Plugin
 * Watches active web viewer URLs and displays related notes in a sidebar
 */
export default class WebSidecarPlugin extends Plugin {
	settings!: WebSidecarSettings;
	private view: WebSidecarView | null = null;
	private webViewerManager: WebViewerManager | null = null;
	private urlIndex!: UrlIndex;
	private tabStateService!: TabStateService;




	async onload(): Promise<void> {
		await this.loadSettings();



		// 1. Initialize Services
		// UrlIndex for fast lookups
		this.urlIndex = new UrlIndex(this.app, () => this.settings);

		// TabStateService for tracking web viewers
		this.tabStateService = new TabStateService(
			this,
			() => this.settings,
			() => this.updateView()
		);

		// CRITICAL: Initialize both services AFTER layout is ready
		// This ensures workspace is fully restored (web viewers exist, metadata cache is populated)
		this.app.workspace.onLayoutReady(() => {
			this.urlIndex.initialize();
			this.tabStateService.initialize();
		});

		// WebViewerManager for UI injection (buttons, menus)
		this.webViewerManager = new WebViewerManager(this.app, () => this.settings, this.urlIndex);
		this.webViewerManager.initialize();

		// Listen for index updates to refresh view (fixes missing aux sections on load)
		this.urlIndex.on('index-updated', () => {
			this.tabStateService.refreshState();
		});

		// 2. Register View
		this.registerView(
			VIEW_TYPE_WEB_SIDECAR,
			(leaf) => {
				this.view = new WebSidecarView(
					leaf,
					() => this.settings,
					() => this.tabStateService.refreshState(), // onRefresh callback
					() => this.tabStateService.getTrackedTabs(),
					() => this.tabStateService.getVirtualTabs(),
					this.urlIndex,
					this.tabStateService,
					async () => { await this.saveData(this.settings); } // saveSettings callback - LIGHTWEIGHT (no rebuild/refresh)
				);
				return this.view;
			}
		);

		// 3. Register Commands & Icons
		this.addRibbonIcon('globe', 'Open Web Sidecar', () => {
			this.activateView();
		});

		this.addCommand({
			id: 'open-web-sidecar',
			name: 'Open sidebar',
			callback: () => {
				this.activateView();
			},
		});

		this.addCommand({
			id: 'refresh-web-sidecar',
			name: 'Refresh',
			callback: () => {
				this.tabStateService.refreshState();
			},
		});

		this.addSettingTab(new WebSidecarSettingTab(this.app, this));

		// 4. Register Events
		// Custom event for direct note creation (no modal - captures content and creates immediately)
		const handleCreateNote = async (e: Event) => {
			const customEvent = e as CustomEvent<{ url: string; leafId?: string }>;
			if (customEvent.detail?.url) {
				const url = customEvent.detail.url;
				const leafId = customEvent.detail.leafId;

				await this.createLinkedNoteFromUrl(url, leafId);
			}
		};
		window.addEventListener('web-sidecar:create-note', handleCreateNote);
		this.register(() => window.removeEventListener('web-sidecar:create-note', handleCreateNote));

		// File menu (More Options)
		this.registerEvent(
			this.app.workspace.on('file-menu', (menu: Menu, _file, _source, leaf?: WorkspaceLeaf) => {
				if (leaf && this.webViewerManager) {
					this.webViewerManager.addMenuItems(menu, leaf);
				}
			})
		);
	}

	onunload(): void {
		this.tabStateService?.destroy();
		this.webViewerManager?.destroy();
		this.urlIndex?.destroy();
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

		// Migration: Ensure new sections are in sectionOrder
		const allSections = ['recent', 'domain', 'subreddit', 'youtube', 'twitter', 'tag', 'selected-tag'];
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

	/**
	 * Callback when tab state changes
	 */
	private updateView(): void {
		this.view?.updateTabs(
			this.tabStateService.getTrackedTabs(),
			this.tabStateService.getVirtualTabs()
		);
		// Also update dynamic buttons in web viewers
		this.webViewerManager?.updateAllButtons();
	}

	async activateView(): Promise<void> {
		const { workspace } = this.app;
		let leaf: WorkspaceLeaf | null = null;
		const leaves = workspace.getLeavesOfType(VIEW_TYPE_WEB_SIDECAR);

		if (leaves.length > 0) {
			leaf = leaves[0] ?? null;
		} else {
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
			this.tabStateService.refreshState();
		}
	}

	/**
	 * Create a linked note directly from URL without modal.
	 * Captures page content if setting is enabled and leafId is provided.
	 */
	private async createLinkedNoteFromUrl(url: string, leafId?: string): Promise<void> {
		// Capture content if setting enabled and we have a leafId
		let capturedContent: string | null = null;
		if (this.settings.capturePageContent && leafId) {
			const leaf = findWebViewerLeafById(this.app, leafId);
			if (leaf) {
				capturedContent = await capturePageAsMarkdown(leaf);
			}
		}

		// Generate title from URL
		const noteTitle = this.generateTitleFromUrl(url);
		const fileName = this.sanitizeFileName(noteTitle) + '.md';
		const folderPath = this.getFolderPath();

		// Construct full path
		let fullPath = folderPath ? `${folderPath}/${fileName}` : fileName;
		fullPath = fullPath.replace(/\/+/g, '/'); // Normalize slashes

		// Create folder if needed
		if (folderPath) {
			const folder = this.app.vault.getAbstractFileByPath(folderPath);
			if (!folder) {
				await this.app.vault.createFolder(folderPath);
			}
		}

		// Handle existing file (append timestamp)
		const existingFile = this.app.vault.getAbstractFileByPath(fullPath);
		if (existingFile) {
			const timestamp = Date.now();
			fullPath = folderPath
				? `${folderPath}/${this.sanitizeFileName(noteTitle)}-${timestamp}.md`
				: `${this.sanitizeFileName(noteTitle)}-${timestamp}.md`;
		}

		// Generate note content
		const lines = [
			'---',
			`${this.settings.primaryUrlProperty}: ${url}`,
			'---',
			'',
			`# ${noteTitle}`,
			'',
		];

		// Add captured content if available
		if (capturedContent) {
			lines.push(capturedContent);
			lines.push('');
		}

		const content = lines.join('\n');

		// Create file and open it
		try {
			await this.app.vault.create(fullPath, content);
			await this.app.workspace.openLinkText(fullPath, '', true);
			this.tabStateService.refreshState();
		} catch (error) {
			console.error('Web Sidecar: Failed to create note:', error);
		}
	}

	private generateTitleFromUrl(url: string): string {
		try {
			let urlWithProtocol = url;
			if (!url.match(/^https?:\/\//)) {
				urlWithProtocol = 'https://' + url;
			}
			const parsed = new URL(urlWithProtocol);

			// Try to get a meaningful title from the pathname
			const pathname = parsed.pathname.replace(/\/$/, '');
			if (pathname && pathname !== '/') {
				const lastSegment = pathname.split('/').pop() || '';
				const cleaned = lastSegment
					.replace(/[-_]/g, ' ')
					.replace(/\.[^.]+$/, '')
					.trim();
				if (cleaned) {
					return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
				}
			}

			return parsed.hostname.replace(/^www\./, '');
		} catch {
			return 'New Note';
		}
	}

	private sanitizeFileName(name: string): string {
		return name
			.replace(/[\\/:*?"<>|]/g, '')
			.replace(/\s+/g, ' ')
			.trim();
	}

	/**
	 * Resolve folder path based on settings - uses vault config or custom path
	 */
	private getFolderPath(): string {
		if (this.settings.useVaultDefaultLocation) {
			// @ts-expect-error - Internal API: vault.getConfig is not typed
			const newFileLocation: 'root' | 'current' | 'folder' = this.app.vault.getConfig?.('newFileLocation') ?? 'root';

			if (newFileLocation === 'folder') {
				// @ts-expect-error - Internal API: vault.getConfig is not typed
				return this.app.vault.getConfig?.('newFileFolderPath') || '';
			} else if (newFileLocation === 'current') {
				// Use folder of currently active file
				const activeFile = this.app.workspace.getActiveFile();
				return activeFile?.parent?.path || '';
			}
			// 'root' or default
			return '';
		}
		return this.settings.newNoteFolderPath;
	}
}
