
import { WorkspaceLeaf, MarkdownView } from 'obsidian';
import type { WebSidecarSettings, TrackedWebViewer, VirtualTab, PinnedTab } from '../types';
import { TFile } from 'obsidian';
import type WebSidecarPlugin from '../main';
import { getLeafId } from './obsidianHelpers';
import { isSameRedditPost } from './matchers/reddit';

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

        // No auto-init in constructor, allow explicit init
    }

    initialize(): void {
        // Listen for active leaf changes
        this.plugin.registerEvent(
            this.plugin.app.workspace.on('active-leaf-change', (leaf) => {
                this.onActiveLeafChange(leaf);
            })
        );

        // Start polling
        this.startPolling();

        // Initial scan and notify view
        this.syncAllPinnedNotes(); // Initial sync from notes
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
                this.syncPinnedStatusForFile(file);
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
            case 'manual':
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
            case 'focus':
            default:
                return tabs.sort((a, b) => b.lastFocused - a.lastFocused);
        }
    }

    /**
     * Get virtual tabs from open notes with URL properties
     * Deduplicated by file path (same note in multiple tabs = 1 virtual tab)
     */
    getVirtualTabs(): VirtualTab[] {
        const virtualTabs: VirtualTab[] = [];
        const openUrls = new Set(Array.from(this.trackedTabs.values()).map(t => t.url));
        const settings = this.getSettings();

        // Also track pinned tab URLs (both home and current) to exclude from virtual tabs
        // Only filter if pinned tabs feature is enabled
        const pinnedUrls = new Set<string>();
        if (settings.enablePinnedTabs) {
            for (const pin of settings.pinnedTabs) {
                pinnedUrls.add(pin.url);
                if (pin.currentUrl) pinnedUrls.add(pin.currentUrl);
            }
        }

        // Track files we've already processed to deduplicate
        const processedFilePaths = new Set<string>();

        // Get all open markdown leaves
        const markdownLeaves = this.plugin.app.workspace.getLeavesOfType('markdown');

        for (const leaf of markdownLeaves) {
            const view = leaf.view;
            if (!(view instanceof MarkdownView)) continue;

            const file = view.file;
            if (!file) continue;

            // CRITICAL: Deduplicate by file path - skip if already processed
            if (processedFilePaths.has(file.path)) continue;
            processedFilePaths.add(file.path);

            // Get frontmatter
            const cache = this.plugin.app.metadataCache.getFileCache(file);
            const frontmatter = cache?.frontmatter;
            if (!frontmatter) continue;

            // Check each URL property field
            for (const propName of settings.urlPropertyFields) {
                const propValue = frontmatter[propName];
                if (!propValue) continue;

                // Handle string or array
                const values = Array.isArray(propValue) ? propValue : [propValue];

                let foundUrl: string | undefined;

                for (const val of values) {
                    if (typeof val === 'string' && val.trim().startsWith('http')) {
                        foundUrl = val.trim();
                        break;
                    }
                }

                if (foundUrl) {
                    // Skip if URL is already open in a web viewer (check exact & domain-specific, e.g. Reddit ID)
                    const isAlreadyOpen = Array.from(openUrls).some(openUrl =>
                        openUrl === foundUrl || isSameRedditPost(openUrl, foundUrl)
                    );
                    if (isAlreadyOpen) continue;

                    // Skip if URL belongs to a pinned tab (shown in pinned section instead)
                    // Pinned tabs might also have redirected, so we check using the same robust logic
                    const isPinned = Array.from(pinnedUrls).some(pinUrl =>
                        pinUrl === foundUrl || isSameRedditPost(pinUrl, foundUrl)
                    );
                    if (isPinned) continue;

                    virtualTabs.push({
                        file,
                        url: foundUrl,
                        propertyName: propName,
                        cachedTitle: this.urlTitleCache.get(foundUrl),
                    });
                    break; // Only add one virtual tab per note
                }
            }
        }

        return virtualTabs;
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
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const leafWindow = (leaf.getRoot() as any).containerEl?.win;
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
                        this.trackedTabs.set(leafId, {
                            ...existing,
                            url: info.url,
                            title: info.title || existing.title,
                            isPopout,
                            leaf: leaf,
                        });

                        // Auto-sync pinned tab currentUrl when navigation/redirect detected
                        if (existing.url !== info.url) {
                            this.syncPinnedTabCurrentUrl(leafId, info.url);
                        }
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
                    // Persist?
                    this.plugin.saveSettings();
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
                // Detect if leaf is in a popout window
                // Detect if leaf is in a popout window
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const leafWindow = (leaf.getRoot() as any).containerEl?.win;
                const isPopout = leafWindow !== undefined && leafWindow !== window;

                // Update focus time
                this.trackedTabs.set(leafId, {
                    leafId,
                    url: info.url,
                    title: info.title || this.extractTitleFromUrl(info.url),
                    lastFocused: Date.now(),
                    isPopout,
                    leaf: leaf,
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
        const settings = this.getSettings();
        // Enrich pinned tabs with active leaf info
        return settings.pinnedTabs.map(pin => {
            // 1. Try to find by stored leafId
            let openTab: TrackedWebViewer | undefined;
            if (pin.leafId) {
                openTab = this.trackedTabs.get(pin.leafId);
            }

            // 2. If not found by ID (maybe ID lost or new session), try to find by URL (active or home)
            if (!openTab) {
                const activeUrl = pin.currentUrl || pin.url;
                openTab = Array.from(this.trackedTabs.values()).find(t => t.url === activeUrl);

                // If found by URL and it's not claimed by another pin
                // (Simple Claim: First come first served, or check if leafId is in other pins)
                if (openTab) {
                    // Implicitly claim it?
                    // We shouldn't mutate settings here in getter.
                    // But we return the effective state.
                }
            }

            return {
                ...pin,
                leafId: openTab?.leafId
            };
        });
    }

    async addPinnedTab(tab: TrackedWebViewer | VirtualTab | { url: string; title: string }): Promise<void> {
        if (!this.getSettings().enablePinnedTabs) return;

        const settings = this.getSettings();
        const existing = settings.pinnedTabs.find(p => p.url === tab.url);
        if (existing) return; // Already pinned

        // Check if it matches a note
        // We can check if any note has this URL property?
        // For now, simpler: Just create the pin.
        // If it was a VirtualTab, we know the file.
        let isNote = false;
        let notePath: string | undefined;

        if ('file' in tab) {
            isNote = true;
            notePath = (tab).file.path;
        }

        const title = 'title' in tab ? tab.title : ('cachedTitle' in tab ? tab.cachedTitle : tab.url);
        const leafId = 'leafId' in tab ? tab.leafId : undefined;

        const newPin: PinnedTab = {
            id: crypto.randomUUID(),
            url: tab.url,
            title: title || tab.url,
            isNote,
            notePath,
            leafId
        };

        settings.pinnedTabs.push(newPin);

        // If it is a note, we should TRY to write the property to the file?
        // User said: "And another option if it is enabled for the note property where it should update the status if it is true."
        // "Pinned property: 'status', Pinned value: 'sidecar' ... user will be able to change"
        // So yes, we should try to write the tag/property back to the file.
        if (isNote && notePath) {
            await this.writePinnedProperty(notePath, true);
        }

        await this.plugin.saveSettings();
        this.refreshState();
    }

    async removePinnedTab(pinId: string): Promise<void> {
        const settings = this.getSettings();
        const index = settings.pinnedTabs.findIndex(p => p.id === pinId);
        if (index === -1) return;

        const pin = settings.pinnedTabs[index];
        settings.pinnedTabs.splice(index, 1);

        // Remove property from note if applicable
        if (pin && pin.isNote && pin.notePath) {
            await this.writePinnedProperty(pin.notePath, false);
        }

        await this.plugin.saveSettings();
        this.refreshState();
    }

    /**
     * Update a Pinned Tab's current session URL (navigation within pin)
     */
    async updatePinnedTabCurrentUrl(pinId: string, url: string): Promise<void> {
        const settings = this.getSettings();
        const pin = settings.pinnedTabs.find(p => p.id === pinId);
        if (!pin) return;

        // If back to home url, clear currentUrl
        if (url === pin.url) {
            pin.currentUrl = undefined;
        } else {
            pin.currentUrl = url;
        }

        // This is transient? Or persistent? Plan says persist.
        await this.plugin.saveSettings();
        this.refreshState();
    }

    /**
     * Sync a pinned tab's currentUrl when its leaf navigates/redirects.
     * Called from scanAllWebViewers when URL change detected on a tracked tab.
     */
    private syncPinnedTabCurrentUrl(leafId: string, newUrl: string): void {
        const settings = this.getSettings();
        const pin = settings.pinnedTabs.find(p => p.leafId === leafId);
        if (!pin) return;

        // If back to home url, clear currentUrl
        if (newUrl === pin.url) {
            if (pin.currentUrl !== undefined) {
                pin.currentUrl = undefined;
                this.plugin.saveSettings(); // Async but we don't await
            }
        } else if (pin.currentUrl !== newUrl) {
            // URL changed - update currentUrl
            pin.currentUrl = newUrl;
            this.plugin.saveSettings(); // Async but we don't await
        }
    }

    async resetPinnedTabUrl(pinId: string): Promise<void> {
        await this.updatePinnedTabCurrentUrl(pinId, ''); // Clear it (logic handles empty check/undefined)
    }

    async savePinnedTabNewHomeUrl(pinId: string, newUrl: string): Promise<void> {
        const settings = this.getSettings();
        const pin = settings.pinnedTabs.find(p => p.id === pinId);
        if (!pin) return;

        pin.url = newUrl;
        pin.currentUrl = undefined; // Reset session

        // If note, we might want to update the URL property? 
        // User didn't explicitly ask for this, but "Remember title... because I want to give royalty points"
        // Updating the property source URL in the note seems risky/complex (which property?). skipping for now.

        await this.plugin.saveSettings();
        this.refreshState();
    }

    async reorderPinnedTabs(movedPinId: string, targetPinId: string): Promise<void> {
        const settings = this.getSettings();
        const fromIdx = settings.pinnedTabs.findIndex(p => p.id === movedPinId);
        const toIdx = settings.pinnedTabs.findIndex(p => p.id === targetPinId);

        if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return;

        const [moved] = settings.pinnedTabs.splice(fromIdx, 1);
        if (moved) settings.pinnedTabs.splice(toIdx, 0, moved);

        await this.plugin.saveSettings();
        this.refreshState();
    }

    async setPinnedTabLeaf(pinId: string, leafId: string): Promise<void> {
        const settings = this.getSettings();
        const pin = settings.pinnedTabs.find(p => p.id === pinId);
        if (!pin) return;

        pin.leafId = leafId;
        // If we are setting a leaf, we assume it starts at the home URL? 
        // Or should we trust the leaf's current URL?
        // Let scanAllWebViewers handle currentUrl sync. We just link the ID.

        await this.plugin.saveSettings();
        this.refreshState();
    }

    // --- Sync Logic ---

    private async syncAllPinnedNotes(): Promise<void> {
        if (!this.getSettings().enablePinnedTabs) return;

        const files = this.plugin.app.vault.getMarkdownFiles();
        for (const file of files) {
            this.syncPinnedStatusForFile(file);
        }
    }

    private syncPinnedStatusForFile(file: TFile): void {
        if (!this.getSettings().enablePinnedTabs) return;

        const cache = this.plugin.app.metadataCache.getFileCache(file);
        const frontmatter = cache?.frontmatter;

        const settings = this.getSettings();
        const key = settings.pinnedPropertyKey;
        const value = settings.pinnedPropertyValue;

        let hasPinProp = false;

        if (frontmatter) {
            const propVal = frontmatter[key];
            if (propVal) {
                if (Array.isArray(propVal)) {
                    hasPinProp = propVal.includes(value);
                } else {
                    hasPinProp = propVal === value;
                }
            }
        }

        // Check if already pinned
        const existingPin = settings.pinnedTabs.find(p => p.isNote && p.notePath === file.path);

        if (hasPinProp && !existingPin) {
            // Add pin (need to find URL first)
            // We reuse getVirtualTabs-like logic or just simpler logic
            this.createPinFromNote(file, frontmatter, settings);
        } else if (!hasPinProp && existingPin) {
            // Remove pin
            // Only if we trust the note is the source of truth? 
            // "Another option if it is enabled for the note property where it should update the status"
            // Implies property drives status.
            this.removePinnedTab(existingPin.id);
        }
    }

    private async createPinFromNote(file: TFile, frontmatter: unknown, settings: WebSidecarSettings) {
        // Find first valid URL
        let url: string | undefined;
        for (const field of settings.urlPropertyFields) {
            const val = (frontmatter as Record<string, unknown>)[field];
            if (typeof val === 'string' && val.startsWith('http')) {
                url = val;
                break;
            }
        }

        if (url) {
            const newPin: PinnedTab = {
                id: crypto.randomUUID(),
                url: url,
                title: file.basename, // Use note name for title? Or URL title? "The plugin should always remember the title of a pinned tab... even closed"
                isNote: true,
                notePath: file.path
            };
            settings.pinnedTabs.push(newPin);
            await this.plugin.saveSettings();
            this.refreshState();
        }
    }

    private async writePinnedProperty(filePath: string, add: boolean): Promise<void> {
        const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) return;

        await this.plugin.app.fileManager.processFrontMatter(file, (frontmatter) => {
            const settings = this.getSettings();
            const key = settings.pinnedPropertyKey;
            const value = settings.pinnedPropertyValue;

            let current = frontmatter[key];

            if (add) {
                if (!current) {
                    // Create new
                    // If key implies array (tags), make array
                    if (key === 'tags') {
                        frontmatter[key] = [value];
                    } else {
                        frontmatter[key] = value;
                    }
                } else if (Array.isArray(current)) {
                    if (!current.includes(value)) {
                        current.push(value);
                    }
                } else if (current !== value) {
                    // Conflict? Convert to array? Or overwrite? 
                    // Safe: convert to array if not tags?
                    // If 'status', maybe just overwrite.
                    if (key === 'tags') {
                        frontmatter[key] = [current, value];
                    } else {
                        frontmatter[key] = value;
                    }
                }
            } else {
                // Remove
                if (Array.isArray(current)) {
                    const idx = current.indexOf(value);
                    if (idx > -1) {
                        current.splice(idx, 1);
                        if (current.length === 0) delete frontmatter[key];
                    }
                } else if (current === value) {
                    delete frontmatter[key];
                }
            }
        });
    }

    /**
     * Update all notes linked to the old URL of a pinned tab to the new (current) URL.
     * Also updates the pinned tab's base URL to the new URL.
     */
    async updatePinnedTabNotes(pinId: string): Promise<void> {
        const settings = this.getSettings();
        const pin = settings.pinnedTabs.find(p => p.id === pinId);
        if (!pin || !pin.currentUrl || pin.currentUrl === pin.url) return;

        const oldUrl = pin.url;
        const newUrl = pin.currentUrl;

        // 1. Find all files linking to oldUrl
        const files = this.plugin.app.vault.getMarkdownFiles();
        let updatedCount = 0;

        for (const file of files) {
            await this.plugin.app.fileManager.processFrontMatter(file, (frontmatter) => {
                let changed = false;
                for (const field of settings.urlPropertyFields) {
                    const val = frontmatter[field];
                    if (!val) continue;

                    if (Array.isArray(val)) {
                        const idx = val.indexOf(oldUrl);
                        if (idx > -1) {
                            val[idx] = newUrl;
                            changed = true;
                        }
                    } else if (val === oldUrl) {
                        frontmatter[field] = newUrl;
                        changed = true;
                    }
                }
                if (changed) updatedCount++;
            });
        }

        // 2. Update the Pin itself to the new URL
        pin.url = newUrl;
        pin.currentUrl = undefined;

        // 3. Update note property on the pin source note if it exists
        if (pin.isNote && pin.notePath) {
            // The above loop likely handled it if the note linked to itself via URL property
        }

        await this.plugin.saveSettings();
        this.refreshState();
    }

    // --- Redirect Detection Logic ---

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
            await this.plugin.app.fileManager.processFrontMatter(file, (frontmatter) => {
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
