
import { setIcon } from 'obsidian';
import { IWebSidecarView, TrackedWebViewer, VirtualTab } from '../../../types';
import { ContextMenus } from '../ContextMenus';
import { NoteRenderer } from '../NoteRenderer';
import { SectionRenderer } from '../SectionRenderer';
import { BrowserTabItemRenderer } from './BrowserTabItemRenderer';

export class BrowserTabRenderer {
    private view: IWebSidecarView;
    private sectionRenderer: SectionRenderer;
    private itemRenderer: BrowserTabItemRenderer;

    constructor(
        view: IWebSidecarView,
        contextMenus: ContextMenus,
        noteRenderer: NoteRenderer,
        sectionRenderer: SectionRenderer
    ) {
        this.view = view;
        this.sectionRenderer = sectionRenderer;
        this.itemRenderer = new BrowserTabItemRenderer(view, contextMenus);
    }

    /**
     * Render browser-style tab list with favicon + title (compact mode)
     */
    renderBrowserModeTabList(container: HTMLElement, trackedTabs: TrackedWebViewer[], virtualTabs: VirtualTab[]): void {
        // Reuse header if exists
        let header = container.querySelector('.web-sidecar-browser-header') as HTMLElement;
        if (!header) {
            header = container.createDiv({ cls: 'web-sidecar-browser-header' });
            const controls = header.createDiv({ cls: 'web-sidecar-controls' });

            // Sort toggle
            const sortBtn = controls.createEl('button', {
                cls: 'web-sidecar-sort-btn clickable-icon',
                attr: {
                    'aria-label': `Sort by ${this.view.settings.tabSortOrder === 'focus' ? 'title' : 'recent'}`,
                    'title': `Currently: ${this.view.settings.tabSortOrder === 'focus' ? 'Recent first' : 'Alphabetical'}`
                }
            });
            setIcon(sortBtn, this.view.settings.tabSortOrder === 'focus' ? 'clock' : 'arrow-down-az');
            // Use onclick for idempotency
            sortBtn.onclick = async () => {
                this.view.setManualRefresh(true);
                this.view.settings.tabSortOrder = this.view.settings.tabSortOrder === 'focus' ? 'title' : 'focus';
                this.view.onRefresh();
            };

            // Refresh button
            const refreshBtn = controls.createEl('button', {
                cls: 'web-sidecar-refresh-btn clickable-icon',
                attr: { 'aria-label': 'Refresh' }
            });
            setIcon(refreshBtn, 'refresh-cw');
            refreshBtn.onclick = () => {
                this.view.setManualRefresh(true);
                this.view.onRefresh();
            };
        } else {
            // Update sort icon if exists
            const sortBtn = header.querySelector('.web-sidecar-sort-btn') as HTMLElement;
            if (sortBtn) {
                sortBtn.setAttribute('aria-label', `Sort by ${this.view.settings.tabSortOrder === 'focus' ? 'title' : 'recent'}`);
                sortBtn.setAttribute('title', `Currently: ${this.view.settings.tabSortOrder === 'focus' ? 'Recent first' : 'Alphabetical'}`);
                setIcon(sortBtn, this.view.settings.tabSortOrder === 'focus' ? 'clock' : 'arrow-down-az');
                // Ensure onclick is fresh
                sortBtn.onclick = async () => {
                    this.view.setManualRefresh(true);
                    this.view.settings.tabSortOrder = this.view.settings.tabSortOrder === 'focus' ? 'title' : 'focus';
                    this.view.onRefresh();
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

        if (this.view.settings.collapseDuplicateUrls) {
            groups = this.getGroupedTabs(trackedTabs);
        } else {
            groups = trackedTabs.map(t => ({ primary: t }));
        }

        // Reconciliation: Map existing grouped or single tab elements
        // Groups key: "group:<url>", Single key: "leaf:<leafId>"
        const currentElements = new Map<string, HTMLElement>();
        Array.from(tabListContainer.children).forEach((el) => {
            const htmlEl = el as HTMLElement;
            const key = htmlEl.getAttribute('data-tab-key');
            if (key) currentElements.set(key, htmlEl);
        });

        const newKeys = new Set<string>();

        // Render each group
        for (const group of groups) {
            const firstTab = group.primary;
            // Determine key
            const key = this.view.settings.collapseDuplicateUrls
                ? `group:${firstTab.url}`
                : `leaf:${firstTab.leafId}`;

            newKeys.add(key);

            let tabEl = currentElements.get(key);

            if (tabEl) {
                // UPDATE existing element in place
                this.itemRenderer.updateBrowserTab(tabEl, firstTab, group.all);
                // Ensure correct order in DOM
                tabListContainer.appendChild(tabEl);
            } else {
                // CREATE new element
                this.itemRenderer.renderBrowserTab(tabListContainer, firstTab, group.all);
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
        if (virtualTabs.length > 0) {
            if (!virtualSection) {
                virtualSection = container.createDiv({ cls: 'web-sidecar-virtual-section' });
            } else {
                virtualSection.empty(); // Clear existing content for full re-render
            }
            virtualSection.createEl('h5', { text: 'Opened web notes', cls: 'web-sidecar-section-title' });
            for (const virtualTab of virtualTabs) {
                this.itemRenderer.renderVirtualTab(virtualSection, virtualTab);
            }
        } else if (virtualSection) {
            virtualSection.remove(); // Remove section if no virtual tabs
        }

        // "+ New web viewer" button
        const newTabBtn = container.createDiv({ cls: 'web-sidecar-new-tab-btn' });
        const plusIcon = newTabBtn.createSpan({ cls: 'web-sidecar-new-tab-icon' });
        setIcon(plusIcon, 'plus');
        newTabBtn.createSpan({ text: 'New web viewer', cls: 'web-sidecar-new-tab-text' });
        newTabBtn.addEventListener('click', () => this.view.openNewWebViewer());

        // "Recent web notes" collapsible section at bottom
        this.sectionRenderer.renderRecentWebNotesSection(container);
    }

    private getGroupedTabs(tabs: TrackedWebViewer[]): Array<{ primary: TrackedWebViewer; all: TrackedWebViewer[]; hasPopout: boolean }> {
        const groups = new Map<string, TrackedWebViewer[]>();

        for (const tab of tabs) {
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
}
