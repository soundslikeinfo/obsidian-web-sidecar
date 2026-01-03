
import { Plugin, WorkspaceLeaf, Menu, TFile } from 'obsidian';
import { WebSidecarSettings, DEFAULT_SETTINGS } from './types';
import { WebSidecarSettingTab } from './settings/settingsTab';
import { WebSidecarView, VIEW_TYPE_WEB_SIDECAR } from './views/webSidecarView';
import { WebViewerManager } from './experimental/WebViewerManager';
import { CreateNoteModal } from './modals/createNoteModal';
import { UrlIndex } from './services/UrlIndex';
import { TabStateService } from './services/TabStateService';

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
		this.app.workspace.onLayoutReady(() => {
			this.urlIndex.initialize();
		});

		// TabStateService for tracking web viewers
		this.tabStateService = new TabStateService(
			this,
			() => this.settings,
			() => this.updateView()
		);
		this.tabStateService.initialize();

		// WebViewerManager for UI injection (buttons, menus)
		this.webViewerManager = new WebViewerManager(this.app, () => this.settings, this.urlIndex);
		this.webViewerManager.initialize();

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
					() => this.saveSettings() // saveSettings callback
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
			name: 'Open Web Sidecar sidebar',
			callback: () => {
				this.activateView();
			},
		});

		this.addCommand({
			id: 'refresh-web-sidecar',
			name: 'Refresh Web Sidecar',
			callback: () => {
				this.tabStateService.refreshState();
			},
		});

		this.addSettingTab(new WebSidecarSettingTab(this.app, this));

		// 4. Register Events
		// Custom event for create note modal (dispatched by WebViewerUI)
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
						this.tabStateService.refreshState();
					}
				).open();
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
}
