
import { ItemView, WorkspaceLeaf, TFile, setIcon } from 'obsidian';
import type { WebSidecarSettings, TrackedWebViewer, VirtualTab, IWebSidecarView } from '../types';
import { ContextMenus } from './components/ContextMenus';
import { NoteRenderer } from './components/NoteRenderer';
import { SectionRenderer } from './components/SectionRenderer';
import { TabListRenderer } from './components/tabs/TabListRenderer';
import { BrowserTabRenderer } from './components/tabs/BrowserTabRenderer';
import { NavigationService } from '../services/NavigationService';
import type { UrlIndex } from '../services/UrlIndex';

export const VIEW_TYPE_WEB_SIDECAR = 'web-sidecar-view';

/**
 * Sidebar view for Web Sidecar plugin
 */
export class WebSidecarView extends ItemView implements IWebSidecarView {
    // Interface implementation properties
    settings: WebSidecarSettings;
    subredditSort: 'alpha' | 'count' = 'alpha';
    domainSort: 'alpha' | 'count' = 'alpha';
    isSubredditExplorerOpen: boolean = false;
    isDomainGroupOpen: boolean = false;
    isRecentNotesOpen: boolean = false;
    expandedGroupIds: Set<string> = new Set();
    isManualRefresh: boolean = false;
    urlIndex: UrlIndex;

    // Private properties
    private trackedTabs: TrackedWebViewer[] = [];
    private virtualTabs: VirtualTab[] = [];
    private getSettingsFn: () => WebSidecarSettings;
    private onRefreshFn: () => void;
    private getTabsFn: () => TrackedWebViewer[];
    private getVirtualTabsFn: () => VirtualTab[];
    private saveSettingsFn: () => Promise<void>;

    // Services & Components
    private navigationService: NavigationService;
    private contextMenus: ContextMenus;
    private noteRenderer: NoteRenderer;
    private sectionRenderer: SectionRenderer;
    private tabListRenderer: TabListRenderer;
    private browserTabRenderer: BrowserTabRenderer;

    /** Track if user is interacting with the sidebar (prevents re-render) */
    private isInteracting: boolean = false;

    /** Track expand state for toggle */
    private allExpanded: boolean = false;

    /** Reference to sort button for dynamic updates */
    private sortBtn: HTMLElement | null = null;

    constructor(
        leaf: WorkspaceLeaf,
        getSettings: () => WebSidecarSettings,
        onRefresh: () => void,
        getTabs: () => TrackedWebViewer[],
        getVirtualTabs: () => VirtualTab[],
        urlIndex: UrlIndex,
        saveSettings: () => Promise<void>
    ) {
        super(leaf);
        this.getSettingsFn = getSettings;
        this.onRefreshFn = onRefresh;
        this.getTabsFn = getTabs;
        this.getVirtualTabsFn = getVirtualTabs;
        this.saveSettingsFn = saveSettings;
        this.settings = getSettings();
        this.urlIndex = urlIndex;

        // Initialize Service
        this.navigationService = new NavigationService(
            this.app,
            getSettings,
            urlIndex,
            (val) => { this.isManualRefresh = val; },
            onRefresh
        );

        // Initialize components
        this.contextMenus = new ContextMenus(this);
        this.noteRenderer = new NoteRenderer(this, this.contextMenus);
        this.sectionRenderer = new SectionRenderer(this, this.noteRenderer);
        this.tabListRenderer = new TabListRenderer(this, this.contextMenus, this.noteRenderer, this.sectionRenderer);
        this.browserTabRenderer = new BrowserTabRenderer(this, this.contextMenus, this.noteRenderer, this.sectionRenderer);
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
        this.settings = this.getSettingsFn();
        this.trackedTabs = this.getTabsFn();
        this.virtualTabs = this.getVirtualTabsFn();

        // Create nav-header toolbar
        this.createNavHeader();

        this.render();

        // Listen for active leaf changes to update "active" highlighting immediately
        this.registerEvent(
            this.app.workspace.on('active-leaf-change', (leaf) => {
                // Track last active non-sidecar leaf
                if (leaf && leaf !== this.leaf) {
                    this.lastActiveLeaf = leaf;
                }

                // Should not re-render if the sidecar itself became active, 
                // as this happens on mousedown and destroying DOM prevents 'click' events
                if (leaf === this.leaf) return;
                this.render(true);
            })
        );
    }

    // Track the last active leaf that wasn't this sidecar
    public lastActiveLeaf: WorkspaceLeaf | null = null;

    async onClose(): Promise<void> {
        // Cleanup
    }

    /**
     * Create navigation header with action buttons as its own row
     * Structure: nav-header > nav-buttons-container > nav-action-button
     * nav-header is SIBLING of contentEl (view-content), not a child
     */
    private createNavHeader(): void {
        // Check if our nav-header already exists at containerEl level
        if (this.containerEl.querySelector(':scope > .nav-header.web-sidecar-toolbar')) return;

        // contentEl is view-content, we insert nav-header BEFORE it as sibling
        const contentEl = this.contentEl;
        if (!contentEl) return;

        // Create nav-header
        const navHeader = createDiv({ cls: 'nav-header web-sidecar-toolbar' });
        const buttonContainer = navHeader.createDiv({ cls: 'nav-buttons-container' });

        // New Web Viewer button (leftmost)
        const newViewerBtn = buttonContainer.createEl('div', {
            cls: 'clickable-icon nav-action-button',
            attr: { 'aria-label': 'New web viewer' }
        });
        setIcon(newViewerBtn, 'plus');
        newViewerBtn.onclick = () => this.openNewWebViewer();

        // Expand/Collapse button
        const expandBtn = buttonContainer.createEl('div', {
            cls: 'clickable-icon nav-action-button',
            attr: { 'aria-label': 'Expand all' }
        });
        setIcon(expandBtn, 'unfold-vertical');
        expandBtn.onclick = () => this.handleExpandToggle(expandBtn);

        // Sort button - cycles through: focus -> title -> manual -> focus
        const getSortIcon = (order: string) => {
            switch (order) {
                case 'focus': return 'clock';
                case 'title': return 'arrow-down-az';
                case 'manual': return 'grip-vertical';
                default: return 'clock';
            }
        };
        const getNextSortLabel = (order: string) => {
            switch (order) {
                case 'focus': return 'Sort by title';
                case 'title': return 'Sort manually';
                case 'manual': return 'Sort by recent';
                default: return 'Sort by title';
            }
        };
        const getNextSortOrder = (order: string): 'focus' | 'title' | 'manual' => {
            switch (order) {
                case 'focus': return 'title';
                case 'title': return 'manual';
                case 'manual': return 'focus';
                default: return 'title';
            }
        };

        this.sortBtn = buttonContainer.createEl('div', {
            cls: 'clickable-icon nav-action-button',
            attr: { 'aria-label': getNextSortLabel(this.settings.tabSortOrder) }
        });
        setIcon(this.sortBtn, getSortIcon(this.settings.tabSortOrder));
        this.sortBtn.onclick = async () => {
            this.isManualRefresh = true;
            const newOrder = getNextSortOrder(this.settings.tabSortOrder);
            this.settings.tabSortOrder = newOrder;

            // ALWAYS capture current visual order when entering manual mode
            if (newOrder === 'manual') {
                this.settings.manualTabOrder = this.trackedTabs.map(t => t.leafId);
            }

            this.updateSortButtonIcon();
            await this.saveSettingsFn();
        };

        // Refresh button
        const refreshBtn = buttonContainer.createEl('div', {
            cls: 'clickable-icon nav-action-button',
            attr: { 'aria-label': 'Refresh' }
        });
        setIcon(refreshBtn, 'refresh-cw');
        refreshBtn.onclick = () => {
            this.isManualRefresh = true;
            this.onRefresh();
        };

        // Insert nav-header into containerEl BEFORE contentEl (making it a sibling)
        this.containerEl.insertBefore(navHeader, contentEl);
    }

    private handleExpandToggle(btn: HTMLElement): void {
        this.allExpanded = !this.allExpanded;

        // Use contentEl directly (not children[1] which may be nav-header)
        const contentEl = this.contentEl;
        if (!contentEl) return;

        // Update button icon
        setIcon(btn, this.allExpanded ? 'fold-vertical' : 'unfold-vertical');
        btn.setAttribute('aria-label', this.allExpanded ? 'Collapse all' : 'Expand all');

        // Toggle tab notes containers
        contentEl.querySelectorAll('.web-sidecar-browser-notes').forEach(el => {
            if (this.allExpanded) {
                el.removeClass('hidden');
            } else {
                el.addClass('hidden');
            }
        });

        // Toggle expand button icons
        contentEl.querySelectorAll('.web-sidecar-expand-btn').forEach(expandBtn => {
            expandBtn.empty();
            setIcon(expandBtn as HTMLElement, this.allExpanded ? 'chevron-down' : 'chevron-right');
        });

        // Toggle all details sections
        contentEl.querySelectorAll('details').forEach(details => {
            if (this.allExpanded) {
                details.setAttribute('open', '');
            } else {
                details.removeAttribute('open');
            }
        });

        // Update state tracking
        this.setRecentNotesOpen(this.allExpanded);
        this.setDomainGroupOpen(this.allExpanded);
        this.setSubredditExplorerOpen(this.allExpanded);

        // Force re-render to populate content
        this.isManualRefresh = true;
        this.onRefresh();
    }

    /**
     * Update the sort button icon to reflect current tabSortOrder
     * Called when sort mode changes (either via button click or drag-drop)
     */
    private updateSortButtonIcon(): void {
        if (!this.sortBtn) return;

        const getSortIcon = (order: string) => {
            switch (order) {
                case 'focus': return 'clock';
                case 'title': return 'arrow-down-az';
                case 'manual': return 'grip-vertical';
                default: return 'clock';
            }
        };
        const getNextSortLabel = (order: string) => {
            switch (order) {
                case 'focus': return 'Sort by title';
                case 'title': return 'Sort manually';
                case 'manual': return 'Sort by recent';
                default: return 'Sort by title';
            }
        };

        setIcon(this.sortBtn, getSortIcon(this.settings.tabSortOrder));
        this.sortBtn.setAttribute('aria-label', getNextSortLabel(this.settings.tabSortOrder));
    }

    // Interface implementation methods
    setSubredditSort(sort: 'alpha' | 'count'): void {
        this.subredditSort = sort;
    }

    setDomainSort(sort: 'alpha' | 'count'): void {
        this.domainSort = sort;
    }

    setSubredditExplorerOpen(open: boolean): void {
        this.isSubredditExplorerOpen = open;
        this.onRefresh();
    }

    setDomainGroupOpen(open: boolean): void {
        this.isDomainGroupOpen = open;
        this.onRefresh();
    }

    setRecentNotesOpen(open: boolean): void {
        this.isRecentNotesOpen = open;
        // No auto-refresh needed here, as it's just state tracking for next render
    }

    setGroupExpanded(id: string, expanded: boolean): void {
        if (expanded) {
            this.expandedGroupIds.add(id);
        } else {
            this.expandedGroupIds.delete(id);
        }
        // No auto-refresh needed here
    }

    setManualRefresh(manual: boolean): void {
        this.isManualRefresh = manual;
    }

    toggleSubredditExplorer(): void {
        this.setSubredditExplorerOpen(!this.isSubredditExplorerOpen);
    }

    toggleDomainGroup(): void {
        this.setDomainGroupOpen(!this.isDomainGroupOpen);
    }

    updateTabs(trackedTabs: TrackedWebViewer[], virtualTabs: VirtualTab[]): void {
        this.trackedTabs = trackedTabs;
        this.virtualTabs = virtualTabs;
        this.render();
    }

    onRefresh(): void {
        this.onRefreshFn();
    }

    // Delegation to NavigationService
    focusNextInstance(url: string, allTabs: TrackedWebViewer[]): void {
        this.navigationService.focusNextInstance(url, allTabs);
    }

    focusNextNoteInstance(filePath: string): void {
        this.navigationService.focusNextNoteInstance(filePath);
    }

    async openNoteSmartly(file: TFile, e: MouseEvent | KeyboardEvent): Promise<void> {
        await this.navigationService.openNoteSmartly(file, e);
    }

    async openUrlSmartly(url: string, e: MouseEvent): Promise<void> {
        await this.navigationService.openUrlSmartly(url, e);
    }

    async openNewWebViewer(): Promise<void> {
        await this.navigationService.openNewWebViewer();
    }

    async saveManualTabOrder(orderedLeafIds: string[]): Promise<void> {
        this.settings.manualTabOrder = orderedLeafIds;
        await this.saveSettingsFn();
    }

    handleTabDrop(draggedLeafId: string, targetLeafId: string): void {
        // Auto-switch to manual mode if not already
        if (this.settings.tabSortOrder !== 'manual') {
            this.settings.tabSortOrder = 'manual';
            // Update the nav-header icon to show we're in manual mode
            this.updateSortButtonIcon();
        }

        // Initialize order from current visible order if empty
        let currentOrder = [...this.settings.manualTabOrder];
        if (currentOrder.length === 0) {
            currentOrder = this.trackedTabs.map(t => t.leafId);
        }

        // Remove dragged item
        const draggedIdx = currentOrder.indexOf(draggedLeafId);
        if (draggedIdx > -1) {
            currentOrder.splice(draggedIdx, 1);
        } else {
            // If dragged item not in order yet, it's a new tab - add it
        }

        // Insert before target
        const targetIdx = currentOrder.indexOf(targetLeafId);
        if (targetIdx > -1) {
            currentOrder.splice(targetIdx, 0, draggedLeafId);
        } else {
            currentOrder.push(draggedLeafId);
        }

        // CRITICAL: Force re-render even if user is interacting
        this.isManualRefresh = true;
        this.saveManualTabOrder(currentOrder);
    }

    openCreateNoteModal(url: string): void {
        this.navigationService.openCreateNoteModal(url);
    }

    async openPaired(file: TFile, url: string, e: MouseEvent): Promise<void> {
        await this.navigationService.openPaired(file, url, e);
    }

    closeLeaf(leafId: string): void {
        this.navigationService.closeLeaf(leafId);
    }

    closeAllLeavesForUrl(url: string): void {
        this.navigationService.closeAllLeavesForUrl(url);
    }

    closeLinkedNoteLeaves(url: string): void {
        this.navigationService.closeLinkedNoteLeaves(url);
    }

    focusWebViewer(leafId: string): void {
        this.navigationService.focusWebViewer(leafId);
    }

    focusTab(tab: TrackedWebViewer): void {
        this.navigationService.focusTab(tab);
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
    render(force?: boolean): void {
        // Use contentEl (view-content) directly, not children[1] which may be nav-header
        const container = this.contentEl;

        // Prevent re-rendering while user is interacting, unless forced
        if (this.isInteracting && !this.isManualRefresh && !force) {
            return;
        }
        this.isManualRefresh = false;

        container.addClass('web-sidecar-container');

        // Track mode changes
        const wasBrowserMode = container.hasClass('web-sidecar-browser-mode');
        const isBrowserMode = this.settings.tabAppearance === 'browser';
        const modeChanged = wasBrowserMode !== isBrowserMode;

        // Add mode-specific class
        container.removeClass('web-sidecar-notes-mode', 'web-sidecar-browser-mode');
        container.addClass(isBrowserMode
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

        // Only empty container when:
        // 1. Mode changed
        // 2. No content (empty state)
        // 3. Notes mode (doesn't have DOM reconciliation)
        // Browser mode with content uses DOM reconciliation to preserve expanded states
        if (modeChanged || !hasContent || !isBrowserMode) {
            container.empty();
        }

        // Ensure nav-header buttons exist in view-header (not affected by container.empty)
        this.createNavHeader();

        if (!hasContent) {
            this.sectionRenderer.renderEmptyState(container);
        } else if (isBrowserMode) {
            this.browserTabRenderer.renderBrowserModeTabList(container, this.trackedTabs, this.virtualTabs);
        } else {
            this.tabListRenderer.renderTabList(container, this.trackedTabs, this.virtualTabs);
        }
    }
}
