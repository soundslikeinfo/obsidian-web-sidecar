import { ItemView, WorkspaceLeaf, TFile } from 'obsidian';
import type { WebSidecarSettings, TrackedWebViewer, VirtualTab, IWebSidecarView } from '../types';
import { ContextMenus } from './components/ContextMenus';
import { NoteRenderer } from './components/NoteRenderer';
import { SectionRenderer } from './components/SectionRenderer';

import { LinkedNotesTabRenderer } from './components/tabs/LinkedNotesTabRenderer';
import { PinnedTabRenderer } from './components/tabs/PinnedTabRenderer';
import { NavHeaderBuilder } from './components/NavHeaderBuilder';
import { NavigationService } from '../services/NavigationService';
import { TabStateService } from '../services/TabStateService';
import { UrlIndex } from '../services/UrlIndex';

import { RefactoringLogger } from '../utils/RefactoringLogger';
import { ViewState } from './ViewState';
import { ViewEventHandler } from './ViewEventHandler';

export const VIEW_TYPE_WEB_SIDECAR = 'web-sidecar-view';


/**
 * Sidebar view for Web Sidecar plugin
 */
export class WebSidecarView extends ItemView implements IWebSidecarView {
    // Interface implementation properties
    settings: WebSidecarSettings;

    // Extracted State
    viewState: ViewState = new ViewState();

    // Deprecated direct properties (proxied to viewState for IWebSidecarView compatibility)
    get subredditSort() { return this.viewState.subredditSort; }
    set subredditSort(val) { this.viewState.subredditSort = val; }

    get domainSort() { return this.viewState.domainSort; }
    set domainSort(val) { this.viewState.domainSort = val; }

    get tagSort() { return this.viewState.tagSort; }
    set tagSort(val) { this.viewState.tagSort = val; }

    get selectedTagSort() { return this.viewState.selectedTagSort; }
    set selectedTagSort(val) { this.viewState.selectedTagSort = val; }

    get isSubredditExplorerOpen() { return this.viewState.isSubredditExplorerOpen; }
    set isSubredditExplorerOpen(val) { this.viewState.isSubredditExplorerOpen = val; }

    get isDomainGroupOpen() { return this.viewState.isDomainGroupOpen; }
    set isDomainGroupOpen(val) { this.viewState.isDomainGroupOpen = val; }

    get isRecentNotesOpen() { return this.viewState.isRecentNotesOpen; }
    set isRecentNotesOpen(val) { this.viewState.isRecentNotesOpen = val; }

    get isTagGroupOpen() { return this.viewState.isTagGroupOpen; }
    set isTagGroupOpen(val) { this.viewState.isTagGroupOpen = val; }

    get isSelectedTagGroupOpen() { return this.viewState.isSelectedTagGroupOpen; }
    set isSelectedTagGroupOpen(val) { this.viewState.isSelectedTagGroupOpen = val; }

    get isYouTubeChannelExplorerOpen() { return this.viewState.isYouTubeChannelExplorerOpen; }
    set isYouTubeChannelExplorerOpen(val) { this.viewState.isYouTubeChannelExplorerOpen = val; }

    get youtubeChannelSort() { return this.viewState.youtubeChannelSort; }
    set youtubeChannelSort(val) { this.viewState.youtubeChannelSort = val; }

    get isTwitterExplorerOpen() { return this.viewState.isTwitterExplorerOpen; }
    set isTwitterExplorerOpen(val) { this.viewState.isTwitterExplorerOpen = val; }

    get twitterSort() { return this.viewState.twitterSort; }
    set twitterSort(val) { this.viewState.twitterSort = val; }

    get isGithubExplorerOpen() { return this.viewState.isGithubExplorerOpen; }
    set isGithubExplorerOpen(val) { this.viewState.isGithubExplorerOpen = val; }

    get githubSort() { return this.viewState.githubSort; }
    set githubSort(val) { this.viewState.githubSort = val; }

    get expandedGroupIds() { return this.viewState.expandedGroupIds; }
    set expandedGroupIds(val) { this.viewState.expandedGroupIds = val; }

    get isManualRefresh() { return this.viewState.isManualRefresh; }
    set isManualRefresh(val) { this.viewState.isManualRefresh = val; }

    get isInteracting() { return this.viewState.isInteracting; }
    set isInteracting(val) { this.viewState.isInteracting = val; }

    // Track expand state for toggle
    get allExpanded() { return this.viewState.allExpanded; }
    set allExpanded(val) { this.viewState.allExpanded = val; }

    urlIndex: UrlIndex;

    // Private properties
    // Public state for interface
    public trackedTabs: TrackedWebViewer[] = [];
    private virtualTabs: VirtualTab[] = [];
    private getSettingsFn: () => WebSidecarSettings;
    private onRefreshFn: () => void;
    private getTabsFn: () => TrackedWebViewer[];
    private getVirtualTabsFn: () => VirtualTab[];

    // Services & Components
    private navigationService: NavigationService;
    private contextMenus: ContextMenus;
    private eventHandler: ViewEventHandler;
    private noteRenderer: NoteRenderer;
    private sectionRenderer: SectionRenderer;

    private linkedNotesTabRenderer: LinkedNotesTabRenderer;
    private pinnedTabRenderer: PinnedTabRenderer;
    private navHeaderBuilder: NavHeaderBuilder;
    public tabStateService: TabStateService;
    public saveSettingsFn: () => Promise<void>;



    /** Reference to sort button for dynamic updates */
    private sortBtn: HTMLElement | null = null;

    private renderFrameId: number | null = null;

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

        this.linkedNotesTabRenderer = new LinkedNotesTabRenderer(this, this.contextMenus, this.noteRenderer, this.sectionRenderer);
        this.pinnedTabRenderer = new PinnedTabRenderer(this, this.contextMenus);
        this.navHeaderBuilder = new NavHeaderBuilder(this, this.containerEl);

        this.eventHandler = new ViewEventHandler(this, this.navigationService, this.tabStateService);
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
        RefactoringLogger.log('ViewOpened');
        this.settings = this.getSettingsFn();
        this.trackedTabs = this.getTabsFn();
        this.virtualTabs = this.getVirtualTabsFn();

        // Restore UI state from settings
        this.viewState.syncFromSettings(this.settings);

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

                if (leaf) {
                    RefactoringLogger.log('ActiveLeafChange', { type: leaf.view.getViewType(), isSidecar: leaf.view === this });
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
     */
    private createNavHeader(): void {
        this.navHeaderBuilder.create(this.contentEl);
    }

    private handleExpandToggle(_btn: HTMLElement): void {
        // Handled by NavHeaderBuilder
    }

    private updateSortButtonIcon(): void {
        this.navHeaderBuilder.updateSortButtonIcon();
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
        void this.saveSettingsFn();
    }

    setDomainGroupOpen(open: boolean): void {
        this.isDomainGroupOpen = open;
        this.settings.isDomainGroupOpen = open;
        void this.saveSettingsFn();
    }

    setRecentNotesOpen(open: boolean): void {
        this.isRecentNotesOpen = open;
        this.settings.isRecentNotesOpen = open;
        void this.saveSettingsFn();
        // No auto-refresh needed here, as it's just state tracking for next render
    }

    setTagGroupOpen(open: boolean): void {
        this.isTagGroupOpen = open;
        this.settings.isTagGroupOpen = open;
        void this.saveSettingsFn();
    }

    setSelectedTagGroupOpen(open: boolean): void {
        this.isSelectedTagGroupOpen = open;
        this.settings.isSelectedTagGroupOpen = open;
        void this.saveSettingsFn();
    }

    setYouTubeChannelSort(sort: 'alpha' | 'count' | 'recent'): void {
        this.youtubeChannelSort = sort;
        this.settings.youtubeChannelSortOrder = sort;
        void this.saveSettingsFn();
    }

    setYouTubeChannelExplorerOpen(open: boolean): void {
        this.isYouTubeChannelExplorerOpen = open;
        this.settings.isYouTubeChannelExplorerOpen = open;
        void this.saveSettingsFn();
    }

    setTwitterSort(sort: 'alpha' | 'count' | 'recent'): void {
        this.twitterSort = sort;
        this.settings.twitterSortOrder = sort;
        void this.saveSettingsFn();
    }

    setTwitterExplorerOpen(open: boolean): void {
        this.isTwitterExplorerOpen = open;
        this.settings.isTwitterExplorerOpen = open;
        void this.saveSettingsFn();
    }

    setGithubSort(sort: 'alpha' | 'count' | 'recent'): void {
        this.githubSort = sort;
        this.settings.githubSortOrder = sort;
        void this.saveSettingsFn();
    }

    setGithubExplorerOpen(open: boolean): void {
        this.isGithubExplorerOpen = open;
        this.settings.isGithubExplorerOpen = open;
        void this.saveSettingsFn();
    }

    setGroupExpanded(id: string, expanded: boolean): void {
        if (expanded) {
            this.expandedGroupIds.add(id);
        } else {
            this.expandedGroupIds.delete(id);
        }
        this.settings.expandedGroupIds = Array.from(this.expandedGroupIds);
        void this.saveSettingsFn();
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

    focusNextWebViewerInstance(url: string): void {
        this.navigationService.focusNextWebViewerInstance(url);
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
        this.eventHandler.handleTabDrop(draggedLeafId, targetLeafId);
    }

    handleSectionDrop(draggedId: string, targetId: string): void {
        this.eventHandler.handleSectionDrop(draggedId, targetId);
    }

    openCreateNoteModal(url: string, leafId?: string): void {
        this.eventHandler.openCreateNoteModal(url, leafId);
    }

    async openPaired(file: TFile, url: string, evt: MouseEvent): Promise<void> {
        await this.navigationService.openPaired(file, url, evt);
    }

    // --- Pinned Tab Implementations ---

    async pinTab(tab: TrackedWebViewer | VirtualTab): Promise<void> {
        await this.eventHandler.pinTab(tab);
    }

    async unpinTab(pinId: string): Promise<void> {
        await this.eventHandler.unpinTab(pinId);
    }

    async reorderPinnedTabs(movedPinId: string, targetPinId: string): Promise<void> {
        await this.eventHandler.reorderPinnedTabs(movedPinId, targetPinId);
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

    // --- Redirect Detection Implementations ---

    hasRedirectedUrl(leafId: string): boolean {
        return this.tabStateService.hasRedirectedUrl(leafId);
    }

    async updateTrackedTabNotes(leafId: string): Promise<void> {
        await this.tabStateService.updateTrackedTabNotes(leafId);
        this.render(true);
    }

    setTabOriginalUrl(leafId: string, url: string): void {
        this.tabStateService.setTabOriginalUrl(leafId, url);
    }

    setPendingOriginalUrl(url: string): void {
        this.tabStateService.setPendingOriginalUrl(url);
    }

    focusWebViewer(leafId: string): void {
        void this.navigationService.focusWebViewer(leafId);
    }

    focusTab(tab: TrackedWebViewer): void {
        this.navigationService.focusTab(tab);
    }

    getOrCreateRightLeaf(): WorkspaceLeaf {
        return this.navigationService.getOrCreateRightLeaf();
    }

    getOrCreateWebViewerLeaf(): WorkspaceLeaf {
        return this.navigationService.getOrCreateWebViewerLeaf();
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
        RefactoringLogger.log('RenderRequest', { force });
        // Capture manual refresh state at call time (before async delay)
        const shouldForce = force || this.isManualRefresh;
        if (this.isManualRefresh) {
            this.isManualRefresh = false;
        }

        // Debounce render calls to next animation frame
        if (this.renderFrameId !== null) {
            cancelAnimationFrame(this.renderFrameId);
        }

        this.renderFrameId = requestAnimationFrame(() => {
            this.renderFrameId = null;
            this.performRender(shouldForce);
        });
    }

    private performRender(force?: boolean): void {
        const container = this.contentEl;

        // Prevent re-rendering while user is interacting, unless forced
        if (this.isInteracting && !force) {
            RefactoringLogger.log('RenderSkipped', { reason: 'isInteracting' });
            return;
        }

        RefactoringLogger.log('PerformRender', { force });

        container.addClass('web-sidecar-container');

        // Track mode changes
        const wasLinkedMode = container.hasClass('web-sidecar-linked-mode');
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
                    void this.unpinTab(pinId);
                }
            }
        };

        const isLinkedMode = this.settings.tabAppearance === 'linked-mode' || this.settings.tabAppearance === 'basic';
        const isBasicMode = this.settings.tabAppearance === 'basic';
        const modeChanged = wasLinkedMode !== isLinkedMode;

        // Add mode-specific class
        container.removeClass('web-sidecar-linked-notes-mode', 'web-sidecar-basic-mode');
        container.addClass(isBasicMode ? 'web-sidecar-basic-mode' : 'web-sidecar-linked-notes-mode');

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
        // 3. Content state changed
        if (modeChanged || !hasContent || contentStateChanged) {
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
        this.pinnedTabRenderer.render(container, pinnedTabs, isBasicMode);


        // Filter out pinned tabs from trackedTabs if they are "active" as pins?
        // TabStateService.getTrackedTabs() ALREADY does this filtering!

        this.linkedNotesTabRenderer.renderLinkedNotesTabList(container, this.trackedTabs, this.virtualTabs, isBasicMode);
    }
}

