import { ItemView, WorkspaceLeaf, TFile, setIcon } from 'obsidian';
import type { WebSidecarSettings, TrackedWebViewer } from './types';
import { findMatchingNotes, getRecentNotesWithUrls } from './noteMatcher';
import { extractDomain } from './urlUtils';
import { CreateNoteModal } from './createNoteModal';

export const VIEW_TYPE_WEB_SIDECAR = 'web-sidecar-view';

/**
 * Sidebar view for Web Sidecar plugin
 */
export class WebSidecarView extends ItemView {
    private settings: WebSidecarSettings;
    private trackedTabs: TrackedWebViewer[] = [];
    private getSettings: () => WebSidecarSettings;
    private onRefresh: () => void;
    private getTabs: () => TrackedWebViewer[];

    constructor(
        leaf: WorkspaceLeaf,
        getSettings: () => WebSidecarSettings,
        onRefresh: () => void,
        getTabs: () => TrackedWebViewer[]
    ) {
        super(leaf);
        this.getSettings = getSettings;
        this.onRefresh = onRefresh;
        this.getTabs = getTabs;
        this.settings = getSettings();
    }

    getViewType(): string {
        return VIEW_TYPE_WEB_SIDECAR;
    }

    getDisplayText(): string {
        return 'Web Sidecar';
    }

    getIcon(): string {
        return 'globe';
    }

    async onOpen(): Promise<void> {
        this.settings = this.getSettings();
        this.trackedTabs = this.getTabs();
        this.render();
    }

    async onClose(): Promise<void> {
        // Cleanup
    }

    /**
     * Update the view with tracked tabs
     */
    updateTabs(tabs: TrackedWebViewer[]): void {
        this.settings = this.getSettings();
        this.trackedTabs = tabs;
        this.render();
    }

    /**
     * Legacy method for compatibility
     */
    updateWithInfo(info: { url: string; title?: string } | null): void {
        // Not used in multi-tab mode, but keeping for compatibility
        this.onRefresh();
    }

    /**
     * Legacy method for compatibility
     */
    updateUrl(url: string | null): void {
        this.onRefresh();
    }

    /**
     * Main render method
     */
    private render(): void {
        const container = this.containerEl.children[1] as HTMLElement;
        container.empty();
        container.addClass('web-sidecar-container');

        if (this.trackedTabs.length === 0) {
            this.renderEmptyState(container);
        } else {
            this.renderTabList(container);
        }
    }

    /**
     * Render the empty state with recent notes
     */
    private renderEmptyState(container: HTMLElement): void {
        // Header with refresh button
        const header = container.createDiv({ cls: 'web-sidecar-header' });
        const headerRow = header.createDiv({ cls: 'web-sidecar-header-row' });
        headerRow.createEl('h4', { text: 'No web viewer tabs open' });

        const refreshBtn = headerRow.createEl('button', {
            cls: 'web-sidecar-refresh-btn clickable-icon',
            attr: { 'aria-label': 'Refresh' }
        });
        setIcon(refreshBtn, 'refresh-cw');
        refreshBtn.addEventListener('click', () => this.onRefresh());

        // Recent notes section
        const recentNotes = getRecentNotesWithUrls(
            this.app,
            this.settings,
            this.settings.recentNotesCount
        );

        if (recentNotes.length > 0) {
            const recentSection = container.createDiv({ cls: 'web-sidecar-section' });
            recentSection.createEl('h5', { text: 'Recent notes with URLs' });

            const list = recentSection.createEl('ul', { cls: 'web-sidecar-list' });

            for (const note of recentNotes) {
                this.renderNoteItem(list, note.file, note.url);
            }
        } else {
            container.createEl('p', {
                text: 'No notes with URL properties found.',
                cls: 'web-sidecar-empty-text'
            });
        }
    }

    /**
     * Render the list of all tracked tabs
     */
    private renderTabList(container: HTMLElement): void {
        // Header with count and controls
        const header = container.createDiv({ cls: 'web-sidecar-header' });
        const headerRow = header.createDiv({ cls: 'web-sidecar-header-row' });
        headerRow.createEl('h4', { text: `Open Tabs (${this.trackedTabs.length})` });

        const controls = headerRow.createDiv({ cls: 'web-sidecar-controls' });

        // Sort toggle
        const sortBtn = controls.createEl('button', {
            cls: 'web-sidecar-sort-btn clickable-icon',
            attr: {
                'aria-label': `Sort by ${this.settings.tabSortOrder === 'focus' ? 'title' : 'recent'}`,
                'title': `Currently: ${this.settings.tabSortOrder === 'focus' ? 'Recent first' : 'Alphabetical'}`
            }
        });
        setIcon(sortBtn, this.settings.tabSortOrder === 'focus' ? 'clock' : 'arrow-down-az');
        sortBtn.addEventListener('click', async () => {
            this.settings.tabSortOrder = this.settings.tabSortOrder === 'focus' ? 'title' : 'focus';
            await this.onRefresh();
        });

        // New web viewer button
        const newWebViewBtn = controls.createEl('button', {
            cls: 'web-sidecar-new-btn clickable-icon',
            attr: { 'aria-label': 'Open new web viewer', 'title': 'Open new web viewer' }
        });
        setIcon(newWebViewBtn, 'plus');
        newWebViewBtn.addEventListener('click', () => this.openNewWebViewer());

        // Refresh button
        const refreshBtn = controls.createEl('button', {
            cls: 'web-sidecar-refresh-btn clickable-icon',
            attr: { 'aria-label': 'Refresh' }
        });
        setIcon(refreshBtn, 'refresh-cw');
        refreshBtn.addEventListener('click', () => this.onRefresh());

        // Render each tab
        for (const tab of this.trackedTabs) {
            this.renderTabEntry(container, tab);
        }
    }

    /**
     * Render a single tab entry with its matching notes
     */
    private renderTabEntry(container: HTMLElement, tab: TrackedWebViewer): void {
        const tabSection = container.createDiv({ cls: 'web-sidecar-tab-entry' });

        // Tab header with favicon and title - clickable to focus the web viewer
        const tabHeader = tabSection.createDiv({ cls: 'web-sidecar-tab-header clickable' });
        tabHeader.addEventListener('click', (e) => {
            // Don't trigger if clicking on the create button
            if ((e.target as HTMLElement).closest('.web-sidecar-create-btn-small')) return;
            this.focusWebViewer(tab.leafId);
        });

        const domain = extractDomain(tab.url);

        // Favicon
        if (domain) {
            const favicon = tabHeader.createEl('img', {
                cls: 'web-sidecar-favicon',
                attr: {
                    src: `https://www.google.com/s2/favicons?domain=${domain}&sz=32`,
                    alt: '',
                    width: '16',
                    height: '16'
                }
            });
            favicon.onerror = () => {
                favicon.style.display = 'none';
            };
        }

        // Title and URL
        const tabInfo = tabHeader.createDiv({ cls: 'web-sidecar-tab-info' });
        tabInfo.createEl('span', { text: tab.title, cls: 'web-sidecar-tab-title' });
        tabInfo.createEl('code', { text: tab.url, cls: 'web-sidecar-tab-url' });

        // Create note button
        const createBtn = tabHeader.createEl('button', {
            cls: 'web-sidecar-create-btn-small clickable-icon',
            attr: { 'aria-label': 'Create note for this URL' }
        });
        setIcon(createBtn, 'plus');
        createBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.openCreateNoteModal(tab.url);
        });

        // Find matches for this tab
        const matches = findMatchingNotes(this.app, tab.url, this.settings);
        const hasMatches = matches.exactMatches.length > 0 || matches.tldMatches.length > 0;

        if (hasMatches) {
            // Exact matches
            if (matches.exactMatches.length > 0) {
                const matchList = tabSection.createEl('ul', { cls: 'web-sidecar-list web-sidecar-exact' });
                for (const match of matches.exactMatches) {
                    this.renderNoteItem(matchList, match.file, match.url);
                }
            }

            // TLD matches (collapsible)
            if (this.settings.enableTldSearch && matches.tldMatches.length > 0) {
                const details = tabSection.createEl('details', { cls: 'web-sidecar-tld-matches' });
                const summary = details.createEl('summary');
                summary.createSpan({ text: `Same domain (${matches.tldMatches.length})` });

                const matchList = details.createEl('ul', { cls: 'web-sidecar-list' });
                for (const match of matches.tldMatches) {
                    this.renderNoteItem(matchList, match.file, match.url);
                }
            }
        } else {
            tabSection.createEl('p', {
                text: 'No matching notes',
                cls: 'web-sidecar-no-matches'
            });
        }
    }

    /**
     * Render a single note item
     */
    private renderNoteItem(list: HTMLElement, file: TFile, url: string): void {
        const li = list.createEl('li', { cls: 'web-sidecar-item' });

        const link = li.createEl('a', {
            text: file.basename,
            cls: 'web-sidecar-link',
            attr: { href: '#' }
        });

        link.addEventListener('click', (e) => {
            e.preventDefault();
            this.app.workspace.openLinkText(file.path, '', true);
        });

        // Show URL snippet - clickable to open in web viewer
        const urlSnippet = li.createEl('a', {
            cls: 'web-sidecar-url-snippet clickable',
            attr: { href: '#', title: 'Open in web viewer' }
        });
        const domain = extractDomain(url);
        urlSnippet.setText(domain || url);
        urlSnippet.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.openUrlInWebViewer(url);
        });
    }

    /**
     * Focus a specific web viewer by leaf ID
     */
    private focusWebViewer(leafId: string): void {
        const leaves = this.app.workspace.getLeavesOfType('webviewer')
            .concat(this.app.workspace.getLeavesOfType('surfing-view'));

        for (const leaf of leaves) {
            const id = (leaf as any).id || leaf.view.getViewType() + '-' + leaves.indexOf(leaf);
            if (id === leafId) {
                this.app.workspace.revealLeaf(leaf);
                return;
            }
        }
    }

    /**
     * Open a URL - focus existing tab if already open, otherwise create new
     */
    private async openUrlInWebViewer(url: string): Promise<void> {
        // First check if this URL is already open in a tab
        const leaves = this.app.workspace.getLeavesOfType('webviewer')
            .concat(this.app.workspace.getLeavesOfType('surfing-view'));

        for (const leaf of leaves) {
            const state = leaf.view.getState();
            if (state?.url === url) {
                // URL already open, focus this tab
                this.app.workspace.revealLeaf(leaf);
                return;
            }
        }

        // URL not open, create new tab
        const leaf = this.app.workspace.getLeaf('tab');
        await leaf.setViewState({
            type: 'webviewer',
            state: { url, navigate: true }
        });
        this.app.workspace.revealLeaf(leaf);
    }

    /**
     * Open a new empty web viewer
     */
    private async openNewWebViewer(): Promise<void> {
        const leaf = this.app.workspace.getLeaf('tab');
        await leaf.setViewState({
            type: 'webviewer',
            state: { url: 'about:blank', navigate: true }
        });
        this.app.workspace.revealLeaf(leaf);
    }

    /**
     * Open the create note modal
     */
    private openCreateNoteModal(url: string): void {
        new CreateNoteModal(
            this.app,
            url,
            this.settings,
            async (path) => {
                // Open the newly created note
                const file = this.app.vault.getAbstractFileByPath(path);
                if (file instanceof TFile) {
                    await this.app.workspace.openLinkText(path, '', true);
                }
                // Refresh the view
                this.onRefresh();
            }
        ).open();
    }
}
