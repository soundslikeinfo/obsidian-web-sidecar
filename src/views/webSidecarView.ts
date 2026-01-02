
import { ItemView, WorkspaceLeaf, TFile } from 'obsidian';
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

    // Services & Components
    private navigationService: NavigationService;
    private contextMenus: ContextMenus;
    private noteRenderer: NoteRenderer;
    private sectionRenderer: SectionRenderer;
    private tabListRenderer: TabListRenderer;
    private browserTabRenderer: BrowserTabRenderer;

    /** Track if user is interacting with the sidebar (prevents re-render) */
    private isInteracting: boolean = false;

    constructor(
        leaf: WorkspaceLeaf,
        getSettings: () => WebSidecarSettings,
        onRefresh: () => void,
        getTabs: () => TrackedWebViewer[],
        getVirtualTabs: () => VirtualTab[],
        urlIndex: UrlIndex
    ) {
        super(leaf);
        this.getSettingsFn = getSettings;
        this.onRefreshFn = onRefresh;
        this.getTabsFn = getTabs;
        this.getVirtualTabsFn = getVirtualTabs;
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
        this.render();
    }

    async onClose(): Promise<void> {
        // Cleanup
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

    async openNoteSmartly(file: TFile, e: MouseEvent | KeyboardEvent): Promise<void> {
        await this.navigationService.openNoteSmartly(file, e);
    }

    async openUrlSmartly(url: string, e: MouseEvent): Promise<void> {
        await this.navigationService.openUrlSmartly(url, e);
    }

    async openNewWebViewer(): Promise<void> {
        await this.navigationService.openNewWebViewer();
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
    render(): void {
        const container = this.containerEl.children[1] as HTMLElement;

        // Prevent re-rendering while user is interacting, unless forced
        if (this.isInteracting && !this.isManualRefresh) {
            return;
        }
        this.isManualRefresh = false;

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

        container.empty();

        if (!hasContent) {
            this.sectionRenderer.renderEmptyState(container);
        } else if (this.settings.tabAppearance === 'browser') {
            this.browserTabRenderer.renderBrowserModeTabList(container, this.trackedTabs, this.virtualTabs);
        } else {
            this.tabListRenderer.renderTabList(container, this.trackedTabs, this.virtualTabs);
        }
    }
}
