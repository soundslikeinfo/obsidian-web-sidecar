
import { setIcon } from 'obsidian';
import { extractDomain } from '../../../services/urlUtils';
import { findMatchingNotes, extractSubreddit } from '../../../services/noteMatcher';
import { IWebSidecarView, TrackedWebViewer, VirtualTab } from '../../../types';
import { ContextMenus } from '../ContextMenus';
import { NoteRenderer } from '../NoteRenderer';
import { SectionRenderer } from '../SectionRenderer';

export class TabListRenderer {
    private view: IWebSidecarView;
    private contextMenus: ContextMenus;
    private noteRenderer: NoteRenderer;
    private sectionRenderer: SectionRenderer;

    constructor(
        view: IWebSidecarView,
        contextMenus: ContextMenus,
        noteRenderer: NoteRenderer,
        sectionRenderer: SectionRenderer
    ) {
        this.view = view;
        this.contextMenus = contextMenus;
        this.noteRenderer = noteRenderer;
        this.sectionRenderer = sectionRenderer;
    }

    /**
     * Render the list of all tracked tabs
     */
    renderTabList(container: HTMLElement, trackedTabs: TrackedWebViewer[], virtualTabs: VirtualTab[]): void {
        // Header with count and controls
        const header = container.createDiv({ cls: 'web-sidecar-header' });
        const headerRow = header.createDiv({ cls: 'web-sidecar-header-row' });
        headerRow.createEl('h4', { text: `Open Tabs (${trackedTabs.length})` });

        const controls = headerRow.createDiv({ cls: 'web-sidecar-controls' });

        // Sort toggle
        const sortBtn = controls.createEl('button', {
            cls: 'web-sidecar-sort-btn clickable-icon',
            attr: {
                'aria-label': `Sort by ${this.view.settings.tabSortOrder === 'focus' ? 'title' : 'recent'}`,
                'title': `Currently: ${this.view.settings.tabSortOrder === 'focus' ? 'Recent first' : 'Alphabetical'}`
            }
        });
        setIcon(sortBtn, this.view.settings.tabSortOrder === 'focus' ? 'clock' : 'arrow-down-az');
        sortBtn.addEventListener('click', async () => {
            this.view.setManualRefresh(true);
            // Updating settings via settings object directly (reference)
            this.view.settings.tabSortOrder = this.view.settings.tabSortOrder === 'focus' ? 'title' : 'focus';
            this.view.onRefresh();
        });

        // Refresh button
        const refreshBtn = controls.createEl('button', {
            cls: 'web-sidecar-refresh-btn clickable-icon',
            attr: { 'aria-label': 'Refresh' }
        });
        setIcon(refreshBtn, 'refresh-cw');
        refreshBtn.addEventListener('click', () => this.view.onRefresh());

        // Render each tab (with deduplication if enabled)
        if (this.view.settings.collapseDuplicateUrls) {
            const grouped = this.getGroupedTabs(trackedTabs);
            for (const group of grouped) {
                this.renderTabEntry(container, group.primary, group.all);
            }
        } else {
            for (const tab of trackedTabs) {
                this.renderTabEntry(container, tab);
            }
        }

        // Render virtual tabs (from open notes with URLs)
        if (virtualTabs.length > 0) {
            const virtualSection = container.createDiv({ cls: 'web-sidecar-virtual-section' });
            virtualSection.createEl('h5', { text: 'Open Notes with URLs', cls: 'web-sidecar-section-title' });
            for (const virtualTab of virtualTabs) {
                this.renderVirtualTab(virtualSection, virtualTab);
            }
        }

        // "+ New web viewer" button (same style as browser mode)
        const newTabBtn = container.createDiv({ cls: 'web-sidecar-new-tab-btn' });
        const plusIcon = newTabBtn.createSpan({ cls: 'web-sidecar-new-tab-icon' });
        setIcon(plusIcon, 'plus');
        newTabBtn.createSpan({ text: 'New web viewer', cls: 'web-sidecar-new-tab-text' });
        newTabBtn.addEventListener('click', () => this.view.openNewWebViewer());

        // "Recent web notes" collapsible section
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

    private renderTabEntry(container: HTMLElement, tab: TrackedWebViewer, allTabs?: TrackedWebViewer[]): void {
        const tabSection = container.createDiv({ cls: 'web-sidecar-tab-entry' });
        const isDeduped = allTabs && allTabs.length > 1;

        // Tab header with favicon and title - clickable to focus the web viewer
        const tabHeader = tabSection.createDiv({ cls: 'web-sidecar-tab-header clickable' });
        tabHeader.addEventListener('click', (e) => {
            // Don't trigger if clicking on the create button
            if ((e.target as HTMLElement).closest('.web-sidecar-create-btn-small')) return;
            if (isDeduped && allTabs) {
                this.view.focusNextInstance(tab.url, allTabs);
            } else {
                this.view.focusTab(tab);
            }
        });
        tabHeader.addEventListener('contextmenu', (e) => this.contextMenus.showWebViewerContextMenu(e, tab));

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
                favicon.addClass('web-sidecar-hidden');
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
            indicators.createSpan({
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
            this.view.openCreateNoteModal(tab.url);
        });

        // Find matches for this tab
        const matches = findMatchingNotes(this.view.app, tab.url, this.view.settings, this.view.urlIndex);
        const hasMatches = matches.exactMatches.length > 0 || matches.tldMatches.length > 0;

        if (hasMatches) {
            // Exact matches
            if (matches.exactMatches.length > 0) {
                const matchList = tabSection.createEl('ul', { cls: 'web-sidecar-list web-sidecar-exact' });
                for (const match of matches.exactMatches) {
                    this.noteRenderer.renderNoteItem(matchList, match.file, match.url);
                }
            }

            // TLD matches (collapsible)
            if (this.view.settings.enableTldSearch && matches.tldMatches.length > 0) {
                const details = tabSection.createEl('details', { cls: 'web-sidecar-tld-matches' });
                const summary = details.createEl('summary');

                // Dynamic header text based on subreddit filter
                let headerText = `More notes from this domain (${matches.tldMatches.length})`;
                if (this.view.settings.enableSubredditFilter) {
                    const subreddit = extractSubreddit(tab.url);
                    if (subreddit) {
                        headerText = `More notes from ${subreddit} (${matches.tldMatches.length})`;
                    }
                }

                summary.createSpan({ text: headerText });

                const matchList = details.createEl('ul', { cls: 'web-sidecar-list' });
                for (const match of matches.tldMatches) {
                    this.noteRenderer.renderNoteItem(matchList, match.file, match.url);
                }
            }

            // Subreddit Explorer Groups
            if (this.view.settings.enableSubredditExplorer && matches.subredditMatches && matches.subredditMatches.size > 0) {
                const explorerSection = tabSection.createDiv({ cls: 'web-sidecar-subreddit-explorer' });

                matches.subredditMatches.forEach((notes, subreddit) => {
                    if (notes.length === 0) return;

                    const details = explorerSection.createEl('details', { cls: 'web-sidecar-subreddit-group' });

                    const summary = details.createEl('summary');

                    // Flex container for summary
                    const summaryContent = summary.createDiv({ cls: 'web-sidecar-summary-content' });

                    // Reddit Favicon
                    summaryContent.createEl('img', {
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
                        this.noteRenderer.renderNoteItem(matchList, match.file, match.url);
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

    private renderVirtualTab(container: HTMLElement, virtualTab: VirtualTab): void {
        const tabSection = container.createDiv({ cls: 'web-sidecar-tab-entry web-sidecar-virtual-tab' });

        const tabHeader = tabSection.createDiv({ cls: 'web-sidecar-tab-header clickable' });
        tabHeader.addEventListener('click', async () => {
            const leaf = this.view.app.workspace.getLeaf('tab');
            await leaf.setViewState({
                type: 'webviewer',
                state: { url: virtualTab.url, navigate: true }
            });
            this.view.app.workspace.revealLeaf(leaf);
        });

        const domain = extractDomain(virtualTab.url);

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

        const tabInfo = tabHeader.createDiv({ cls: 'web-sidecar-tab-info' });
        const displayTitle = virtualTab.cachedTitle || domain || virtualTab.url;
        const hasCachedTitle = !!virtualTab.cachedTitle;
        tabInfo.createEl('span', {
            text: displayTitle,
            cls: hasCachedTitle ? 'web-sidecar-tab-title web-sidecar-virtual-title' : 'web-sidecar-tab-title web-sidecar-virtual-title'
        });

        tabInfo.createEl('span', {
            text: virtualTab.file.basename,
            cls: 'web-sidecar-virtual-note-name'
        });
    }
}
