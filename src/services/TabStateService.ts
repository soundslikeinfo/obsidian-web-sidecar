import { WorkspaceLeaf, Notice } from 'obsidian';
import type { WebSidecarSettings, TrackedWebViewer, VirtualTab, PinnedTab } from '../types';
import type WebSidecarPlugin from '../main';
import { getLeafId } from './obsidianHelpers';
import { findMatchingNotes } from './noteMatcher';
import { VirtualTabManager } from './VirtualTabManager';
import { PinnedTabManager } from './PinnedTabManager';

/**
 * Supported web viewer types
 */
const WEB_VIEW_TYPES = ['webviewer', 'surfing-view'];

/**
 * Polling interval for URL changes (ms)
 */
const POLL_INTERVAL = 500;

export class TabStateService {
    private plugin: WebSidecarPlugin;
    private getSettings: () => WebSidecarSettings;
    private onStateChange: () => void;

    private virtualTabManager: VirtualTabManager;
    private pinnedTabManager: PinnedTabManager;

    private trackedTabs: Map<string, TrackedWebViewer> = new Map();
    private urlTitleCache: Map<string, string> = new Map();
    private pollIntervalId: number | null = null;

    /** Pending original URL to apply to the next new tab (for redirect detection) */
    private pendingOriginalUrl: string | undefined;

    constructor(
        plugin: WebSidecarPlugin,
        getSettings: () => WebSidecarSettings,
        onStateChange: () => void
    ) {
        this.plugin = plugin;
        this.getSettings = getSettings;
        this.onStateChange = onStateChange;

        this.virtualTabManager = new VirtualTabManager(
            plugin,
            getSettings,
            () => this.urlTitleCache
        );
        this.pinnedTabManager = new PinnedTabManager(
            plugin,
            getSettings,
            () => this.refreshState()
        );

        // No auto-init in constructor, allow explicit init
    }

    initialize(): void {
        // Listen for active leaf changes
        this.plugin.registerEvent(
            this.plugin.app.workspace.on('active-leaf-change', (leaf) => {
                this.onActiveLeafChange(leaf);
            })
        );

        // Listen for layout changes (e.g. closing a note) to refresh virtual tabs immediately
        this.plugin.registerEvent(
            this.plugin.app.workspace.on('layout-change', () => {
                // Throttle? Or just refresh. Refresh is relatively cheap but we should define it.
                // refreshState calls scanAllWebViewers which is fast.
                this.refreshState();
            })
        );

        // Start polling
        this.startPolling();

        // Initial scan and notify view
        void this.pinnedTabManager.syncAllPinnedNotes(); // Initial sync from notes
        this.refreshState();
    }

    destroy(): void {
        this.stopPolling();
        this.trackedTabs.clear();
        this.urlTitleCache.clear();
    }

    /**
     * Start polling for URL changes
     */
    private startPolling(): void {
        this.pollIntervalId = this.plugin.registerInterval(
            window.setInterval(() => this.pollForChanges(), POLL_INTERVAL)
        );
        // Also poll for pinned note changes regularly (less frequent? effectively synced on metadata cache change mainly)
        // But for now, we can piggyback or hook into checks.
        // Actually, we should listen to metadata cache changes for the pinned sync.
        this.plugin.registerEvent(
            this.plugin.app.metadataCache.on('changed', (file) => {
                this.pinnedTabManager.syncPinnedStatusForFile(file);
            })
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
     * Trigger a manual refresh of state
     */
    refreshState(): void {
        this.scanAllWebViewers();
        this.cleanupClosedTabs();
        this.onStateChange();
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
            this.onStateChange();
        }
    }

    /**
     * Get tracked tabs sorted according to settings
     */
    getTrackedTabs(): TrackedWebViewer[] {
        const settings = this.getSettings();

        // If pinned tabs feature is disabled, return all tabs without filtering
        if (!settings.enablePinnedTabs) {
            return this.getSortedTabs(Array.from(this.trackedTabs.values()), settings);
        }

        // Filter out tabs that are currently active as a Pinned Tab to avoid duplication in the UI
        // A tab is "active as pinned" if its current URL matches a pinned tab's URL (or saved currentUrl)
        // The User said: "I also don't want a pinned tab to show up in the pinned tab area + the normal web tab area."
        const pinnedTabs = settings.pinnedTabs;
        const pinnedLeafIds = new Set(pinnedTabs.map(p => p.leafId).filter(id => !!id));
        const pinnedUrls = new Set(pinnedTabs.map(p => p.currentUrl || p.url));

        const tabs = Array.from(this.trackedTabs.values()).filter(t => {
            // Priority 1: If leaf ID matches a known pinned tab leaf, it is pinned.
            if (pinnedLeafIds.has(t.leafId)) return false;

            // Priority 2: If URL matches a pinned URL (and not already assigned to another leaf?), 
            // we treat it as pinned (implicitly docking).
            // However, if we have 2 tabs with same URL, one might be the pin, the other normal.
            // If the pin has a leafId, we trust that.
            // If the pin has NO leafId (closed/reloaded), we might "claim" this tab.

            // For now, keep simple URL matching as fallback, but leafId is primary.
            if (pinnedUrls.has(t.url)) return false;

            return true;
        });

        return this.getSortedTabs(tabs, settings);
    }

    /**
     * Sort tabs according to settings
     */
    private getSortedTabs(tabs: TrackedWebViewer[], settings: WebSidecarSettings): TrackedWebViewer[] {
        switch (settings.tabSortOrder) {
            case 'title':
                return tabs.sort((a, b) => a.title.localeCompare(b.title));
            case 'manual': {
                // Sort by position in manualTabOrder, new tabs go to end
                const order = settings.manualTabOrder;
                return tabs.sort((a, b) => {
                    const aIdx = order.indexOf(a.leafId);
                    const bIdx = order.indexOf(b.leafId);
                    // Items not in manual order go to the end
                    if (aIdx === -1 && bIdx === -1) return 0;
                    if (aIdx === -1) return 1;
                    if (bIdx === -1) return -1;
                    return aIdx - bIdx;
                });
            }
            case 'focus':
            default:
                return tabs.sort((a, b) => b.lastFocused - a.lastFocused);
        }
    }

    /**
     * Get virtual tabs from open notes with URL properties
     * Deduplicated by file path (same note in multiple tabs = 1 virtual tab)
     */
    /**
     * Get virtual tabs from open notes with URL properties
     */
    getVirtualTabs(): VirtualTab[] {
        return this.virtualTabManager.getVirtualTabs(Array.from(this.trackedTabs.values()));
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
        const leaves = this.plugin.app.workspace.getLeavesOfType('webviewer')
            .concat(this.plugin.app.workspace.getLeavesOfType('surfing-view'));

        for (const leaf of leaves) {
            const leafId = getLeafId(leaf) || leaf.view.getViewType() + '-' + leaves.indexOf(leaf);
            const info = this.getWebViewerInfo(leaf);

            if (info) {
                // Detect if leaf is in a popout window
                // Detect if leaf is in a popout window
                // Detect if leaf is in a popout window
                const leafWindow = (leaf.getRoot() as unknown as { containerEl: { win: Window } }).containerEl?.win;
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
                        // Compute sticky notes logic BEFORE updating the map
                        let newOriginalUrl = existing.originalUrl;

                        // Auto-sync pinned tab currentUrl when navigation/redirect detected
                        if (existing.url !== info.url) {
                            this.pinnedTabManager.syncPinnedTabCurrentUrl(leafId, info.url);

                            // Sticky Notes Logic:
                            // 1. If we have an originalUrl (sticky), check if the NEW url has active linked notes.
                            //    If yes, "snap" to the new URL (reset origin) and notify.
                            //    If no, keep the old originalUrl (stay sticky to previous).
                            // 2. If we don't have an originalUrl, check if new URL has notes.
                            //    If yes, set originalUrl to make it sticky from now on.

                            const matches = findMatchingNotes(this.plugin.app, info.url, this.getSettings(), this.plugin.urlIndex);
                            const hasNotes = matches.exactMatches.length > 0;


                            if (hasNotes) {
                                // Found notes for this new URL -> Snap/Reset origin
                                if (newOriginalUrl && newOriginalUrl !== info.url) {
                                    new Notice(`Found linked notes for new page. Origin updated.`);
                                }
                                newOriginalUrl = info.url;
                            }
                            // If !hasNotes, keep newOriginalUrl as-is (sticky to previous URL)

                        }

                        // Now update the map with the correctly computed originalUrl
                        this.trackedTabs.set(leafId, {
                            ...existing,
                            url: info.url,
                            title: info.title || existing.title,
                            isPopout,
                            leaf: leaf,
                            originalUrl: newOriginalUrl,
                        });
                    }
                } else {
                    // New tab - apply pending original URL if set (for redirect tracking)
                    const originalUrl = this.pendingOriginalUrl;
                    if (this.pendingOriginalUrl) {
                        this.pendingOriginalUrl = undefined; // Clear after use
                    }

                    this.trackedTabs.set(leafId, {
                        leafId,
                        url: info.url,
                        title: info.title || this.extractTitleFromUrl(info.url),
                        lastFocused: Date.now(),
                        isPopout,
                        leaf: leaf,
                        originalUrl, // Will be undefined for tabs not opened from linked notes
                    });
                }
            }
        }
    }

    /**
     * Remove tabs that are no longer open
     */
    private cleanupClosedTabs(): void {
        const leaves = this.plugin.app.workspace.getLeavesOfType('webviewer')
            .concat(this.plugin.app.workspace.getLeavesOfType('surfing-view'));

        const activeLeafIds = new Set(
            leaves.map((leaf, index) => getLeafId(leaf) || leaf.view.getViewType() + '-' + index)
        );

        for (const leafId of this.trackedTabs.keys()) {
            if (!activeLeafIds.has(leafId)) {
                this.trackedTabs.delete(leafId);

                // Also check if this was a pinned tab's leaf
                const settings = this.getSettings();
                const pin = settings.pinnedTabs.find(p => p.leafId === leafId);
                if (pin) {
                    pin.leafId = undefined;
                    // CRITICAL: Reset currentUrl when closing so reopening goes to home URL
                    pin.currentUrl = undefined;
                    // Persist
                    void this.plugin.saveSettings();
                }
            }
        }
    }

    /**
     * Handle active leaf changes to update focus time and refresh view
     */
    private onActiveLeafChange(leaf: WorkspaceLeaf | null): void {
        if (!leaf) return;

        const viewType = leaf.view.getViewType();

        if (WEB_VIEW_TYPES.includes(viewType)) {
            const leafId = getLeafId(leaf) || viewType + '-0';
            const info = this.getWebViewerInfo(leaf);

            if (info) {
                // Detect if leaf is in a popout window
                const leafWindow = (leaf.getRoot() as unknown as { containerEl: { win: Window } }).containerEl?.win;
                const isPopout = leafWindow !== undefined && leafWindow !== window;

                // CRITICAL: Preserve originalUrl when updating focus time
                const existing = this.trackedTabs.get(leafId);

                // Update focus time while preserving originalUrl
                this.trackedTabs.set(leafId, {
                    leafId,
                    url: info.url,
                    title: info.title || this.extractTitleFromUrl(info.url),
                    lastFocused: Date.now(),
                    isPopout,
                    leaf: leaf,
                    originalUrl: existing?.originalUrl, // Preserve sticky URL
                });
            }
        }

        // Always refresh the view to update virtual tabs
        this.onStateChange();
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

    setCachedTitle(url: string, title: string): void {
        this.urlTitleCache.set(url, title);
        // Persist? We don't persist cache currently, relies on session or fetch.
    }

    // --- Pinned Tabs Logic ---

    getPinnedTabs(): PinnedTab[] {
        return this.pinnedTabManager.getPinnedTabs(this.trackedTabs);
    }

    async addPinnedTab(tab: TrackedWebViewer | VirtualTab | { url: string; title: string }): Promise<void> {
        return this.pinnedTabManager.addPinnedTab(tab);
    }

    async removePinnedTab(pinId: string): Promise<void> {
        return this.pinnedTabManager.removePinnedTab(pinId);
    }

    async updatePinnedTabCurrentUrl(pinId: string, url: string): Promise<void> {
        return this.pinnedTabManager.updatePinnedTabCurrentUrl(pinId, url);
    }

    private syncPinnedTabCurrentUrl(leafId: string, newUrl: string): void {
        this.pinnedTabManager.syncPinnedTabCurrentUrl(leafId, newUrl);
    }

    async resetPinnedTabUrl(pinId: string): Promise<void> {
        return this.pinnedTabManager.resetPinnedTabUrl(pinId);
    }

    async savePinnedTabNewHomeUrl(pinId: string, newUrl: string): Promise<void> {
        return this.pinnedTabManager.savePinnedTabNewHomeUrl(pinId, newUrl);
    }

    async reorderPinnedTabs(movedPinId: string, targetPinId: string): Promise<void> {
        return this.pinnedTabManager.reorderPinnedTabs(movedPinId, targetPinId);
    }

    async setPinnedTabLeaf(pinId: string, leafId: string): Promise<void> {
        return this.pinnedTabManager.setPinnedTabLeaf(pinId, leafId);
    }

    async updatePinnedTabNotes(pinId: string): Promise<void> {
        return this.pinnedTabManager.updatePinnedTabNotes(pinId);
    }

    // --- Redirect Detection Logic ---

    /**
     * Update a tab's original URL manually (e.g. when creating a new note)
     */
    updateTabOriginalUrl(leafId: string, url: string): void {
        const tab = this.trackedTabs.get(leafId);
        if (tab) {
            tab.originalUrl = url;
            this.refreshState();
        }
    }

    /**
     * Set a pending original URL to be applied to the next new tab.
     * Call this BEFORE opening a URL from a linked note to enable redirect detection.
     */
    setPendingOriginalUrl(url: string): void {
        this.pendingOriginalUrl = url;
    }

    /**
     * Set the original URL for a tracked tab (used when opening from a linked note)
     * This allows us to detect when the page has auto-redirected
     */
    setTabOriginalUrl(leafId: string, url: string): void {
        const tab = this.trackedTabs.get(leafId);
        if (tab) {
            tab.originalUrl = url;
        }
    }

    /**
     * Check if a tracked tab has redirected from its original URL
     */
    hasRedirectedUrl(leafId: string): boolean {
        const tab = this.trackedTabs.get(leafId);
        return !!(tab?.originalUrl && tab.originalUrl !== tab.url);
    }

    /**
     * Update all notes linked to the original URL of a tracked tab to the new (current) URL.
     * Clears the originalUrl after update.
     */
    async updateTrackedTabNotes(leafId: string): Promise<void> {
        const tab = this.trackedTabs.get(leafId);
        if (!tab || !tab.originalUrl || tab.originalUrl === tab.url) return;

        const oldUrl = tab.originalUrl;
        const newUrl = tab.url;
        const settings = this.getSettings();

        // Find all files linking to oldUrl and update them
        const files = this.plugin.app.vault.getMarkdownFiles();

        for (const file of files) {
            await this.plugin.app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
                for (const field of settings.urlPropertyFields) {
                    const val = frontmatter[field];
                    if (!val) continue;

                    if (Array.isArray(val)) {
                        const idx = val.indexOf(oldUrl);
                        if (idx > -1) {
                            val[idx] = newUrl;
                        }
                    } else if (val === oldUrl) {
                        frontmatter[field] = newUrl;
                    }
                }
            });
        }

        // Clear the originalUrl since we've updated notes to match current
        tab.originalUrl = undefined;

        this.refreshState();
    }
}
