
import { setIcon } from 'obsidian';
import { extractDomain } from '../../../services/urlUtils';
import { findMatchingNotes, extractSubreddit } from '../../../services/noteMatcher';
import { IWebSidecarView, TrackedWebViewer, VirtualTab } from '../../../types';
import { ContextMenus } from '../ContextMenus';

export class BrowserTabItemRenderer {
    private view: IWebSidecarView;
    private contextMenus: ContextMenus;

    constructor(view: IWebSidecarView, contextMenus: ContextMenus) {
        this.view = view;
        this.contextMenus = contextMenus;
    }

    renderBrowserTab(container: HTMLElement, tab: TrackedWebViewer, allTabs?: TrackedWebViewer[]): void {
        const tabWrapper = container.createDiv({ cls: 'web-sidecar-browser-tab' });
        this.populateBrowserTab(tabWrapper, tab, allTabs);
    }

    updateBrowserTab(tabEl: HTMLElement, tab: TrackedWebViewer, allTabs?: TrackedWebViewer[]): void {
        tabEl.empty();
        this.populateBrowserTab(tabEl, tab, allTabs);
    }

    renderVirtualTab(container: HTMLElement, virtualTab: VirtualTab): void {
        const tabWrapper = container.createDiv({ cls: 'web-sidecar-browser-tab' });
        const tabRow = tabWrapper.createDiv({ cls: 'web-sidecar-browser-tab-row' });

        // Click -> Open web viewer
        tabRow.onclick = async () => {
            const leaf = this.view.app.workspace.getLeaf('tab');
            await leaf.setViewState({
                type: 'webviewer',
                state: { url: virtualTab.url, navigate: true }
            });
            this.view.app.workspace.revealLeaf(leaf);
        };

        // Context menu for virtual tab
        tabRow.oncontextmenu = (e) => this.contextMenus.showVirtualTabContextMenu(e, virtualTab.url, virtualTab.file);

        const domain = extractDomain(virtualTab.url);

        // Favicon (Same styling as browser tab)
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

        // Title (Italicized)
        const displayTitle = virtualTab.cachedTitle || domain || virtualTab.url;
        const titleSpan = tabRow.createSpan({
            text: displayTitle,
            cls: 'web-sidecar-browser-tab-title'
        });
        titleSpan.style.fontStyle = 'italic';
        titleSpan.style.opacity = '0.9'; // Slight visual differentiation

        // Match handling for counts and expand logic
        const matches = findMatchingNotes(this.view.app, virtualTab.url, this.view.settings, this.view.urlIndex);
        const exactCount = matches.exactMatches.length;
        const hasSameDomain = this.view.settings.enableTldSearch && matches.tldMatches.length > 0;

        // Note count badge
        if (exactCount > 0) {
            tabRow.createSpan({
                text: exactCount.toString(),
                cls: 'web-sidecar-note-count-badge',
                attr: {
                    'aria-label': exactCount === 1 ? '1 Note' : `${exactCount} Notes`,
                    'title': exactCount === 1 ? '1 Note' : `${exactCount} Notes`
                }
            });
        }

        // Inline new note (unlikely for virtual tab since it IS a note, but good for consistency)
        if (exactCount === 0) {
            const newNoteBtn = tabRow.createDiv({ cls: 'web-sidecar-inline-new-note clickable-icon' });
            setIcon(newNoteBtn, 'file-plus');
            newNoteBtn.onclick = (e) => {
                e.stopPropagation();
                this.view.openCreateNoteModal(virtualTab.url);
            };
        }

        // Expand button
        if (exactCount > 0 || hasSameDomain) {
            const expandBtn = tabRow.createDiv({ cls: 'web-sidecar-expand-btn clickable-icon' });
            setIcon(expandBtn, 'chevron-right');

            const notesContainer = tabWrapper.createDiv({ cls: 'web-sidecar-browser-notes hidden' });

            expandBtn.onclick = (e) => {
                e.stopPropagation();
                const isExpanded = !notesContainer.hasClass('hidden');
                notesContainer.toggleClass('hidden', isExpanded);
                expandBtn.empty();
                setIcon(expandBtn, isExpanded ? 'chevron-right' : 'chevron-down');

                if (!isExpanded && notesContainer.children.length === 0) {
                    this.renderBrowserTabNotes(notesContainer, virtualTab.url, matches);
                }
            };
        }
    }

    private populateBrowserTab(tabWrapper: HTMLElement, tab: TrackedWebViewer, allTabs?: TrackedWebViewer[]): void {
        const isDeduped = allTabs && allTabs.length > 1;

        // Main tab row
        const tabRow = tabWrapper.createDiv({ cls: 'web-sidecar-browser-tab-row' });

        tabRow.onclick = (e) => {
            if ((e.target as HTMLElement).closest('.web-sidecar-expand-btn')) return;
            if (isDeduped && allTabs) {
                this.view.focusNextInstance(tab.url, allTabs);
            } else {
                this.view.focusTab(tab);
            }
        };
        tabRow.oncontextmenu = (e) => this.contextMenus.showWebViewerContextMenu(e, tab);

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

        // Title
        tabRow.createSpan({
            text: tab.title || domain || 'Untitled',
            cls: 'web-sidecar-browser-tab-title'
        });

        // Matches
        const matches = findMatchingNotes(this.view.app, tab.url, this.view.settings, this.view.urlIndex);
        const exactCount = matches.exactMatches.length;
        const hasSameDomain = this.view.settings.enableTldSearch && matches.tldMatches.length > 0;

        // Pop-out icon
        const showPopout = isDeduped ? allTabs!.some(t => t.isPopout) : tab.isPopout;
        if (showPopout) {
            const popoutIcon = tabRow.createSpan({ cls: 'web-sidecar-popout-icon' });
            setIcon(popoutIcon, 'picture-in-picture-2');
            popoutIcon.setAttribute('aria-label', 'In popout window');
            popoutIcon.setAttribute('title', 'In popout window');
        }

        // Tab count
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

        // Note count
        if (exactCount > 0) {
            tabRow.createSpan({
                text: exactCount.toString(),
                cls: 'web-sidecar-note-count-badge',
                attr: {
                    'aria-label': exactCount === 1 ? '1 Note' : `${exactCount} Notes`,
                    'title': exactCount === 1 ? '1 Note' : `${exactCount} Notes`
                }
            });
        }

        // Inline new note
        if (exactCount === 0) {
            const newNoteBtn = tabRow.createDiv({ cls: 'web-sidecar-inline-new-note clickable-icon' });
            setIcon(newNoteBtn, 'file-plus');
            newNoteBtn.setAttribute('aria-label', 'New Note');
            newNoteBtn.setAttribute('title', 'New Note');
            newNoteBtn.onclick = (e) => {
                e.stopPropagation();
                this.view.openCreateNoteModal(tab.url);
            };
        }

        // Expand
        if (exactCount > 0 || hasSameDomain) {
            const expandBtn = tabRow.createDiv({ cls: 'web-sidecar-expand-btn clickable-icon' });
            setIcon(expandBtn, 'chevron-right');

            const notesContainer = tabWrapper.createDiv({ cls: 'web-sidecar-browser-notes hidden' });

            expandBtn.onclick = (e) => {
                e.stopPropagation();
                const isExpanded = !notesContainer.hasClass('hidden');
                notesContainer.toggleClass('hidden', isExpanded);
                expandBtn.empty();
                setIcon(expandBtn, isExpanded ? 'chevron-right' : 'chevron-down');

                if (!isExpanded && notesContainer.children.length === 0) {
                    this.renderBrowserTabNotes(notesContainer, tab.url, matches);
                }
            };
        }
    }

    private renderBrowserTabNotes(container: HTMLElement, url: string, matches: import('../../../types').MatchResult): void {
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
                    this.view.openNoteSmartly(match.file, e);
                });
                link.addEventListener('contextmenu', (e) => this.contextMenus.showNoteContextMenu(e, match.file, match.url));
            }
        }

        // 2. New Note button (always show)
        const newNoteBtn = container.createDiv({ cls: 'web-sidecar-new-note-btn' });
        const noteIcon = newNoteBtn.createSpan({ cls: 'web-sidecar-new-note-icon' });
        setIcon(noteIcon, 'file-plus');
        newNoteBtn.createSpan({ text: 'New Note', cls: 'web-sidecar-new-note-text' });
        newNoteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.view.openCreateNoteModal(url);
        });

        // 3. Same domain notes (if enabled)
        if (this.view.settings.enableTldSearch && matches.tldMatches.length > 0) {
            container.createEl('div', { cls: 'web-sidecar-browser-separator' });

            let headerText = 'More from this domain';
            if (this.view.settings.enableSubredditFilter) {
                const subreddit = extractSubreddit(url);
                if (subreddit) {
                    headerText = `More from ${subreddit}`;
                }
            }

            container.createEl('h6', {
                text: headerText,
                cls: 'web-sidecar-browser-subtitle'
            });

            const domainList = container.createEl('ul', { cls: 'web-sidecar-browser-note-list' });
            for (const match of matches.tldMatches) {
                const li = domainList.createEl('li');
                const link = li.createEl('a', {
                    text: match.file.basename,
                    cls: 'web-sidecar-browser-note-link web-sidecar-muted',
                    attr: { href: '#' }
                });
                link.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.view.openNoteSmartly(match.file, e);
                });
                link.addEventListener('contextmenu', (e) => this.contextMenus.showNoteContextMenu(e, match.file, match.url));
            }
        }
    }
}
