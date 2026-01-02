import { ItemView, WorkspaceLeaf, TFile, setIcon, Menu } from 'obsidian';
import type { WebSidecarSettings, TrackedWebViewer, VirtualTab } from '../types';
import { findMatchingNotes, getRecentNotesWithUrls, extractSubreddit, getAllRedditNotes } from '../services/noteMatcher';
import { extractDomain } from '../services/urlUtils';
import { CreateNoteModal } from '../modals/createNoteModal';

export const VIEW_TYPE_WEB_SIDECAR = 'web-sidecar-view';

/**
 * Sidebar view for Web Sidecar plugin
 */
export class WebSidecarView extends ItemView {
    private settings: WebSidecarSettings;
    private trackedTabs: TrackedWebViewer[] = [];
    private virtualTabs: VirtualTab[] = [];
    private getSettings: () => WebSidecarSettings;
    private onRefresh: () => void;
    private getTabs: () => TrackedWebViewer[];
    private getVirtualTabsFn: () => VirtualTab[];
    private urlCycleIndex: Map<string, number> = new Map();
    /** Track if user is interacting with the sidebar (prevents re-render) */
    private isInteracting: boolean = false;
    private isManualRefresh: boolean = false;
    private isDomainGroupOpen: boolean = false;
    private isSubredditExplorerOpen: boolean = false;
    private domainSort: 'alpha' | 'count' = 'alpha';
    private subredditSort: 'alpha' | 'count' = 'alpha';

    constructor(
        leaf: WorkspaceLeaf,
        getSettings: () => WebSidecarSettings,
        onRefresh: () => void,
        getTabs: () => TrackedWebViewer[],
        getVirtualTabs: () => VirtualTab[]
    ) {
        super(leaf);
        this.getSettings = getSettings;
        this.onRefresh = onRefresh;
        this.getTabs = getTabs;
        this.getVirtualTabsFn = getVirtualTabs;
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
        this.virtualTabs = this.getVirtualTabsFn();
        this.render();
    }

    async onClose(): Promise<void> {
        // Cleanup
    }

    /**
     * Update the view with tracked tabs and virtual tabs
     */
    updateTabs(tabs: TrackedWebViewer[], virtualTabs: VirtualTab[] = []): void {
        // Detect structural changes that should always trigger a render
        const countChanged = tabs.length !== this.trackedTabs.length;

        this.settings = this.getSettings();
        this.trackedTabs = tabs;
        this.virtualTabs = virtualTabs;

        // Skip render if user is interacting to prevent click issues
        // BUT force render if:
        // 1. Manual refresh was requested (button click)
        // 2. Tab count changed (e.g. new tab opened) - crucial for "New tab" button feedback
        if (!this.isInteracting || this.isManualRefresh || countChanged) {
            this.render();
            this.isManualRefresh = false;
        }
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
        container.addClass('web-sidecar-container');

        // Add mode-specific class
        container.removeClass('web-sidecar-notes-mode', 'web-sidecar-browser-mode');
        container.addClass(this.settings.tabAppearance === 'browser'
            ? 'web-sidecar-browser-mode'
            : 'web-sidecar-notes-mode');

        // Track mouse enter/leave to prevent re-rendering during interaction
        if (!container.getAttribute('data-events-bound')) {
            container.addEventListener('mouseenter', () => { this.isInteracting = true; });
            container.addEventListener('mouseleave', () => { this.isInteracting = false; });
            container.setAttribute('data-events-bound', 'true');
        }

        // Show full view if we have web tabs OR virtual tabs
        const hasContent = this.trackedTabs.length > 0 || this.virtualTabs.length > 0;

        // Instead of full clear, just clear content if we are switching modes or empty
        // For now, simpler optimization: empty only if necessary or keep empty() but minimize rebuild cost?
        // Actually, to fix flashing, we should avoid emptying the container if it already has the correct structure.
        // But the structure depends on content.
        // Let's stick to the current implementation but optimize renderBrowserModeTabList to be smarter.
        container.empty();

        if (!hasContent) {
            this.renderEmptyState(container);
        } else if (this.settings.tabAppearance === 'browser') {
            this.renderBrowserModeTabList(container);
        } else {
            this.renderTabList(container);
        }
    }

    /**
     * Render the empty state with recent notes
     */
    private renderEmptyState(container: HTMLElement): void {
        // Check if browser mode - use consistent layout
        if (this.settings.tabAppearance === 'browser') {
            // Header with controls
            const header = container.createDiv({ cls: 'web-sidecar-browser-header' });
            const controls = header.createDiv({ cls: 'web-sidecar-controls' });
            const refreshBtn = controls.createEl('button', {
                cls: 'web-sidecar-refresh-btn clickable-icon',
                attr: { 'aria-label': 'Refresh' }
            });
            setIcon(refreshBtn, 'refresh-cw');
            refreshBtn.addEventListener('click', () => this.onRefresh());

            // "+ New tab" button (always visible)
            const newTabBtn = container.createDiv({ cls: 'web-sidecar-new-tab-btn' });
            const plusIcon = newTabBtn.createSpan({ cls: 'web-sidecar-new-tab-icon' });
            setIcon(plusIcon, 'plus');
            newTabBtn.createSpan({ text: 'New web tab', cls: 'web-sidecar-new-tab-text' });
            newTabBtn.addEventListener('click', () => this.openNewWebViewer());

            // "Recent web notes" collapsible section at bottom
            this.renderRecentWebNotesSection(container);
            return;
        }

        // Notes mode (original behavior)
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
            recentSection.createEl('h5', { text: 'Recent web notes' });

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
            this.isManualRefresh = true;
            this.settings.tabSortOrder = this.settings.tabSortOrder === 'focus' ? 'title' : 'focus';
            await this.onRefresh();
        });

        // Refresh button
        const refreshBtn = controls.createEl('button', {
            cls: 'web-sidecar-refresh-btn clickable-icon',
            attr: { 'aria-label': 'Refresh' }
        });
        setIcon(refreshBtn, 'refresh-cw');
        refreshBtn.addEventListener('click', () => this.onRefresh());

        // Render each tab (with deduplication if enabled)
        if (this.settings.collapseDuplicateUrls) {
            const grouped = this.getGroupedTabs();
            for (const group of grouped) {
                this.renderTabEntry(container, group.primary, group.all);
            }
        } else {
            for (const tab of this.trackedTabs) {
                this.renderTabEntry(container, tab);
            }
        }

        // Render virtual tabs (from open notes with URLs)
        if (this.virtualTabs.length > 0) {
            const virtualSection = container.createDiv({ cls: 'web-sidecar-virtual-section' });
            virtualSection.createEl('h5', { text: 'Open Notes with URLs', cls: 'web-sidecar-section-title' });
            for (const virtualTab of this.virtualTabs) {
                this.renderVirtualTab(virtualSection, virtualTab);
            }
        }

        // "+ New Tab" button (same style as browser mode)
        const newTabBtn = container.createDiv({ cls: 'web-sidecar-new-tab-btn' });
        const plusIcon = newTabBtn.createSpan({ cls: 'web-sidecar-new-tab-icon' });
        setIcon(plusIcon, 'plus');
        newTabBtn.createSpan({ text: 'New web tab', cls: 'web-sidecar-new-tab-text' });
        newTabBtn.addEventListener('click', () => this.openNewWebViewer());

        // "Recent web notes" collapsible section
        this.renderRecentWebNotesSection(container);
    }

    /**
     * Render a single tab entry with its matching notes
     * @param allTabs - When in deduplication mode, all tabs with same URL for cycle-click
     */
    private renderTabEntry(container: HTMLElement, tab: TrackedWebViewer, allTabs?: TrackedWebViewer[]): void {
        const tabSection = container.createDiv({ cls: 'web-sidecar-tab-entry' });
        const isDeduped = allTabs && allTabs.length > 1;

        // Tab header with favicon and title - clickable to focus the web viewer
        const tabHeader = tabSection.createDiv({ cls: 'web-sidecar-tab-header clickable' });
        tabHeader.addEventListener('click', (e) => {
            // Don't trigger if clicking on the create button
            if ((e.target as HTMLElement).closest('.web-sidecar-create-btn-small')) return;
            if (isDeduped && allTabs) {
                this.focusNextInstance(tab.url, allTabs);
            } else {
                this.focusWebViewer(tab.leafId);
            }
        });
        tabHeader.addEventListener('contextmenu', (e) => this.showWebViewerContextMenu(e, tab));

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

        // Right-aligned indicators container
        const indicators = tabHeader.createDiv({ cls: 'web-sidecar-tab-indicators' });

        // Pop-out icon (if any tab in group is popout, or this tab is popout)
        const showPopout = isDeduped ? allTabs!.some(t => t.isPopout) : tab.isPopout;
        if (showPopout) {
            const popoutIcon = indicators.createSpan({ cls: 'web-sidecar-popout-icon' });
            setIcon(popoutIcon, 'picture-in-picture-2');
            popoutIcon.setAttribute('aria-label', 'In popout window');
            popoutIcon.setAttribute('title', 'In popout window');
        }

        // Tab count badge (for deduplicated URLs)
        if (isDeduped && allTabs) {
            const countBadge = indicators.createSpan({
                text: `${allTabs.length}`,
                cls: 'web-sidecar-tab-count-badge',
                attr: {
                    'aria-label': `${allTabs.length} tabs`,
                    'title': `${allTabs.length} tabs open (click to cycle)`
                }
            });
        }

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

                // Dynamic header text based on subreddit filter
                let headerText = `More notes from this domain (${matches.tldMatches.length})`;
                if (this.settings.enableSubredditFilter) {
                    const subreddit = extractSubreddit(tab.url);
                    if (subreddit) {
                        headerText = `More notes from ${subreddit} (${matches.tldMatches.length})`;
                    }
                }

                summary.createSpan({ text: headerText });

                const matchList = details.createEl('ul', { cls: 'web-sidecar-list' });
                for (const match of matches.tldMatches) {
                    this.renderNoteItem(matchList, match.file, match.url);
                }
            }

            // Subreddit Explorer Groups
            if (this.settings.enableSubredditExplorer && matches.subredditMatches && matches.subredditMatches.size > 0) {
                const explorerSection = tabSection.createDiv({ cls: 'web-sidecar-subreddit-explorer' });

                matches.subredditMatches.forEach((notes, subreddit) => {
                    if (notes.length === 0) return;

                    const details = explorerSection.createEl('details', { cls: 'web-sidecar-subreddit-group' });
                    // Open by default? User didn't specify, but explorer usually implies visibility. Let's start closed to save space.

                    const summary = details.createEl('summary');

                    // Flex container for summary
                    const summaryContent = summary.createDiv({ cls: 'web-sidecar-summary-content' });

                    // Reddit Favicon
                    const favicon = summaryContent.createEl('img', {
                        cls: 'web-sidecar-favicon-small',
                        attr: {
                            src: `https://www.google.com/s2/favicons?domain=reddit.com&sz=16`,
                            alt: 'Reddit',
                            width: '14',
                            height: '14'
                        }
                    });

                    summaryContent.createSpan({ text: `${subreddit} (${notes.length})` });

                    const matchList = details.createEl('ul', { cls: 'web-sidecar-list' });
                    for (const match of notes) {
                        this.renderNoteItem(matchList, match.file, match.url);
                    }
                });
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
    /**
     * Render a single note item in a list
     * @param pairedOpen - If true, clicking note name opens both web viewer AND note (for recent/domain sections)
     */
    private renderNoteItem(list: HTMLElement, file: TFile, url: string, pairedOpen: boolean = false): void {
        const li = list.createEl('li', { cls: 'web-sidecar-item' });

        const link = li.createEl('div', {
            text: file.basename,
            cls: 'web-sidecar-link clickable',
            attr: { tabindex: '0' }
        });

        link.addEventListener('click', async (e) => {
            e.preventDefault();
            if (pairedOpen) {
                await this.openPaired(file, url, e);
            } else {
                this.openNoteSmartly(file, e);
            }
        });
        link.addEventListener('contextmenu', (e) => this.showNoteContextMenu(e, file, url));

        // Show URL snippet - always just opens web viewer (not paired)
        const urlSnippet = li.createEl('div', {
            cls: 'web-sidecar-url-snippet clickable',
            attr: { tabindex: '0', title: 'Open in web viewer' }
        });
        const domain = extractDomain(url);
        urlSnippet.setText(domain || url);
        urlSnippet.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.openUrlSmartly(url, e);
        });
    }

    /**
     * Open both web viewer AND note together (paired opening)
     * Web viewer on left, note split to the right
     */
    private async openPaired(file: TFile, url: string, e: MouseEvent): Promise<void> {
        // CMD/Ctrl + click = open in new popout window (just note)
        if (e.metaKey || e.ctrlKey) {
            const newWindow = this.app.workspace.openPopoutLeaf();
            await newWindow.openFile(file);
            return;
        }

        // Check if URL is already open in a web viewer
        const webLeaves = this.app.workspace.getLeavesOfType('webviewer')
            .concat(this.app.workspace.getLeavesOfType('surfing-view'));

        let webLeaf: WorkspaceLeaf | null = null;
        let blankWebLeaf: WorkspaceLeaf | null = null;

        for (const leaf of webLeaves) {
            const state = leaf.view.getState();
            if (state?.url === url) {
                webLeaf = leaf;
                break;
            }
            // Track blank/empty web viewers for reuse
            if (!blankWebLeaf && (!state?.url || state.url === 'about:blank' || state.url === '')) {
                blankWebLeaf = leaf;
            }
        }

        // Check if note is already open
        const markdownLeaves = this.app.workspace.getLeavesOfType('markdown');
        let noteLeaf: WorkspaceLeaf | null = null;
        for (const leaf of markdownLeaves) {
            const viewFile = (leaf.view as any).file;
            if (viewFile && viewFile.path === file.path) {
                noteLeaf = leaf;
                break;
            }
        }

        // If both already open, just focus the note
        if (webLeaf && noteLeaf) {
            this.app.workspace.revealLeaf(noteLeaf);
            return;
        }

        // If web viewer with this URL exists, just open/focus note
        if (webLeaf) {
            if (noteLeaf) {
                this.app.workspace.revealLeaf(noteLeaf);
            } else if (this.settings.noteOpenBehavior === 'split') {
                // Split right of existing web viewer
                const newNoteLeaf = this.app.workspace.createLeafBySplit(webLeaf, 'vertical');
                await newNoteLeaf.openFile(file);
            } else {
                // Open as new tab
                const newNoteLeaf = this.app.workspace.getLeaf('tab');
                await newNoteLeaf.openFile(file);
            }
            return;
        }

        // No matching web viewer - reuse blank one or create new tab
        if (blankWebLeaf) {
            webLeaf = blankWebLeaf;
        } else {
            webLeaf = this.app.workspace.getLeaf('tab');
        }

        // Navigate web viewer to URL
        await webLeaf.setViewState({
            type: 'webviewer',
            state: { url, navigate: true }
        });

        // Open note based on noteOpenBehavior setting
        if (noteLeaf) {
            this.app.workspace.revealLeaf(noteLeaf);
        } else if (this.settings.noteOpenBehavior === 'split') {
            // Split right of web viewer
            const newNoteLeaf = this.app.workspace.createLeafBySplit(webLeaf, 'vertical');
            await newNoteLeaf.openFile(file);
        } else {
            // Open as new tab
            const newNoteLeaf = this.app.workspace.getLeaf('tab');
            await newNoteLeaf.openFile(file);
        }
    }

    /**
     * Smart note opening: focus existing, shift=new tab, cmd=popout
     */
    private async openNoteSmartly(file: TFile, e: MouseEvent): Promise<void> {
        // CMD/Ctrl + click = open in new popout window
        if (e.metaKey || e.ctrlKey) {
            const newWindow = this.app.workspace.openPopoutLeaf();
            await newWindow.openFile(file);
            return;
        }

        // Shift + click = force new tab
        if (e.shiftKey) {
            await this.app.workspace.openLinkText(file.path, '', 'tab');
            return;
        }

        // Check if note is already open anywhere
        const leaves = this.app.workspace.getLeavesOfType('markdown');
        for (const leaf of leaves) {
            const viewFile = (leaf.view as any).file;
            if (viewFile && viewFile.path === file.path) {
                // Already open, just focus it
                this.app.workspace.revealLeaf(leaf);
                return;
            }
        }

        // Not open - use noteOpenBehavior setting
        if (this.settings.noteOpenBehavior === 'split') {
            const newLeaf = this.app.workspace.getLeaf('split', 'vertical');
            await newLeaf.openFile(file);
        } else {
            const newLeaf = this.app.workspace.getLeaf('tab');
            await newLeaf.openFile(file);
        }
    }

    /**
     * Smart URL opening: focus existing, shift=new tab, cmd=popout
     */
    private async openUrlSmartly(url: string, e: MouseEvent): Promise<void> {
        // CMD/Ctrl + click = open in new popout window
        if (e.metaKey || e.ctrlKey) {
            const newWindow = this.app.workspace.openPopoutLeaf();
            await newWindow.setViewState({
                type: 'webviewer',
                state: { url, navigate: true }
            });
            return;
        }

        // Shift + click = force new tab (bypass existing check)
        if (e.shiftKey) {
            const leaf = this.app.workspace.getLeaf('tab');
            await leaf.setViewState({
                type: 'webviewer',
                state: { url, navigate: true }
            });
            return;
        }

        // Default: focus existing or open new
        await this.openUrlInWebViewer(url);
    }

    /**
     * Close a specific leaf by ID
     */
    private closeLeaf(leafId: string): void {
        const leaf = this.app.workspace.getLeafById(leafId);
        if (leaf) {
            leaf.detach();
        }
    }

    /**
     * Close all web viewer leaves for a specific URL
     */
    private closeAllLeavesForUrl(url: string): void {
        const leaves = this.app.workspace.getLeavesOfType('webviewer')
            .concat(this.app.workspace.getLeavesOfType('surfing-view'));

        for (const leaf of leaves) {
            const state = leaf.view.getState();
            if (state?.url === url) {
                leaf.detach();
            }
        }
    }

    /**
     * Close all linked note leaves for a URL
     */
    private closeLinkedNoteLeaves(url: string): void {
        const matches = findMatchingNotes(this.app, url, this.settings);
        const allMatches = [...matches.exactMatches, ...matches.tldMatches];

        // Also check if any notes in subreddit groups match
        if (matches.subredditMatches) {
            matches.subredditMatches.forEach(notes => allMatches.push(...notes));
        }

        if (allMatches.length === 0) return;

        const filePaths = new Set(allMatches.map(m => m.file.path));
        const leaves = this.app.workspace.getLeavesOfType('markdown');

        for (const leaf of leaves) {
            const file = (leaf.view as any).file;
            if (file && filePaths.has(file.path)) {
                leaf.detach();
            }
        }
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
        this.isManualRefresh = true; // Force refresh despite interaction
        const leaf = this.app.workspace.getLeaf('tab');
        await leaf.setViewState({
            type: 'webviewer',
            state: { url: 'about:blank', navigate: true }
        });
        this.app.workspace.revealLeaf(leaf);
    }

    /**
     * Render a virtual tab (from open note with URL property)
     * Shows cached title or URL in italics, with link icon
     */
    private renderVirtualTab(container: HTMLElement, virtualTab: VirtualTab): void {
        const tabSection = container.createDiv({ cls: 'web-sidecar-tab-entry web-sidecar-virtual-tab' });

        // Tab header - clickable to open URL in web viewer
        const tabHeader = tabSection.createDiv({ cls: 'web-sidecar-tab-header clickable' });
        tabHeader.addEventListener('click', async () => {
            const leaf = this.app.workspace.getLeaf('tab');
            await leaf.setViewState({
                type: 'webviewer',
                state: { url: virtualTab.url, navigate: true }
            });
            this.app.workspace.revealLeaf(leaf);
        });

        const domain = extractDomain(virtualTab.url);

        // Favicon (same as regular browser tabs)
        const faviconContainer = tabHeader.createDiv({ cls: 'web-sidecar-browser-favicon' });
        if (domain) {
            const favicon = faviconContainer.createEl('img', {
                attr: {
                    src: `https://www.google.com/s2/favicons?domain=${domain}&sz=32`,
                    alt: '',
                    width: '16',
                    height: '16'
                }
            });
            favicon.onerror = () => {
                faviconContainer.empty();
                setIcon(faviconContainer, 'globe');
            };
        } else {
            setIcon(faviconContainer, 'globe');
        }

        // Title - show cached title or domain, italicized if no cached title
        const tabInfo = tabHeader.createDiv({ cls: 'web-sidecar-tab-info' });
        const displayTitle = virtualTab.cachedTitle || domain || virtualTab.url;
        const hasCachedTitle = !!virtualTab.cachedTitle;
        const titleSpan = tabInfo.createEl('span', {
            text: displayTitle,
            cls: hasCachedTitle ? 'web-sidecar-tab-title web-sidecar-virtual-title' : 'web-sidecar-tab-title web-sidecar-virtual-title'
        });

        // Show note name as compact subtitle
        tabInfo.createEl('span', {
            text: virtualTab.file.basename,
            cls: 'web-sidecar-virtual-note-name'
        });
    }

    /**
     * Group tabs by URL for deduplication mode
     * Returns array of grouped tabs with count and popout info
     */
    private getGroupedTabs(): Array<{ primary: TrackedWebViewer; all: TrackedWebViewer[]; hasPopout: boolean }> {
        const groups = new Map<string, TrackedWebViewer[]>();

        for (const tab of this.trackedTabs) {
            const existing = groups.get(tab.url) || [];
            existing.push(tab);
            groups.set(tab.url, existing);
        }

        return Array.from(groups.values())
            .filter(tabs => tabs.length > 0)
            .map(tabs => ({
                primary: tabs[0]!,
                all: tabs,
                hasPopout: tabs.some(t => t.isPopout),
            }));
    }

    /**
     * Focus the next instance of a URL (cycle through duplicates)
     */
    private focusNextInstance(url: string, allTabs: TrackedWebViewer[]): void {
        if (allTabs.length === 0) return;

        const currentIndex = this.urlCycleIndex.get(url) || 0;
        const nextIndex = (currentIndex + 1) % allTabs.length;
        this.urlCycleIndex.set(url, nextIndex);

        const targetTab = allTabs[nextIndex];
        if (targetTab) {
            this.focusWebViewer(targetTab.leafId);
        }
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

    /**
     * Show context menu for a web viewer tab
     */
    private showWebViewerContextMenu(event: MouseEvent, tab: TrackedWebViewer): void {
        event.preventDefault();
        const menu = new Menu();

        // Open in new tab
        menu.addItem((item) => {
            item
                .setTitle('Open in new tab')
                .setIcon('file-plus')
                .onClick(async () => {
                    const leaf = this.app.workspace.getLeaf('tab');
                    await leaf.setViewState({
                        type: 'webviewer',
                        state: { url: tab.url, navigate: true }
                    });
                    this.app.workspace.revealLeaf(leaf);
                });
        });

        // Open in new window
        menu.addItem((item) => {
            item
                .setTitle('Open in new window')
                .setIcon('picture-in-picture-2')
                .onClick(async () => {
                    const leaf = this.app.workspace.openPopoutLeaf();
                    await leaf.setViewState({
                        type: 'webviewer',
                        state: { url: tab.url, navigate: true }
                    });
                });
        });

        // Open to the right
        menu.addItem((item) => {
            item
                .setTitle('Open to the right')
                .setIcon('separator-vertical')
                .onClick(async () => {
                    const leaf = this.app.workspace.getLeaf('split', 'vertical');
                    await leaf.setViewState({
                        type: 'webviewer',
                        state: { url: tab.url, navigate: true }
                    });
                    this.app.workspace.revealLeaf(leaf);
                });
        });

        menu.addSeparator();

        // Close web view
        menu.addItem((item) => {
            item
                .setTitle('Close web view')
                .setIcon('x')
                .onClick(() => {
                    this.closeLeaf(tab.leafId);
                });
        });

        // Close all web views for this page
        const count = this.trackedTabs.filter(t => t.url === tab.url).length;
        if (count > 1) {
            menu.addItem((item) => {
                item
                    .setTitle('Close all web views for this page')
                    .setIcon('x-circle')
                    .onClick(() => {
                        this.closeAllLeavesForUrl(tab.url);
                    });
            });
        }

        // Close linked notes
        const matches = findMatchingNotes(this.app, tab.url, this.settings);
        const hasLinkedNotes = matches.exactMatches.length > 0;

        if (hasLinkedNotes) {
            menu.addItem((item) => {
                item
                    .setTitle('Close all linked notes')
                    .setIcon('file-minus')
                    .onClick(() => {
                        this.closeLinkedNoteLeaves(tab.url);
                    });
            });
        }

        menu.addSeparator();

        // Copy URL
        menu.addItem((item) => {
            item
                .setTitle('Copy URL')
                .setIcon('copy')
                .onClick(() => {
                    navigator.clipboard.writeText(tab.url);
                });
        });

        menu.showAtMouseEvent(event);
    }

    /**
     * Show context menu for a note item
     */
    private showNoteContextMenu(event: MouseEvent, file: TFile, url: string): void {
        event.preventDefault();
        const menu = new Menu();

        // Open in new tab
        menu.addItem((item) => {
            item
                .setTitle('Open in new tab')
                .setIcon('file-plus')
                .onClick(() => {
                    const leaf = this.app.workspace.getLeaf('tab');
                    leaf.openFile(file);
                });
        });

        // Open in new window
        menu.addItem((item) => {
            item
                .setTitle('Open in new window')
                .setIcon('picture-in-picture-2')
                .onClick(() => {
                    const leaf = this.app.workspace.openPopoutLeaf();
                    leaf.openFile(file);
                });
        });

        // Open to the right
        menu.addItem((item) => {
            item
                .setTitle('Open to the right')
                .setIcon('separator-vertical')
                .onClick(() => {
                    const leaf = this.app.workspace.getLeaf('split', 'vertical');
                    leaf.openFile(file);
                });
        });

        menu.addSeparator();

        // Reveal file in navigation
        menu.addItem((item) => {
            item
                .setTitle('Reveal file in navigation')
                .setIcon('folder')
                .onClick(async () => {
                    // Open file explorer if needed and reveal file
                    const explorerLeaf = this.app.workspace.getLeavesOfType('file-explorer')[0];
                    if (explorerLeaf) {
                        this.app.workspace.revealLeaf(explorerLeaf);
                    }
                    // Use Obsidian command to reveal active file
                    const tempLeaf = this.app.workspace.getLeaf('tab');
                    await tempLeaf.openFile(file, { active: false });
                    await (this.app as any).commands.executeCommandById('file-explorer:reveal-active-file');
                    tempLeaf.detach();
                });
        });

        // Copy full path
        menu.addItem((item) => {
            item
                .setTitle('Copy full path')
                .setIcon('copy')
                .onClick(() => {
                    navigator.clipboard.writeText(file.path);
                });
        });

        menu.addSeparator();

        // Open URL in web viewer
        menu.addItem((item) => {
            item
                .setTitle('Open URL in web viewer')
                .setIcon('globe')
                .onClick(async () => {
                    const leaf = this.app.workspace.getLeaf('tab');
                    await leaf.setViewState({
                        type: 'webviewer',
                        state: { url, navigate: true }
                    });
                    this.app.workspace.revealLeaf(leaf);
                });
        });

        // Open web view + note pair
        menu.addItem((item) => {
            item
                .setTitle('Open web view + note pair')
                .setIcon('columns')
                .onClick(async () => {
                    await this.openPaired(file, url, { metaKey: false, ctrlKey: false } as MouseEvent);
                });
        });

        // Copy URL
        menu.addItem((item) => {
            item
                .setTitle('Copy URL')
                .setIcon('copy')
                .onClick(() => {
                    navigator.clipboard.writeText(url);
                });
        });

        menu.showAtMouseEvent(event);
    }


    /**
     * Render browser-style tab list with favicon + title (compact mode)
     */
    private renderBrowserModeTabList(container: HTMLElement): void {
        // Reuse header if exists
        let header = container.querySelector('.web-sidecar-browser-header') as HTMLElement;
        if (!header) {
            header = container.createDiv({ cls: 'web-sidecar-browser-header' });
            const controls = header.createDiv({ cls: 'web-sidecar-controls' });

            // Sort toggle
            const sortBtn = controls.createEl('button', {
                cls: 'web-sidecar-sort-btn clickable-icon',
                attr: {
                    'aria-label': `Sort by ${this.settings.tabSortOrder === 'focus' ? 'title' : 'recent'}`,
                    'title': `Currently: ${this.settings.tabSortOrder === 'focus' ? 'Recent first' : 'Alphabetical'}`
                }
            });
            setIcon(sortBtn, this.settings.tabSortOrder === 'focus' ? 'clock' : 'arrow-down-az');
            // Use onclick for idempotency
            sortBtn.onclick = async () => {
                this.isManualRefresh = true;
                this.settings.tabSortOrder = this.settings.tabSortOrder === 'focus' ? 'title' : 'focus';
                await this.onRefresh();
            };

            // Refresh button
            const refreshBtn = controls.createEl('button', {
                cls: 'web-sidecar-refresh-btn clickable-icon',
                attr: { 'aria-label': 'Refresh' }
            });
            setIcon(refreshBtn, 'refresh-cw');
            refreshBtn.onclick = () => {
                this.isManualRefresh = true;
                this.onRefresh();
            };
        } else {
            // Update sort icon if exists
            const sortBtn = header.querySelector('.web-sidecar-sort-btn') as HTMLElement;
            if (sortBtn) {
                sortBtn.setAttribute('aria-label', `Sort by ${this.settings.tabSortOrder === 'focus' ? 'title' : 'recent'}`);
                sortBtn.setAttribute('title', `Currently: ${this.settings.tabSortOrder === 'focus' ? 'Recent first' : 'Alphabetical'}`);
                setIcon(sortBtn, this.settings.tabSortOrder === 'focus' ? 'clock' : 'arrow-down-az');
                // Ensure onclick is fresh
                sortBtn.onclick = async () => {
                    this.isManualRefresh = true;
                    this.settings.tabSortOrder = this.settings.tabSortOrder === 'focus' ? 'title' : 'focus';
                    await this.onRefresh();
                };
            }
        }

        // Tab list container - reuse if exists
        let tabListContainer = container.querySelector('.web-sidecar-browser-tabs') as HTMLElement;
        if (!tabListContainer) {
            tabListContainer = container.createDiv({ cls: 'web-sidecar-browser-tabs' });
        }

        // --- RECONCILIATION LOGIC ---
        // Normalize groups to { primary: TrackedWebViewer, all?: TrackedWebViewer[] }
        let groups: { primary: TrackedWebViewer; all?: TrackedWebViewer[] }[];

        if (this.settings.collapseDuplicateUrls) {
            groups = this.getGroupedTabs();
        } else {
            groups = this.trackedTabs.map(t => ({ primary: t }));
        }

        // Reconciliation: Map existing grouped or single tab elements
        // Groups key: "group:<url>", Single key: "leaf:<leafId>"
        const currentElements = new Map<string, HTMLElement>();
        Array.from(tabListContainer.children).forEach((el: HTMLElement) => {
            const key = el.getAttribute('data-tab-key');
            if (key) currentElements.set(key, el);
        });

        const newKeys = new Set<string>();

        // Render each group
        for (const group of groups) {
            const firstTab = group.primary;
            // Determine key
            const key = this.settings.collapseDuplicateUrls
                ? `group:${firstTab.url}`
                : `leaf:${firstTab.leafId}`;

            newKeys.add(key);

            let tabEl = currentElements.get(key);

            if (tabEl) {
                // UPDATE existing element in place
                this.updateBrowserTab(tabEl, firstTab, group.all);
                // Ensure correct order in DOM
                tabListContainer.appendChild(tabEl);
            } else {
                // CREATE new element
                this.renderBrowserTab(tabListContainer, firstTab, group.all);
                // The render function appends it, but we need to set the key
                const newEl = tabListContainer.lastElementChild as HTMLElement;
                if (newEl) newEl.setAttribute('data-tab-key', key);
            }
        }

        // Remove old elements not in new set
        for (const [key, el] of currentElements) {
            if (!newKeys.has(key)) {
                el.remove();
            }
        }

        // Render virtual tabs (from open notes with URLs) in browser style
        // This section is currently re-rendered fully each time.
        let virtualSection = container.querySelector('.web-sidecar-virtual-section') as HTMLElement;
        if (this.virtualTabs.length > 0) {
            if (!virtualSection) {
                virtualSection = container.createDiv({ cls: 'web-sidecar-virtual-section' });
            } else {
                virtualSection.empty(); // Clear existing content for full re-render
            }
            virtualSection.createEl('h5', { text: 'Open Notes with URLs', cls: 'web-sidecar-section-title' });
            for (const virtualTab of this.virtualTabs) {
                this.renderVirtualTab(virtualSection, virtualTab);
            }
        } else if (virtualSection) {
            virtualSection.remove(); // Remove section if no virtual tabs
        }


        // "+ New Tab" button (always visible, above Recent web notes)

        // "Recent web notes" collapsible section at bottom
        this.renderRecentWebNotesSection(container);
    }

    /**
     * Render the collapsible "Recent web notes" section
     */
    private renderRecentWebNotesSection(container: HTMLElement): void {
        const recentNotes = getRecentNotesWithUrls(
            this.app,
            this.settings,
            this.settings.recentNotesCount
        );

        if (recentNotes.length === 0) return;

        const details = container.createEl('details', { cls: 'web-sidecar-recent-section' });
        const summary = details.createEl('summary', { cls: 'web-sidecar-recent-summary' });
        const summaryIcon = summary.createSpan({ cls: 'web-sidecar-recent-icon' });
        setIcon(summaryIcon, 'history');
        summary.createSpan({ text: `Recent web notes (${recentNotes.length})` });

        const list = details.createEl('ul', { cls: 'web-sidecar-list web-sidecar-recent-list' });

        for (const note of recentNotes) {
            this.renderNoteItem(list, note.file, note.url);
        }

        // Add domain grouping section below
        this.renderDomainGroupingSection(container);
        // Add subreddit explorer section below that
        this.renderSubredditExplorerSection(container);
    }

    /**
     * Render "Subreddit notes explorer" collapsible section
     */
    private renderSubredditExplorerSection(container: HTMLElement): void {
        if (!this.settings.enableSubredditExplorer) return;

        const subredditMap = getAllRedditNotes(this.app, this.settings);
        if (subredditMap.size === 0) return;

        const details = container.createEl('details', { cls: 'web-sidecar-domain-section' });
        // Preserve open state
        if (this.isSubredditExplorerOpen) {
            details.setAttribute('open', '');
        }
        details.addEventListener('toggle', () => {
            this.isSubredditExplorerOpen = details.hasAttribute('open');
        });

        const summary = details.createEl('summary', { cls: 'web-sidecar-domain-summary' });
        const summaryIcon = summary.createSpan({ cls: 'web-sidecar-domain-icon' });

        // Reddit favicon for the main explorer group
        const favicon = summaryIcon.createEl('img', {
            cls: 'web-sidecar-favicon-small',
            attr: {
                src: `https://www.google.com/s2/favicons?domain=reddit.com&sz=16`,
                alt: 'Reddit',
                width: '14',
                height: '14'
            }
        });

        summary.createSpan({ text: `Subreddit notes explorer (${subredditMap.size})` });

        // Sort button
        const sortBtn = summary.createEl('button', {
            cls: 'web-sidecar-sort-btn-tiny clickable-icon',
            attr: {
                'aria-label': `Sort by ${this.subredditSort === 'alpha' ? 'count' : 'name'}`,
            }
        });
        sortBtn.style.marginLeft = 'auto'; // Align to right
        setIcon(sortBtn, this.subredditSort === 'alpha' ? 'arrow-down-wide-narrow' : 'arrow-down-az');

        // Prevent summary expansion when clicking sort
        sortBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.subredditSort = this.subredditSort === 'alpha' ? 'count' : 'alpha';
            this.render(); // Re-render to sort
        };

        const groupList = details.createDiv({ cls: 'web-sidecar-domain-list' });

        // Sort subreddits
        const sortedSubreddits = Array.from(subredditMap.entries()).sort((a, b) => {
            if (this.subredditSort === 'count') {
                const countDiff = b[1].length - a[1].length;
                if (countDiff !== 0) return countDiff;
            }
            return a[0].localeCompare(b[0]);
        });

        for (const [subreddit, notes] of sortedSubreddits) {
            this.renderSubredditGroup(groupList, subreddit, notes);
        }
    }

    /**
     * Render a single subreddit group
     */
    private renderSubredditGroup(container: HTMLElement, subreddit: string, notes: import('../types').MatchedNote[]): void {
        const details = container.createEl('details', { cls: 'web-sidecar-domain-group' });
        const summary = details.createEl('summary', { cls: 'web-sidecar-domain-row' });

        // Reuse domain group styling
        const faviconContainer = summary.createDiv({ cls: 'web-sidecar-domain-favicon' });
        faviconContainer.createEl('img', {
            attr: {
                src: `https://www.google.com/s2/favicons?domain=reddit.com&sz=16`,
                alt: '',
                width: '14',
                height: '14'
            }
        });

        summary.createSpan({ text: subreddit, cls: 'web-sidecar-domain-name' });

        summary.createSpan({
            text: notes.length.toString(),
            cls: 'web-sidecar-domain-count',
            attr: {
                'title': notes.length === 1 ? '1 Note' : `${notes.length} Notes`
            }
        });

        const notesList = details.createEl('ul', { cls: 'web-sidecar-list web-sidecar-domain-notes' });
        for (const note of notes) {
            this.renderNoteItem(notesList, note.file, note.url);
        }
    }

    /**
     * Render "Web notes grouped by domain" collapsible section
     */
    private renderDomainGroupingSection(container: HTMLElement): void {
        const recentNotes = getRecentNotesWithUrls(
            this.app,
            this.settings,
            100 // Get more notes for domain grouping
        );

        if (recentNotes.length === 0) return;

        // Group notes by domain
        const domainMap = new Map<string, { notes: typeof recentNotes, domain: string }>();
        for (const note of recentNotes) {
            const domain = extractDomain(note.url);
            if (!domain) continue;
            if (!domainMap.has(domain)) {
                domainMap.set(domain, { notes: [], domain });
            }
            domainMap.get(domain)!.notes.push(note);
        }

        // Only show if we have domains
        if (domainMap.size === 0) return;

        const details = container.createEl('details', { cls: 'web-sidecar-domain-section' });
        // Preserve open state
        if (this.isDomainGroupOpen) {
            details.setAttribute('open', '');
        }
        details.addEventListener('toggle', () => {
            this.isDomainGroupOpen = details.hasAttribute('open');
        });

        const summary = details.createEl('summary', { cls: 'web-sidecar-domain-summary' });
        const summaryIcon = summary.createSpan({ cls: 'web-sidecar-domain-icon' });
        setIcon(summaryIcon, 'globe');
        summary.createSpan({ text: `Web notes grouped by domain (${domainMap.size})` });

        // Sort button
        const sortBtn = summary.createEl('button', {
            cls: 'web-sidecar-sort-btn-tiny clickable-icon',
            attr: {
                'aria-label': `Sort by ${this.domainSort === 'alpha' ? 'count' : 'name'}`,
            }
        });
        sortBtn.style.marginLeft = 'auto'; // Align to right
        setIcon(sortBtn, this.domainSort === 'alpha' ? 'arrow-down-wide-narrow' : 'arrow-down-az');

        // Prevent summary expansion when clicking sort
        sortBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.domainSort = this.domainSort === 'alpha' ? 'count' : 'alpha';
            this.render(); // Re-render to sort
        };

        const domainList = details.createDiv({ cls: 'web-sidecar-domain-list' });

        // Sort domains
        const sortedDomains = Array.from(domainMap.entries()).sort((a, b) => {
            if (this.domainSort === 'count') {
                const countDiff = b[1].notes.length - a[1].notes.length;
                if (countDiff !== 0) return countDiff;
            }
            return a[0].localeCompare(b[0]);
        });

        for (const [domain, data] of sortedDomains) {
            this.renderDomainGroup(domainList, domain, data.notes);
        }
    }

    /**
     * Render a single domain group (expandable)
     */
    private renderDomainGroup(container: HTMLElement, domain: string, notes: ReturnType<typeof getRecentNotesWithUrls>): void {
        const domainDetails = container.createEl('details', { cls: 'web-sidecar-domain-group' });
        const domainSummary = domainDetails.createEl('summary', { cls: 'web-sidecar-domain-row' });

        // Favicon
        const faviconContainer = domainSummary.createDiv({ cls: 'web-sidecar-domain-favicon' });
        const favicon = faviconContainer.createEl('img', {
            attr: {
                src: `https://www.google.com/s2/favicons?domain=${domain}&sz=32`,
                alt: '',
                width: '14',
                height: '14'
            }
        });
        favicon.onerror = () => {
            faviconContainer.empty();
            setIcon(faviconContainer, 'globe');
        };

        // Domain name
        domainSummary.createSpan({ text: domain, cls: 'web-sidecar-domain-name' });

        // Note count badge
        domainSummary.createSpan({
            text: notes.length.toString(),
            cls: 'web-sidecar-domain-count',
            attr: {
                'title': notes.length === 1 ? '1 Note' : `${notes.length} Notes`
            }
        });

        // Notes list
        const notesList = domainDetails.createEl('ul', { cls: 'web-sidecar-list web-sidecar-domain-notes' });
        for (const note of notes) {
            this.renderNoteItem(notesList, note.file, note.url);
        }
    }

    /**
     * Render a single browser-style tab (compact: favicon + title, expandable notes)
     * @param allTabs - When in deduplication mode, all tabs with same URL for cycle-click
     * 
     * TODO: Fix the visual flash for default icons by optimizing favicon re-rendering.
     */
    private renderBrowserTab(container: HTMLElement, tab: TrackedWebViewer, allTabs?: TrackedWebViewer[]): void {
        // Create wrapper
        const tabWrapper = container.createDiv({ cls: 'web-sidecar-browser-tab' });
        const isDeduped = allTabs && allTabs.length > 1;

        // Main tab row (favicon + title + expand toggle)
        const tabRow = tabWrapper.createDiv({ cls: 'web-sidecar-browser-tab-row' });

        // Use onclick for easier updates
        tabRow.onclick = (e) => {
            // Don't trigger if clicking expand button
            if ((e.target as HTMLElement).closest('.web-sidecar-expand-btn')) return;
            if (isDeduped && allTabs) {
                this.focusNextInstance(tab.url, allTabs);
            } else {
                this.focusWebViewer(tab.leafId);
            }
        };
        tabRow.oncontextmenu = (e) => this.showWebViewerContextMenu(e, tab);

        const domain = extractDomain(tab.url);

        // Favicon
        const faviconContainer = tabRow.createDiv({ cls: 'web-sidecar-browser-favicon' });
        if (domain) {
            const favicon = faviconContainer.createEl('img', {
                attr: {
                    src: `https://www.google.com/s2/favicons?domain=${domain}&sz=32`,
                    alt: '',
                    width: '16',
                    height: '16'
                }
            });
            favicon.onerror = () => {
                faviconContainer.empty();
                setIcon(faviconContainer, 'globe');
            };
        } else {
            setIcon(faviconContainer, 'globe');
        }

        // Title only (no URL in browser mode)
        const titleSpan = tabRow.createSpan({
            text: tab.title || domain || 'Untitled',
            cls: 'web-sidecar-browser-tab-title'
        });

        // Find matches for expansion
        const matches = findMatchingNotes(this.app, tab.url, this.settings);
        const exactCount = matches.exactMatches.length;
        const hasSameDomain = this.settings.enableTldSearch && matches.tldMatches.length > 0;

        // Pop-out icon (positioned before note count badge, right-aligned)
        const showPopout = isDeduped ? allTabs!.some(t => t.isPopout) : tab.isPopout;
        if (showPopout) {
            const popoutIcon = tabRow.createSpan({ cls: 'web-sidecar-popout-icon' });
            setIcon(popoutIcon, 'picture-in-picture-2');
            popoutIcon.setAttribute('aria-label', 'In popout window');
            popoutIcon.setAttribute('title', 'In popout window');
        }

        // Tab count badge (for deduplicated URLs, before note count)
        if (isDeduped && allTabs) {
            tabRow.createSpan({
                text: `${allTabs.length}`,
                cls: 'web-sidecar-tab-count-badge',
                attr: {
                    'aria-label': `${allTabs.length} tabs`,
                    'title': `${allTabs.length} tabs open (click to cycle)`
                }
            });
        }

        // Note count badge (only show if 1+ exact matches)
        if (exactCount > 0) {
            const badge = tabRow.createSpan({
                text: exactCount.toString(),
                cls: 'web-sidecar-note-count-badge',
                attr: {
                    'aria-label': exactCount === 1 ? '1 Note' : `${exactCount} Notes`,
                    'title': exactCount === 1 ? '1 Note' : `${exactCount} Notes`
                }
            });
        }

        // If NO exact matches, show New Note button directly on row
        if (exactCount === 0) {
            const newNoteBtn = tabRow.createDiv({ cls: 'web-sidecar-inline-new-note clickable-icon' });
            setIcon(newNoteBtn, 'file-plus');
            newNoteBtn.setAttribute('aria-label', 'New Note');
            newNoteBtn.setAttribute('title', 'New Note');
            newNoteBtn.onclick = (e) => {
                e.stopPropagation();
                this.openCreateNoteModal(tab.url);
            };
        }

        // Show expand button only if there's content to expand (exact matches OR same domain)
        if (exactCount > 0 || hasSameDomain) {
            const expandBtn = tabRow.createDiv({ cls: 'web-sidecar-expand-btn clickable-icon' });
            setIcon(expandBtn, 'chevron-right');

            // Notes container (collapsed by default)
            const notesContainer = tabWrapper.createDiv({ cls: 'web-sidecar-browser-notes hidden' });

            expandBtn.onclick = (e) => {
                e.stopPropagation();
                const isExpanded = !notesContainer.hasClass('hidden');
                notesContainer.toggleClass('hidden', isExpanded);
                expandBtn.empty();
                setIcon(expandBtn, isExpanded ? 'chevron-right' : 'chevron-down');

                // Render notes on first expand
                if (!isExpanded && notesContainer.children.length === 0) {
                    this.renderBrowserTabNotes(notesContainer, tab.url, matches);
                }
            };
        }
    }

    /**
     * Render notes inside an expanded browser tab
     * Order: Exact matches → New Note button → Same domain notes
     */
    private renderBrowserTabNotes(container: HTMLElement, url: string, matches: import('../types').MatchResult): void {
        // 1. Exact matches first
        if (matches.exactMatches.length > 0) {
            const exactList = container.createEl('ul', { cls: 'web-sidecar-browser-note-list' });
            for (const match of matches.exactMatches) {
                const li = exactList.createEl('li');
                const link = li.createEl('a', {
                    text: match.file.basename,
                    cls: 'web-sidecar-browser-note-link',
                    attr: { href: '#' }
                });
                link.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.openNoteSmartly(match.file, e);
                });
                link.addEventListener('contextmenu', (e) => this.showNoteContextMenu(e, match.file, match.url));
            }
        }

        // 2. New Note button (always show)
        const newNoteBtn = container.createDiv({ cls: 'web-sidecar-new-note-btn' });
        const noteIcon = newNoteBtn.createSpan({ cls: 'web-sidecar-new-note-icon' });
        setIcon(noteIcon, 'file-plus');
        newNoteBtn.createSpan({ text: 'New Note', cls: 'web-sidecar-new-note-text' });
        newNoteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.openCreateNoteModal(url);
        });

        // 3. TLD matches (collapsible with new label) - after New Note
        if (this.settings.enableTldSearch && matches.tldMatches.length > 0) {
            const details = container.createEl('details', { cls: 'web-sidecar-browser-tld' });
            const summary = details.createEl('summary');
            const expandIcon = summary.createSpan({ cls: 'web-sidecar-tld-icon' });
            setIcon(expandIcon, 'folder-open');

            // Dynamic header text based on subreddit filter
            let headerText = `More notes from this domain (${matches.tldMatches.length})`;
            if (this.settings.enableSubredditFilter) {
                const subreddit = extractSubreddit(url);
                if (subreddit) {
                    headerText = `More notes from ${subreddit} (${matches.tldMatches.length})`;
                }
            }

            summary.createSpan({ text: headerText });

            const tldList = details.createEl('ul', { cls: 'web-sidecar-browser-note-list' });
            for (const match of matches.tldMatches) {
                const li = tldList.createEl('li');
                const link = li.createEl('a', {
                    text: match.file.basename,
                    cls: 'web-sidecar-browser-note-link',
                    attr: { href: '#' }
                });
                link.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.openNoteSmartly(match.file, e);
                });
                link.addEventListener('contextmenu', (e) => this.showNoteContextMenu(e, match.file, match.url));
            }
        }
    }

    /**
     * Update an existing browser tab element in place
     */
    private updateBrowserTab(tabWrapper: HTMLElement, tab: TrackedWebViewer, allTabs?: TrackedWebViewer[]): void {
        const isDeduped = allTabs && allTabs.length > 1;

        const tabRow = tabWrapper.querySelector('.web-sidecar-browser-tab-row') as HTMLElement;
        if (!tabRow) return;

        // Update handlers
        tabRow.onclick = (e) => {
            // ... (click logic same as render) ...
            if ((e.target as HTMLElement).closest('.web-sidecar-expand-btn')) return;
            if (isDeduped && allTabs) {
                this.focusNextInstance(tab.url, allTabs);
            } else {
                this.focusWebViewer(tab.leafId);
            }
        };
        tabRow.oncontextmenu = (e) => this.showWebViewerContextMenu(e, tab);

        const domain = extractDomain(tab.url);

        // Update Title - simple text updates
        const titleSpan = tabRow.querySelector('.web-sidecar-browser-tab-title');
        if (titleSpan) titleSpan.textContent = tab.title || domain || 'Untitled';

        // Update Tab Count Badge
        let tabBadge = tabRow.querySelector('.web-sidecar-tab-count-badge');
        if (isDeduped && allTabs) {
            const text = `${allTabs.length}`;
            if (!tabBadge) {
                // Create if missing (rare case: transitioned from 1 to 2 tabs)
                // Need to insert before other elements... tricky.
                // For now, let's just assume if structure changes drastically, we handle it or just append.
                // Simplification: if structural change (1->2), maybe just re-render is easier?
                // But we want to avoid flash.
                // To handle this properly: 
                // If structure differs significantly, we might want to just re-render content of row?
                // But that flashes icons.
                // The "globe" icon is stable if we don't touch it.
                // Let's just create the badge if it's missing.
                tabBadge = tabRow.createSpan({ cls: 'web-sidecar-tab-count-badge' });
                // Insert before note count or new note button?
                // Simple append for now: layout is flex.
            }
            tabBadge.textContent = text;
            tabBadge.setAttribute('aria-label', `${allTabs.length} tabs`);
            tabBadge.setAttribute('title', `${allTabs.length} tabs open (click to cycle)`);
        } else if (tabBadge) {
            tabBadge.remove();
        }

        // NOTE: We INTENTIONALLY skip updating favicon to avoid flashing.
        // It should match the URL which is the key, so it shouldn't change.

        // Update Note Count
        const matches = findMatchingNotes(this.app, tab.url, this.settings);
        const exactCount = matches.exactMatches.length;

        let noteBadge = tabRow.querySelector('.web-sidecar-note-count-badge');
        if (exactCount > 0) {
            if (!noteBadge) {
                noteBadge = tabRow.createSpan({ cls: 'web-sidecar-note-count-badge' });
            }
            noteBadge.textContent = exactCount.toString();
            noteBadge.setAttribute('aria-label', exactCount === 1 ? '1 Note' : `${exactCount} Notes`);
            noteBadge.setAttribute('title', exactCount === 1 ? '1 Note' : `${exactCount} Notes`);
        } else if (noteBadge) {
            noteBadge.remove();
        }

        // Update expansion data
        // We can re-check existing expanded sections content? 
        // For now, we leave the expanded content as is unless user collapses/expands.
        // If content *changes* inside (e.g. new note linked), we might miss it here.
        // User asked for "refresh" to fix this.
        // If we want to be perfect, we should update the expanded content too.
        // But the main goal is "icon flashing".
        // Let's settle for updating header metadata for now.
    }
}

