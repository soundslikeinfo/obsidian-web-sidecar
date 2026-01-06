
import { setIcon } from 'obsidian';
import { extractDomain } from '../../../services/urlUtils';
import { findMatchingNotes, extractSubreddit } from '../../../services/noteMatcher';
import { IWebSidecarView, TrackedWebViewer, VirtualTab } from '../../../types';
import { ContextMenus } from '../ContextMenus';

export class LinkedNotesTabItemRenderer {
    private view: IWebSidecarView;
    private contextMenus: ContextMenus;
    private isBasicMode: boolean = false;

    constructor(view: IWebSidecarView, contextMenus: ContextMenus) {
        this.view = view;
        this.contextMenus = contextMenus;
    }

    setBasicMode(basic: boolean): void {
        this.isBasicMode = basic;
    }

    renderLinkedNotesTab(container: HTMLElement, tab: TrackedWebViewer, allTabs?: TrackedWebViewer[]): void {
        const tabWrapper = container.createDiv({ cls: 'web-sidecar-linked-notes-tab' });
        this.populateLinkedNotesTab(tabWrapper, tab, allTabs);
    }

    updateLinkedNotesTab(tabEl: HTMLElement, tab: TrackedWebViewer, allTabs?: TrackedWebViewer[]): void {
        // Preserve the notes container and its expanded state
        const existingNotesContainer = tabEl.querySelector('.web-sidecar-linked-notes-notes') as HTMLElement | null;
        const wasExpanded = !!(existingNotesContainer && !existingNotesContainer.hasClass('hidden'));

        // Remove only the tab row, keep notes container if it exists
        const existingRow = tabEl.querySelector('.web-sidecar-linked-notes-tab-row');
        if (existingRow) existingRow.remove();

        // Rebuild the tab content, passing preserved state
        this.populateLinkedNotesTab(tabEl, tab, allTabs, existingNotesContainer, wasExpanded);
    }

    renderVirtualTab(container: HTMLElement, virtualTab: VirtualTab): void {
        const tabWrapper = container.createDiv({ cls: 'web-sidecar-linked-notes-tab' });
        const tabRow = tabWrapper.createDiv({ cls: 'web-sidecar-linked-notes-tab-row' });

        // Click -> Open web viewer and track original URL for redirect detection
        tabRow.onclick = async (e) => {
            const originalUrl = virtualTab.url;

            // Set pending original URL BEFORE opening - this gets applied when the new tab is registered
            this.view.setPendingOriginalUrl(originalUrl);

            await this.view.openUrlSmartly(originalUrl, e as MouseEvent);
        };

        // Context menu for virtual tab
        tabRow.oncontextmenu = (e) => this.contextMenus.showVirtualTabContextMenu(e, virtualTab.url, virtualTab.file);

        const domain = extractDomain(virtualTab.url);

        // Favicon (Same styling as linked tab)
        const faviconContainer = tabRow.createDiv({ cls: 'web-sidecar-linked-notes-favicon' });
        // Skip favicon for internal pages
        const isInternal = virtualTab.url.startsWith('about:') || virtualTab.url.startsWith('chrome:') || virtualTab.url.startsWith('obsidian:');

        if (domain && !isInternal) {
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
            cls: 'web-sidecar-linked-notes-tab-title web-sidecar-virtual-tab-title'
        });

        // Match handling for counts and expand logic
        const matches = findMatchingNotes(this.view.app, virtualTab.url, this.view.settings, this.view.urlIndex);
        const exactCount = matches.exactMatches.length;
        const hasSameDomain = this.view.settings.enableTldSearch && matches.tldMatches.length > 0;

        // Note count badge (skip in basic mode)
        if (!this.isBasicMode && exactCount > 0) {
            tabRow.createSpan({
                text: exactCount.toString(),
                cls: 'web-sidecar-note-count-badge',
                attr: {
                    'aria-label': exactCount === 1 ? '1 Note' : `${exactCount} Notes`,
                    'title': exactCount === 1 ? '1 Note' : `${exactCount} Notes`
                }
            });
        }

        // Inline new note (skip in basic mode)
        if (!this.isBasicMode && exactCount === 0) {
            const newNoteBtn = tabRow.createDiv({ cls: 'web-sidecar-inline-new-note clickable-icon' });
            setIcon(newNoteBtn, 'file-plus');
            newNoteBtn.onclick = (e) => {
                e.stopPropagation();
                this.view.openCreateNoteModal(virtualTab.url);
            };
        }

        // Expand button (skip in basic mode)
        if (!this.isBasicMode && (exactCount > 0 || hasSameDomain)) {
            const expandBtn = tabRow.createDiv({ cls: 'web-sidecar-expand-btn clickable-icon' });
            const key = `virtual:${virtualTab.url}`;
            const isExpanded = this.view.expandedGroupIds.has(key);

            setIcon(expandBtn, isExpanded ? 'chevron-down' : 'chevron-right');

            const notesContainer = tabWrapper.createDiv({ cls: 'web-sidecar-linked-notes-notes' });
            if (!isExpanded) notesContainer.addClass('hidden');
            else {
                this.renderLinkedNotesTabNotes(notesContainer, virtualTab.url, matches);
            }

            expandBtn.onclick = (e) => {
                e.stopPropagation();
                const newState = !this.view.expandedGroupIds.has(key);
                this.view.setGroupExpanded(key, newState);
                this.view.render(true);
            };
        }
    }

    private populateLinkedNotesTab(
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
            const activeLeafId = (activeLeaf as any).id;

            // 1. Direct match (Web Viewer is active)
            // For grouped tabs, check if ANY tab in the group is the active leaf
            if (isDeduped && allTabs) {
                isActive = allTabs.some(t => {
                    if (activeLeafId && t.leafId === activeLeafId) return true;
                    if (t.leaf && activeLeaf === t.leaf) return true;
                    return false;
                });
            } else {
                // Single tab - check just this one
                if (activeLeafId && tab.leafId === activeLeafId) {
                    isActive = true;
                } else if (tab.leaf && activeLeaf === tab.leaf) {
                    isActive = true;
                }
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
        // In basic mode, we don't show expandable content
        const hasExpandableContent = !this.isBasicMode && (exactCount > 0 || hasSameDomain);

        // Notes container - create/reuse early so onclick can reference it
        let notesContainer: HTMLElement | null = null;
        let expandBtn: HTMLElement | null = null;

        if (hasExpandableContent) {
            if (existingNotesContainer) {
                notesContainer = existingNotesContainer;
            } else {
                notesContainer = tabWrapper.createDiv({ cls: 'web-sidecar-linked-notes-notes hidden' });
            }
        }

        // Main tab row - insert at beginning so it's before the notes container
        const tabRow = tabWrapper.createDiv({ cls: 'web-sidecar-linked-notes-tab-row' });
        if (notesContainer) {
            // Insert row before the notes container to maintain order
            tabWrapper.insertBefore(tabRow, notesContainer);
        }

        // Drag-and-drop - always enabled, auto-switches to manual mode when used
        tabWrapper.setAttribute('draggable', 'true');
        tabWrapper.setAttribute('data-leaf-id', tab.leafId);

        tabWrapper.ondragstart = (e) => {
            // Set BOTH standard text/plain and custom type for compatibility + filtering
            e.dataTransfer?.setData('text/plain', tab.leafId);
            e.dataTransfer?.setData('text/tab-id', tab.leafId);
            tabWrapper.addClass('is-dragging');
        };

        tabWrapper.ondragend = () => {
            tabWrapper.removeClass('is-dragging');
        };

        tabWrapper.ondragover = (e) => {
            // Only accept tab drags (check for our custom MIME type)
            if (e.dataTransfer?.types?.includes('text/tab-id')) {
                e.preventDefault();
                tabWrapper.addClass('drag-over');
            }
        };

        tabWrapper.ondragleave = () => {
            tabWrapper.removeClass('drag-over');
        };

        tabWrapper.ondrop = (e) => {
            e.preventDefault();
            tabWrapper.removeClass('drag-over');
            const draggedLeafId = e.dataTransfer?.getData('text/tab-id');
            if (draggedLeafId && draggedLeafId !== tab.leafId) {
                this.view.handleTabDrop(draggedLeafId, tab.leafId);
            }
        };

        const toggleExpand = () => {
            const key = `tab:${tab.url}`;
            const newState = !this.view.expandedGroupIds.has(key);
            this.view.setGroupExpanded(key, newState);
            this.view.render(true);
        };

        tabRow.onclick = async (e) => {
            if ((e.target as HTMLElement).closest('.web-sidecar-expand-btn')) return;
            if ((e.target as HTMLElement).closest('.web-sidecar-inline-new-note')) return;

            // Check if this tab (or any in group) is already the active/focused tab
            // Use lastActiveLeaf fallback when sidecar itself is focused
            let checkLeaf = this.view.app.workspace.activeLeaf;
            if (checkLeaf === this.view.leaf && this.view.lastActiveLeaf) {
                checkLeaf = this.view.lastActiveLeaf;
            }
            let isAlreadyActive = false;

            if (checkLeaf) {
                const checkLeafId = (checkLeaf as any).id;

                // For grouped tabs, check if ANY tab in the group is active
                if (isDeduped && allTabs) {
                    isAlreadyActive = allTabs.some(t => {
                        if (checkLeafId && t.leafId === checkLeafId) return true;
                        if (t.leaf && checkLeaf === t.leaf) return true;
                        return false;
                    });
                } else {
                    // Single tab - check just this one
                    if (checkLeafId && tab.leafId === checkLeafId) {
                        isAlreadyActive = true;
                    } else if (tab.leaf && checkLeaf === tab.leaf) {
                        isAlreadyActive = true;
                    }
                }
            }

            // 3-state click behavior:
            // - Single tab: first click = focus, subsequent clicks = toggle expand/collapse
            // - Grouped tabs: always cycle through instances (expand button handles expand/collapse)

            if (!isAlreadyActive) {
                // Not focused - focus the tab (or start cycling for grouped)
                setTimeout(() => {
                    if (isDeduped && allTabs) {
                        this.view.focusNextInstance(tab.url, allTabs);
                    } else {
                        this.view.focusTab(tab);
                    }
                }, 50);
                return;
            }

            // Already focused
            if (isDeduped && allTabs) {
                // Grouped tabs: cycle to next instance
                setTimeout(() => {
                    this.view.focusNextInstance(tab.url, allTabs);
                }, 50);
            } else if (hasExpandableContent) {
                // Single tab: toggle expand/collapse
                toggleExpand();
            }
        };
        tabRow.oncontextmenu = (e) => this.contextMenus.showWebViewerContextMenu(e, tab);

        const domain = extractDomain(tab.url);

        // Favicon
        const faviconContainer = tabRow.createDiv({ cls: 'web-sidecar-linked-notes-favicon' });
        // Skip favicon for internal pages
        const isInternal = tab.url.startsWith('about:') || tab.url.startsWith('chrome:') || tab.url.startsWith('obsidian:');

        if (domain && !isInternal) {
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
            cls: 'web-sidecar-linked-notes-tab-title'
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

        // Note count (skip in basic mode)
        if (!this.isBasicMode && exactCount > 0) {
            tabRow.createSpan({
                text: exactCount.toString(),
                cls: 'web-sidecar-note-count-badge',
                attr: {
                    'aria-label': exactCount === 1 ? '1 Note' : `${exactCount} Notes`
                }
            });
        }

        // Inline new note (skip in basic mode)
        if (!this.isBasicMode && exactCount === 0) {
            const newNoteBtn = tabRow.createDiv({ cls: 'web-sidecar-inline-new-note clickable-icon' });
            setIcon(newNoteBtn, 'file-plus');
            newNoteBtn.setAttribute('aria-label', 'New linked note');
            newNoteBtn.onclick = (e) => {
                e.stopPropagation();
                this.view.openCreateNoteModal(tab.url, tab.leafId);
            };
        }

        // Expand button - now just needs to set up the button since container already exists
        if (hasExpandableContent && notesContainer) {
            expandBtn = tabRow.createDiv({ cls: 'web-sidecar-expand-btn clickable-icon' });

            // Check if a linked note is currently focused - if so, auto-expand
            let linkedNoteFocused = false;
            let focusedNotePath: string | null = null;
            if (activeLeaf?.view?.getViewType() === 'markdown') {
                const view = activeLeaf.view as any;
                if (view.file) {
                    focusedNotePath = view.file.path;
                    // Check if this note is linked to the current tab
                    if (matches.exactMatches.some(m => m.file.path === focusedNotePath)) {
                        linkedNoteFocused = true;
                    }
                }
            }

            const key = `tab:${tab.url}`;
            // Auto-expand if linked note is focused (and not already expanded)
            if (linkedNoteFocused && !this.view.expandedGroupIds.has(key)) {
                this.view.setGroupExpanded(key, true);
            }

            const isCurrentlyExpanded = this.view.expandedGroupIds.has(key);

            if (isCurrentlyExpanded) {
                notesContainer.removeClass('hidden');
                setIcon(expandBtn, 'chevron-down');
            } else {
                notesContainer.addClass('hidden');
                setIcon(expandBtn, 'chevron-right');
            }

            expandBtn.onclick = (e) => {
                e.stopPropagation();
                toggleExpand();
            };

            // Auto-populate content if container is expanded
            // We must ALWAYS re-render if it's expanded to ensure new notes appear
            // (clearing and rebuilding is fast enough and ensures consistency)
            if (isCurrentlyExpanded) {
                notesContainer.empty();
                this.renderLinkedNotesTabNotes(notesContainer, tab.url, matches, tab.leafId);
            }

            // CRITICAL: Update is-focused class on existing note items when focus changes
            // (renderLinkedTabNotes handled this, but we leave this here if we later optimize to not full re-render)
            if (isCurrentlyExpanded && notesContainer.children.length > 0) {
                this.updateNoteFocusState(notesContainer, focusedNotePath);
            }
        }
    }

    /**
     * Update the is-focused class on note list items based on current focus
     * This is called on every render to ensure the blue dot follows focus changes
     */
    updateNoteFocusState(container: HTMLElement, focusedNotePath: string | null): void {
        const noteItems = container.querySelectorAll('.web-sidecar-linked-notes-note-list li');
        noteItems.forEach((li) => {
            const link = li.querySelector('.web-sidecar-linked-notes-note-link');
            if (!link) return;

            // Get the file path from the data attribute we'll add during render
            const itemPath = li.getAttribute('data-note-path');

            if (focusedNotePath && itemPath === focusedNotePath) {
                li.addClass('is-focused');
            } else {
                li.removeClass('is-focused');
            }
        });
    }

    renderLinkedNotesTabNotes(container: HTMLElement, url: string, matches: import('../../../types').MatchResult, leafId?: string): void {
        // Add style-mode class if using 'style' option (for italic closed notes)
        if (this.view.settings.linkedNoteDisplayStyle === 'style') {
            container.addClass('style-mode');
        } else {
            container.removeClass('style-mode');
        }

        // 1. Exact matches first
        if (matches.exactMatches.length > 0) {
            const exactList = container.createEl('ul', { cls: 'web-sidecar-linked-notes-note-list' });
            for (const match of matches.exactMatches) {
                const li = exactList.createEl('li');
                // Store path for focus tracking
                li.setAttribute('data-note-path', match.file.path);

                // Check if this note is the currently focused leaf
                let activeLeaf = this.view.app.workspace.activeLeaf;

                // If sidecar is active, check last active leaf
                if (activeLeaf === this.view.leaf && this.view.lastActiveLeaf) {
                    activeLeaf = this.view.lastActiveLeaf;
                }

                // Verify if the candidate active leaf is still attached to the workspace
                // If not (e.g. it was just closed), try to find the mostly likely new active leaf
                // by looking for the most recent markdown leaf that isn't the one we just checked
                if (activeLeaf && (activeLeaf as any).parent === undefined) {
                    // Leaf is detached
                    const allMarkdownLeaves = this.view.app.workspace.getLeavesOfType('markdown');
                    // Simple heuristic: grab the last one (often the most recently active/created)
                    // A better approach would be to trust Obsidian's focus logic which should settle soon,
                    // but for immediate render, this is a reasonable guess.
                    if (allMarkdownLeaves.length > 0) {
                        activeLeaf = allMarkdownLeaves[allMarkdownLeaves.length - 1] || null; // active leaf is usually last in list? Not necessarily.
                        // Actually, this.view.app.workspace.activeLeaf might be null if sidecar has focus.
                        // But we want the "visual" active note.
                        // Let's assume the first visible one if we can't tell?
                        // Better: don't highlight any if we aren't sure, rather than highlighting wrong one.
                        // BUT the user WANTS to see the new focus.
                        // Let's try to get the active leaf of the main workspace container?
                        // Hard to access reliably without private API.
                        // Fallback: If `lastActiveLeaf` is detached, checking `app.workspace.getMostRecentLeaf()` might work if we ignore sidecar?
                        // `getMostRecentLeaf` takes a root.
                        activeLeaf = null; // Reset if invalid
                    }
                }

                // Re-check activeLeaf from workspace if we reset it or it was null
                if (!activeLeaf || activeLeaf === this.view.leaf) {
                    // Try to find a markdown leaf that looks active (heuristics)
                    // This is tricky. 
                    // Let's stick to: if lastActiveLeaf is invalid, we don't show focus UNTIL user interacts with a note
                    // OR until active-leaf-change fires (which should happen shortly after close).
                    // However, since we DELAYED the render by 150ms in ContextMenus, 
                    // `this.view.app.workspace.activeLeaf` SHOULD be correct now (the new note),
                    // UNLESS the sidecar still has focus.

                    // If sidecar has focus, `this.view.app.workspace.activeLeaf` is sidecar.
                    // The "background" active tab is not exposed commonly.
                    // But we can check `this.view.app.workspace.getLeavesOfType('markdown')`
                    // and see if any have `view.containerEl.ownerDocument.activeElement`? No.

                    const leaves = this.view.app.workspace.getLeavesOfType('markdown');
                    // Find the one that corresponds to the file path of matches?
                    // No we want to know WHICH ONE is active.
                }

                const isNoteFocused = activeLeaf?.view?.getViewType() === 'markdown'
                    && (activeLeaf.view as any)?.file?.path === match.file.path
                    && activeLeaf.getRoot() === this.view.app.workspace.rootSplit; // Ensure it's in main area? Optional.

                if (isNoteFocused) {
                    li.addClass('is-focused');
                }

                // Check if note is open anywhere in workspace (for open/closed styling)
                // Check if note is open anywhere in workspace (for open/closed styling)
                if (this.view.settings.linkedNoteDisplayStyle !== 'none') {
                    let isOpen = false;
                    this.view.app.workspace.iterateAllLeaves((leaf) => {
                        if ((leaf.view as any).file?.path === match.file.path) {
                            isOpen = true;
                            // return true; // iterateAllLeaves doesn't support early exit in all versions, depends on callback signature?
                            // Actually it's a void function typically.
                        }
                    });

                    li.addClass(isOpen ? 'is-open' : 'is-closed');
                }

                const link = li.createEl('a', {
                    text: match.file.basename,
                    cls: 'web-sidecar-linked-notes-note-link',
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

        // 2. New linked note button (always show)
        const newNoteBtn = container.createDiv({ cls: 'web-sidecar-new-note-btn' });
        const noteIcon = newNoteBtn.createSpan({ cls: 'web-sidecar-new-note-icon' });
        setIcon(noteIcon, 'file-plus');
        newNoteBtn.createSpan({ text: 'New linked note', cls: 'web-sidecar-new-note-text' });
        newNoteBtn.setAttribute('aria-label', 'New linked note');
        newNoteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.view.openCreateNoteModal(url, leafId);
        });

        // 3. Same domain notes (if enabled) - collapsible section
        if (this.view.settings.enableTldSearch && matches.tldMatches.length > 0) {
            const domain = extractDomain(url);
            let headerText = `More web notes (${domain || 'this domain'})`;

            // Priority: YouTube Channel > Subreddit > Domain
            if (matches.matchedChannel) {
                headerText = `More from ${matches.matchedChannel}`;
            } else if (this.view.settings.enableSubredditFilter) {
                const subreddit = extractSubreddit(url);
                if (subreddit) {
                    headerText = `More web notes (${subreddit})`;
                }
            }

            // Create collapsible details element
            const details = container.createEl('details', { cls: 'web-sidecar-tld-section' });
            const summary = details.createEl('summary', { cls: 'web-sidecar-linked-notes-subtitle' });
            summary.createSpan({ text: headerText });

            const domainList = details.createEl('ul', { cls: 'web-sidecar-linked-notes-note-list' });
            for (const match of matches.tldMatches) {
                const li = domainList.createEl('li');

                // Check if note is open anywhere in workspace (for open/closed styling)
                // Check if note is open anywhere in workspace (for open/closed styling)
                if (this.view.settings.linkedNoteDisplayStyle !== 'none') {
                    let isOpen = false;
                    this.view.app.workspace.iterateAllLeaves((leaf) => {
                        if ((leaf.view as any).file?.path === match.file.path) {
                            isOpen = true;
                        }
                    });
                    li.addClass(isOpen ? 'is-open' : 'is-closed');
                }

                const link = li.createEl('a', {
                    text: match.file.basename,
                    cls: 'web-sidecar-linked-notes-note-link web-sidecar-muted',
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
