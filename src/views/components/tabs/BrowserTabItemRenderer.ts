
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
        // Preserve the notes container and its expanded state
        const existingNotesContainer = tabEl.querySelector('.web-sidecar-browser-notes') as HTMLElement | null;
        const wasExpanded = !!(existingNotesContainer && !existingNotesContainer.hasClass('hidden'));

        // Remove only the tab row, keep notes container if it exists
        const existingRow = tabEl.querySelector('.web-sidecar-browser-tab-row');
        if (existingRow) existingRow.remove();

        // Rebuild the tab content, passing preserved state
        this.populateBrowserTab(tabEl, tab, allTabs, existingNotesContainer, wasExpanded);
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

    private populateBrowserTab(
        tabWrapper: HTMLElement,
        tab: TrackedWebViewer,
        allTabs?: TrackedWebViewer[],
        existingNotesContainer?: HTMLElement | null,
        wasExpanded?: boolean
    ): void {
        const isDeduped = allTabs && allTabs.length > 1;

        // Check if this tab is the currently active/focused one OR if active note is linked
        let activeLeaf = this.view.app.workspace.activeLeaf;

        // If the sidecar itself is active (e.g. user clicked sort button), fall back to last active leaf
        if (activeLeaf === this.view.leaf && this.view.lastActiveLeaf) {
            activeLeaf = this.view.lastActiveLeaf;
        }

        let isActive = false;
        if (activeLeaf) {
            // 1. Direct match (Web Viewer is active)
            // Use ID check if available for more robustness, fallback to object equality
            const activeLeafId = (activeLeaf as any).id;
            if (activeLeafId && tab.leafId === activeLeafId) {
                isActive = true;
            } else if (tab.leaf && activeLeaf === tab.leaf) {
                isActive = true;
            }

            // 2. Linked Note match (Note is active)
            if (!isActive && activeLeaf.view.getViewType() === 'markdown') {
                // Matches - compute early so we know if expandable AND for active check checking
                const matches = findMatchingNotes(this.view.app, tab.url, this.view.settings, this.view.urlIndex);
                const view = activeLeaf.view as any; // Cast to access file safely
                if (view.file) {
                    const activePath = view.file.path;
                    // Check if active note is in our matches
                    if (matches.exactMatches.some(m => m.file.path === activePath)) {
                        isActive = true;
                    }
                }
            }
        }

        // Apply active class to wrapper
        tabWrapper.removeClass('is-active');
        if (isActive) {
            tabWrapper.addClass('is-active');
        }

        // Matches - compute early so we know if expandable
        const matches = findMatchingNotes(this.view.app, tab.url, this.view.settings, this.view.urlIndex);
        const exactCount = matches.exactMatches.length;
        const hasSameDomain = this.view.settings.enableTldSearch && matches.tldMatches.length > 0;
        const hasExpandableContent = exactCount > 0 || hasSameDomain;

        // Notes container - create/reuse early so onclick can reference it
        let notesContainer: HTMLElement | null = null;
        let expandBtn: HTMLElement | null = null;

        if (hasExpandableContent) {
            if (existingNotesContainer) {
                notesContainer = existingNotesContainer;
            } else {
                notesContainer = tabWrapper.createDiv({ cls: 'web-sidecar-browser-notes hidden' });
            }
        }

        // Main tab row - insert at beginning so it's before the notes container
        const tabRow = tabWrapper.createDiv({ cls: 'web-sidecar-browser-tab-row' });
        if (notesContainer) {
            // Insert row before the notes container to maintain order
            tabWrapper.insertBefore(tabRow, notesContainer);
        }

        // Helper function to toggle expand state
        const toggleExpand = () => {
            if (!notesContainer || !expandBtn) return;
            const isExpanded = !notesContainer.hasClass('hidden');
            notesContainer.toggleClass('hidden', isExpanded);
            expandBtn.empty();
            setIcon(expandBtn, isExpanded ? 'chevron-right' : 'chevron-down');

            if (!isExpanded && notesContainer.children.length === 0) {
                this.renderBrowserTabNotes(notesContainer, tab.url, matches);
            }
        };

        tabRow.onclick = async (e) => {
            if ((e.target as HTMLElement).closest('.web-sidecar-expand-btn')) return;
            if ((e.target as HTMLElement).closest('.web-sidecar-inline-new-note')) return;

            // Check if tab is already focused - if so, toggle expand instead
            if (hasExpandableContent && tab.leaf) {
                const activeLeaf = this.view.app.workspace.activeLeaf;
                let isAlreadyActive = false;

                if (activeLeaf) {
                    const activeLeafId = (activeLeaf as any).id;
                    if (activeLeafId && tab.leafId === activeLeafId) {
                        isAlreadyActive = true;
                    } else if (activeLeaf === tab.leaf) {
                        isAlreadyActive = true;
                    }
                }

                if (isAlreadyActive) {
                    // Already focused, toggle expand
                    toggleExpand();
                    return;
                }
            }

            // Not focused - focus the tab
            // Wrap in setTimeout to ensure the click event finishes and focus isn't stolen back by the sidecar
            setTimeout(() => {
                if (isDeduped && allTabs) {
                    this.view.focusNextInstance(tab.url, allTabs);
                } else {
                    this.view.focusTab(tab);
                }
            }, 50);
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

        // Pop-out icon
        const showPopout = isDeduped ? allTabs!.some(t => t.isPopout) : tab.isPopout;
        if (showPopout) {
            const popoutIcon = tabRow.createSpan({ cls: 'web-sidecar-popout-icon' });
            setIcon(popoutIcon, 'picture-in-picture-2');
            popoutIcon.setAttribute('aria-label', 'In popout window');
        }

        // Tab count
        if (isDeduped && allTabs) {
            tabRow.createSpan({
                text: `${allTabs.length}`,
                cls: 'web-sidecar-tab-count-badge',
                attr: {
                    'aria-label': `${allTabs.length} tabs`
                }
            });
        }

        // Note count
        if (exactCount > 0) {
            tabRow.createSpan({
                text: exactCount.toString(),
                cls: 'web-sidecar-note-count-badge',
                attr: {
                    'aria-label': exactCount === 1 ? '1 Note' : `${exactCount} Notes`
                }
            });
        }

        // Inline new note
        if (exactCount === 0) {
            const newNoteBtn = tabRow.createDiv({ cls: 'web-sidecar-inline-new-note clickable-icon' });
            setIcon(newNoteBtn, 'file-plus');
            newNoteBtn.setAttribute('aria-label', 'New Note');
            newNoteBtn.onclick = (e) => {
                e.stopPropagation();
                this.view.openCreateNoteModal(tab.url);
            };
        }

        // Expand button - now just needs to set up the button since container already exists
        if (hasExpandableContent && notesContainer) {
            expandBtn = tabRow.createDiv({ cls: 'web-sidecar-expand-btn clickable-icon' });

            // Set icon based on preserved state
            if (existingNotesContainer && wasExpanded) {
                setIcon(expandBtn, 'chevron-down');
            } else {
                setIcon(expandBtn, 'chevron-right');
            }

            expandBtn.onclick = (e) => {
                e.stopPropagation();
                toggleExpand();
            };

            // Auto-populate content if container is expanded but empty
            // This handles bulk expand and preserved expanded state
            const isExpanded = notesContainer && !notesContainer.hasClass('hidden');
            if (isExpanded && notesContainer.children.length === 0) {
                this.renderBrowserTabNotes(notesContainer, tab.url, matches);
            }
        }
    }

    private renderBrowserTabNotes(container: HTMLElement, url: string, matches: import('../../../types').MatchResult): void {
        // 1. Exact matches first
        if (matches.exactMatches.length > 0) {
            const exactList = container.createEl('ul', { cls: 'web-sidecar-browser-note-list' });
            for (const match of matches.exactMatches) {
                const li = exactList.createEl('li');

                // Check if this note is the currently focused leaf
                let activeLeaf = this.view.app.workspace.activeLeaf;
                if (activeLeaf === this.view.leaf && this.view.lastActiveLeaf) {
                    activeLeaf = this.view.lastActiveLeaf;
                }
                const isNoteFocused = activeLeaf?.view?.getViewType() === 'markdown'
                    && (activeLeaf.view as any)?.file?.path === match.file.path;

                if (isNoteFocused) {
                    li.addClass('is-focused');
                }

                const link = li.createEl('a', {
                    text: match.file.basename,
                    cls: 'web-sidecar-browser-note-link',
                    attr: { href: '#' }
                });

                // Check if note has multiple open instances for cycling
                link.addEventListener('click', (e) => {
                    e.preventDefault();
                    const openLeaves = this.view.app.workspace.getLeavesOfType('markdown')
                        .filter(leaf => (leaf.view as any).file?.path === match.file.path);

                    if (openLeaves.length > 1) {
                        // Multiple instances - use cycling
                        this.view.focusNextNoteInstance(match.file.path);
                    } else {
                        // No cycle needed, open smartly
                        this.view.openNoteSmartly(match.file, e);
                    }
                });

                li.addEventListener('contextmenu', (e) => this.contextMenus.showNoteContextMenu(e, match.file, match.url));
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

        // 3. Same domain notes (if enabled) - collapsible section
        if (this.view.settings.enableTldSearch && matches.tldMatches.length > 0) {
            const domain = extractDomain(url);
            let headerText = `More web notes (${domain || 'this domain'})`;
            if (this.view.settings.enableSubredditFilter) {
                const subreddit = extractSubreddit(url);
                if (subreddit) {
                    headerText = `More web notes (${subreddit})`;
                }
            }

            // Create collapsible details element
            const details = container.createEl('details', { cls: 'web-sidecar-tld-section' });
            const summary = details.createEl('summary', { cls: 'web-sidecar-browser-subtitle' });
            summary.createSpan({ text: headerText });

            const domainList = details.createEl('ul', { cls: 'web-sidecar-browser-note-list' });
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
