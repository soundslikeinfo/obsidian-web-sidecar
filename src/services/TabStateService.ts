
import { Plugin, WorkspaceLeaf, MarkdownView } from 'obsidian';
import type { WebSidecarSettings, TrackedWebViewer, VirtualTab } from '../types';

/**
 * Supported web viewer types
 */
const WEB_VIEW_TYPES = ['webviewer', 'surfing-view'];

/**
 * Polling interval for URL changes (ms)
 */
const POLL_INTERVAL = 500;

export class TabStateService {
    private plugin: Plugin;
    private getSettings: () => WebSidecarSettings;
    private onStateChange: () => void;

    private trackedTabs: Map<string, TrackedWebViewer> = new Map();
    private urlTitleCache: Map<string, string> = new Map();
    private pollIntervalId: number | null = null;

    constructor(
        plugin: Plugin,
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

        // Initial scan
        this.scanAllWebViewers();
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
        const tabs = Array.from(this.trackedTabs.values());
        const settings = this.getSettings();

        switch (settings.tabSortOrder) {
            case 'title':
                return tabs.sort((a, b) => a.title.localeCompare(b.title));
            case 'focus':
            default:
                return tabs.sort((a, b) => b.lastFocused - a.lastFocused);
        }
    }

    /**
     * Get virtual tabs from open notes with URL properties
     */
    getVirtualTabs(): VirtualTab[] {
        const virtualTabs: VirtualTab[] = [];
        const openUrls = new Set(Array.from(this.trackedTabs.values()).map(t => t.url));
        const settings = this.getSettings();

        // Get all open markdown leaves
        const markdownLeaves = this.plugin.app.workspace.getLeavesOfType('markdown');

        for (const leaf of markdownLeaves) {
            const view = leaf.view;
            if (!(view instanceof MarkdownView)) continue;

            const file = view.file;
            if (!file) continue;

            // Get frontmatter
            const cache = this.plugin.app.metadataCache.getFileCache(file);
            const frontmatter = cache?.frontmatter;
            if (!frontmatter) continue;

            // Check each URL property field
            for (const propName of settings.urlPropertyFields) {
                const propValue = frontmatter[propName];
                if (typeof propValue === 'string' && propValue.startsWith('http')) {
                    // Skip if URL is already open in a web viewer
                    if (openUrls.has(propValue)) continue;

                    virtualTabs.push({
                        file,
                        url: propValue,
                        propertyName: propName,
                        cachedTitle: this.urlTitleCache.get(propValue),
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
            const leafId = (leaf as any).id || leaf.view.getViewType() + '-' + leaves.indexOf(leaf);
            const info = this.getWebViewerInfo(leaf);

            if (info) {
                // Detect if leaf is in a popout window
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
                    }
                } else {
                    // New tab
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
        }
    }

    /**
     * Remove tabs that are no longer open
     */
    private cleanupClosedTabs(): void {
        const leaves = this.plugin.app.workspace.getLeavesOfType('webviewer')
            .concat(this.plugin.app.workspace.getLeavesOfType('surfing-view'));

        const activeLeafIds = new Set(
            leaves.map((leaf, index) => (leaf as any).id || leaf.view.getViewType() + '-' + index)
        );

        for (const leafId of this.trackedTabs.keys()) {
            if (!activeLeafIds.has(leafId)) {
                this.trackedTabs.delete(leafId);
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
            const leafId = (leaf as any).id || viewType + '-0';
            const info = this.getWebViewerInfo(leaf);

            if (info) {
                // Detect if leaf is in a popout window
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
}
