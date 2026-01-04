

import { ItemView, WorkspaceLeaf, TFile, setIcon } from 'obsidian';
import type { WebSidecarSettings, TrackedWebViewer, VirtualTab, IWebSidecarView } from '../types';
import { ContextMenus } from './components/ContextMenus';
import { NoteRenderer } from './components/NoteRenderer';
import { SectionRenderer } from './components/SectionRenderer';
import { TabListRenderer } from './components/tabs/TabListRenderer';
import { BrowserTabRenderer } from './components/tabs/BrowserTabRenderer';
import { PinnedTabRenderer } from './components/tabs/PinnedTabRenderer';
import { NavigationService } from '../services/NavigationService';
import { TabStateService } from '../services/TabStateService';
import { UrlIndex } from '../services/UrlIndex';

export const VIEW_TYPE_WEB_SIDECAR = 'web-sidecar-view';

/**
 * Sidebar view for Web Sidecar plugin
 */
export class WebSidecarView extends ItemView implements IWebSidecarView {
    // Interface implementation properties
    settings: WebSidecarSettings;
    subredditSort: 'alpha' | 'count' = 'alpha';
    domainSort: 'alpha' | 'count' | 'recent' = 'alpha';
    tagSort: 'alpha' | 'count' | 'recent' = 'alpha';
    selectedTagSort: 'alpha' | 'count' | 'recent' = 'alpha';
    isSubredditExplorerOpen: boolean = false;
    isDomainGroupOpen: boolean = false;
    isRecentNotesOpen: boolean = false;
    isTagGroupOpen: boolean = false;
    isSelectedTagGroupOpen: boolean = false;
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

    // Services & Components
    private navigationService: NavigationService;
    private contextMenus: ContextMenus;
    private noteRenderer: NoteRenderer;
    private sectionRenderer: SectionRenderer;
    private tabListRenderer: TabListRenderer;
    private browserTabRenderer: BrowserTabRenderer;
    private pinnedTabRenderer: PinnedTabRenderer;
    private tabStateService: TabStateService;
    public saveSettingsFn: () => Promise<void>;

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
        tabStateService: TabStateService,
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
        this.tabStateService = tabStateService;

        // Initialize Service
        this.navigationService = new NavigationService(
            this.app,
            getSettings,
            urlIndex,
            (val) => { this.isManualRefresh = val; },
            onRefresh
        );
        // this.tabStateService provided via injection now


        // Initialize components
        this.contextMenus = new ContextMenus(this);
        this.noteRenderer = new NoteRenderer(this, this.contextMenus);
        this.sectionRenderer = new SectionRenderer(this, this.noteRenderer, this.contextMenus);
        this.tabListRenderer = new TabListRenderer(this, this.contextMenus, this.noteRenderer, this.sectionRenderer);
        this.browserTabRenderer = new BrowserTabRenderer(this, this.contextMenus, this.noteRenderer, this.sectionRenderer);
        this.pinnedTabRenderer = new PinnedTabRenderer(this, this.contextMenus);
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

        // Restore UI state from settings
        this.isRecentNotesOpen = this.settings.isRecentNotesOpen;
        this.isDomainGroupOpen = this.settings.isDomainGroupOpen;
        this.isSubredditExplorerOpen = this.settings.isSubredditExplorerOpen;
        this.isTagGroupOpen = this.settings.isTagGroupOpen;
        this.isSelectedTagGroupOpen = this.settings.isSelectedTagGroupOpen;
        this.expandedGroupIds = new Set(this.settings.expandedGroupIds);

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
        const contentEl = this.contentEl;
        if (!contentEl) return;

        // Check if our nav-header already exists
        let navHeader = this.containerEl.querySelector(':scope > .nav-header.web-sidecar-toolbar') as HTMLElement;

        // Ensure button state is synced even if header exists
        if (navHeader) {
            const expandBtn = navHeader.querySelector('.nav-action-button[aria-label="Expand all"], .nav-action-button[aria-label="Collapse all"]') as HTMLElement;
            if (expandBtn) {
                setIcon(expandBtn, this.allExpanded ? 'fold-vertical' : 'unfold-vertical');
                expandBtn.setAttribute('aria-label', this.allExpanded ? 'Collapse all' : 'Expand all');
            }
            return;
        }

        // Create nav-header
        navHeader = createDiv({ cls: 'nav-header web-sidecar-toolbar' });
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
            attr: { 'aria-label': this.allExpanded ? 'Collapse all' : 'Expand all' }
        });
        setIcon(expandBtn, this.allExpanded ? 'fold-vertical' : 'unfold-vertical');
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
        const newState = this.allExpanded;

        // Update button icon
        setIcon(btn, this.allExpanded ? 'fold-vertical' : 'unfold-vertical');
        btn.setAttribute('aria-label', this.allExpanded ? 'Collapse all' : 'Expand all');

        // Update state tracking & settings
        this.isRecentNotesOpen = newState;
        this.settings.isRecentNotesOpen = newState;

        this.isDomainGroupOpen = newState;
        this.settings.isDomainGroupOpen = newState;

        this.isSubredditExplorerOpen = newState;
        this.settings.isSubredditExplorerOpen = newState;

        this.isTagGroupOpen = newState;
        this.settings.isTagGroupOpen = newState;

        this.isSelectedTagGroupOpen = newState;
        this.settings.isSelectedTagGroupOpen = newState;

        // Persist changes
        this.saveSettingsFn();

        // Force re-render to populate content with new state
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

    setDomainSort(sort: 'alpha' | 'count' | 'recent'): void {
        this.domainSort = sort;
    }

    setTagSort(sort: 'alpha' | 'count' | 'recent'): void {
        this.tagSort = sort;
    }

    setSelectedTagSort(sort: 'alpha' | 'count' | 'recent'): void {
        this.selectedTagSort = sort;
    }

    setSubredditExplorerOpen(open: boolean): void {
        this.isSubredditExplorerOpen = open;
        this.settings.isSubredditExplorerOpen = open;
        this.saveSettingsFn();
    }

    setDomainGroupOpen(open: boolean): void {
        this.isDomainGroupOpen = open;
        this.settings.isDomainGroupOpen = open;
        this.saveSettingsFn();
    }

    setRecentNotesOpen(open: boolean): void {
        this.isRecentNotesOpen = open;
        this.settings.isRecentNotesOpen = open;
        this.saveSettingsFn();
        // No auto-refresh needed here, as it's just state tracking for next render
    }

    setTagGroupOpen(open: boolean): void {
        this.isTagGroupOpen = open;
        this.settings.isTagGroupOpen = open;
        this.saveSettingsFn();
    }

    setSelectedTagGroupOpen(open: boolean): void {
        this.isSelectedTagGroupOpen = open;
        this.settings.isSelectedTagGroupOpen = open;
        this.saveSettingsFn();
    }

    setGroupExpanded(id: string, expanded: boolean): void {
        if (expanded) {
            this.expandedGroupIds.add(id);
        } else {
            this.expandedGroupIds.delete(id);
        }
        this.settings.expandedGroupIds = Array.from(this.expandedGroupIds);
        this.saveSettingsFn();
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
        this.onRefresh(); // onRefresh calls render? No onRefreshFn calls View.updateTabs calls render.
        // But onRefreshFn might be debounced or dependent on other things.
        // Let's force render directly locally if possible, but trackedTabs needs update?
        // NavigationService/TabStateService updates trackedTabs usually.
        // Actually handleTabDrop just updates ORDER in settings.
        // We need to re-sort trackedTabs based on this new order visually.
        // The render loop does: const tabs = this.trackedTabs.
        // If we don't update this.trackedTabs order in memory, render will show old order until polling.
        // But we just updated settings.manualTabOrder.
        // We should trigger a full refresh cycle.
        this.render(true);
    }

    handleSectionDrop(draggedId: string, targetId: string): void {
        const currentOrder = [...this.settings.sectionOrder];

        // Remove dragged item
        const draggedIdx = currentOrder.indexOf(draggedId);
        if (draggedIdx > -1) {
            currentOrder.splice(draggedIdx, 1);
        }

        // Insert before target
        const targetIdx = currentOrder.indexOf(targetId);
        if (targetIdx > -1) {
            currentOrder.splice(targetIdx, 0, draggedId);
        } else {
            currentOrder.push(draggedId);
        }

        // Update settings and persist
        this.settings.sectionOrder = currentOrder;
        this.isManualRefresh = true;
        this.saveSettingsFn();
        this.onRefresh();
    }

    openCreateNoteModal(url: string): void {
        this.navigationService.openCreateNoteModal(url);
    }

    async openPaired(file: TFile, url: string, evt: MouseEvent): Promise<void> {
        await this.navigationService.openPaired(file, url, evt);
    }

    // --- Pinned Tab Implementations ---

    async pinTab(tab: TrackedWebViewer | VirtualTab): Promise<void> {
        // Just delegate to service
        await this.tabStateService.addPinnedTab(tab);
        this.render(true);
    }

    async unpinTab(pinId: string): Promise<void> {
        await this.tabStateService.removePinnedTab(pinId);
        // Ensure refresh (service calls it, but just in case)
        this.render(true);
    }

    async reorderPinnedTabs(movedPinId: string, targetPinId: string): Promise<void> {
        await this.tabStateService.reorderPinnedTabs(movedPinId, targetPinId);
    }

    async resetPinnedTab(pinId: string): Promise<void> {
        await this.tabStateService.resetPinnedTabUrl(pinId);
    }

    async updatePinnedTabHomeUrl(pinId: string, newUrl: string): Promise<void> {
        await this.tabStateService.savePinnedTabNewHomeUrl(pinId, newUrl);
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

    getOrCreateRightLeaf(): WorkspaceLeaf {
        return this.navigationService.getOrCreateRightLeaf();
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
        const container = this.contentEl;

        // Prevent re-rendering while user is interacting, unless forced
        if (this.isInteracting && !this.isManualRefresh && !force) {
            return;
        }
        this.isManualRefresh = false;

        container.addClass('web-sidecar-container');

        // Track mode changes
        const wasBrowserMode = container.hasClass('web-sidecar-browser-mode');
        // Drop Target for Main Container (Unpinning)
        // If a pinned tab is dropped anywhere outside the pinned section (i.e. on the main list), unpin it.
        container.ondragover = (e) => {
            if (e.dataTransfer?.types.includes('text/pin-id')) {
                // Ensure we are NOT over the pinned section?
                // The pinned section handles its own drop (reorder).
                // If event bubbles here, it means it wasn't handled (or we need stopPropagation there).
                // We should check target.
                if (!(e.target as HTMLElement).closest('.web-sidecar-pinned-section')) {
                    e.preventDefault();
                    // styling?
                }
            }
        };

        container.ondrop = (e) => {
            const pinId = e.dataTransfer?.getData('text/pin-id');
            if (pinId) {
                // Check if dropped outside pinned section
                if (!(e.target as HTMLElement).closest('.web-sidecar-pinned-section')) {
                    e.preventDefault();
                    this.unpinTab(pinId);
                }
            }
        };

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

        // Get Pinned Tabs
        const pinnedTabs = this.tabStateService.getPinnedTabs();
        const hasPinnedTabs = pinnedTabs.length > 0;

        // Show full view if we have web tabs O R virtual tabs OR pinned tabs
        // Pinned tabs are content too.
        const hasContent = this.trackedTabs.length > 0 || this.virtualTabs.length > 0 || hasPinnedTabs;

        // Track content state transition
        const hadContent = container.getAttribute('data-has-content') === 'true';
        const contentStateChanged = hasContent !== hadContent;
        container.setAttribute('data-has-content', hasContent ? 'true' : 'false');

        // Only empty container when:
        // 1. Mode changed
        // 2. No content (empty state)
        // 3. Notes mode (doesn't have DOM reconciliation)
        // 4. Content state changed
        if (modeChanged || !hasContent || !isBrowserMode || contentStateChanged) {
            container.empty();
        }

        // Ensure nav-header buttons exist
        this.createNavHeader();

        if (!hasContent) {
            this.sectionRenderer.renderEmptyState(container);
            return;
        }

        // --- Render Pinned Tabs (Always first) ---
        // We render inside container. 
        // If container was cleared, this creates the section. 
        // If not cleared (DOM reconciliation), it updates in place.
        this.pinnedTabRenderer.render(container, pinnedTabs);


        // Filter out pinned tabs from trackedTabs if they are "active" as pins?
        // TabStateService.getTrackedTabs() ALREADY does this filtering!

        if (isBrowserMode) {
            this.browserTabRenderer.renderBrowserModeTabList(container, this.trackedTabs, this.virtualTabs);
        } else {
            this.tabListRenderer.renderTabList(container, this.trackedTabs, this.virtualTabs);
        }
    }
}

