
import { setIcon } from 'obsidian';
import { extractDomain } from '../../services/urlUtils';
import { getRecentNotesWithUrls, getAllRedditNotes, extractSubreddit, getNotesGroupedByTags } from '../../services/noteMatcher';
import { IWebSidecarView } from '../../types';
import { NoteRenderer } from './NoteRenderer';
import { ContextMenus } from './ContextMenus';

export class SectionRenderer {
    private view: IWebSidecarView;
    private noteRenderer: NoteRenderer;
    private contextMenus: ContextMenus;

    constructor(view: IWebSidecarView, noteRenderer: NoteRenderer, contextMenus: ContextMenus) {
        this.view = view;
        this.noteRenderer = noteRenderer;
        this.contextMenus = contextMenus;
    }

    /**
     * Render the empty state with recent notes
     */
    renderEmptyState(container: HTMLElement): void {
        // Check if browser mode - use consistent layout
        if (this.view.settings.tabAppearance === 'browser') {
            // No controls needed here - nav-header already provides refresh button

            // "+ New web tab" button (always visible)
            const newTabBtn = container.createDiv({ cls: 'web-sidecar-new-tab-btn' });
            const plusIcon = newTabBtn.createSpan({ cls: 'web-sidecar-new-tab-icon' });
            setIcon(plusIcon, 'plus');
            newTabBtn.createSpan({ text: 'New web viewer', cls: 'web-sidecar-new-tab-text' });
            newTabBtn.addEventListener('click', () => this.view.openNewWebViewer());

            // Render ALL auxiliary sections (recent, domain, subreddit, tags, etc.)
            this.renderAuxiliarySections(container);
            return;
        }

        // Notes mode (original behavior)
        const header = container.createDiv({ cls: 'web-sidecar-header' });
        const headerRow = header.createDiv({ cls: 'web-sidecar-header-row' });
        headerRow.createEl('h4', { text: 'No web viewer tabs open' });
        // No refresh button needed - nav-header already provides one

        // Recent notes section
        const recentNotes = getRecentNotesWithUrls(
            this.view.app,
            this.view.settings,
            this.view.settings.recentNotesCount,
            this.view.urlIndex
        );

        if (recentNotes.length > 0) {
            const recentSection = container.createDiv({ cls: 'web-sidecar-section' });
            recentSection.createEl('h5', { text: 'Recent web notes' });

            const list = recentSection.createEl('ul', { cls: 'web-sidecar-list' });

            for (const note of recentNotes) {
                this.noteRenderer.renderNoteItem(list, note.file, note.url);
            }
        } else {
            container.createEl('p', {
                text: 'No notes with URL properties found.',
                cls: 'web-sidecar-empty-text'
            });
        }
    }

    /**
     * Render the collapsible "Recent web notes" section
     */
    renderRecentWebNotesSection(container: HTMLElement): void {
        const recentNotes = getRecentNotesWithUrls(
            this.view.app,
            this.view.settings,
            this.view.settings.recentNotesCount,
            this.view.urlIndex
        );

        if (recentNotes.length === 0) return;

        // Remove existing recent section before creating new one
        const existingRecent = container.querySelector('.web-sidecar-recent-section');
        if (existingRecent) existingRecent.remove();

        const details = container.createEl('details', { cls: 'web-sidecar-recent-section web-sidecar-aux-section' });
        details.setAttribute('data-section-id', 'recent');
        details.setAttribute('draggable', 'true');

        // Drag-and-drop handlers
        this.addSectionDragHandlers(details, 'recent');

        // Preserve open state
        if (this.view.isRecentNotesOpen) {
            details.setAttribute('open', '');
        }
        details.addEventListener('toggle', () => {
            this.view.setRecentNotesOpen(details.hasAttribute('open'));
        });

        const summary = details.createEl('summary', { cls: 'web-sidecar-recent-summary' });
        const summaryIcon = summary.createSpan({ cls: 'web-sidecar-recent-icon' });
        setIcon(summaryIcon, 'history');
        summary.createSpan({ text: `Recent web notes (${recentNotes.length})` });

        const list = details.createEl('ul', { cls: 'web-sidecar-list web-sidecar-recent-list' });

        for (const note of recentNotes) {
            this.noteRenderer.renderNoteItem(list, note.file, note.url);
        }
    }

    /**
 * Render all auxiliary sections in configured order
 * CRITICAL: Aux sections MUST always appear AFTER the main sections (tabs, new button, virtual tabs)
 */
    renderAuxiliarySections(container: HTMLElement): void {
        // Get or create aux container
        let auxContainer = container.querySelector('.web-sidecar-aux-sections') as HTMLElement;
        if (!auxContainer) {
            auxContainer = document.createElement('div');
            auxContainer.className = 'web-sidecar-aux-sections';
            container.appendChild(auxContainer);
        }

        // CRITICAL: Ensure aux container is at the END of container (after virtual section, tabs, etc.)
        // This prevents aux sections from appearing above main content during initial load
        const virtualSection = container.querySelector('.web-sidecar-virtual-section');
        const newTabBtn = container.querySelector('.web-sidecar-new-tab-btn');
        const tabListContainer = container.querySelector('.web-sidecar-browser-tabs');

        // Determine the correct anchor point (last of the main sections)
        const anchorElement = virtualSection || newTabBtn || tabListContainer;

        if (anchorElement && anchorElement.nextSibling !== auxContainer) {
            // Insert aux container right after the anchor
            anchorElement.after(auxContainer);
        } else if (!anchorElement && container.lastChild !== auxContainer) {
            // No main sections exist yet, append to end
            container.appendChild(auxContainer);
        }

        // Clear and re-render in order
        auxContainer.empty();

        for (const sectionId of this.view.settings.sectionOrder) {
            switch (sectionId) {
                case 'recent':
                    if (this.view.settings.enableRecentNotes) {
                        this.renderRecentWebNotesSection(auxContainer);
                    }
                    break;
                case 'domain':
                    if (this.view.settings.enableTldSearch) {
                        this.renderDomainGroupingSection(auxContainer);
                    }
                    break;
                case 'subreddit':
                    if (this.view.settings.enableSubredditExplorer) {
                        this.renderSubredditExplorerSection(auxContainer);
                    }
                    break;
                case 'tag':
                    if (this.view.settings.enableTagGrouping) {
                        this.renderTagGroupingSection(auxContainer);
                    }
                    break;
                case 'selected-tag':
                    if (this.view.settings.enableSelectedTagGrouping) {
                        this.renderSelectedTagGroupingSection(auxContainer);
                    }
                    break;
            }
        }

        // Add an end-of-list drop zone to allow dropping sections at the very end
        this.addEndDropZone(auxContainer);
    }

    /**
     * Add a drop zone at the end of the aux container for dropping sections to be last
     */
    private addEndDropZone(container: HTMLElement): void {
        // Check if already exists
        if (container.querySelector('.web-sidecar-drop-zone-end')) return;

        const dropZone = container.createDiv({ cls: 'web-sidecar-drop-zone-end' });

        dropZone.ondragover = (e) => {
            // Only accept section drags (check for our custom MIME type)
            if (e.dataTransfer?.types?.includes('text/section-id')) {
                e.preventDefault();
                dropZone.addClass('drag-over');
            }
        };

        dropZone.ondragleave = () => {
            dropZone.removeClass('drag-over');
        };

        dropZone.ondrop = (e) => {
            e.preventDefault();
            dropZone.removeClass('drag-over');
            const draggedId = e.dataTransfer?.getData('text/section-id');
            if (draggedId) {
                // Move dragged item to end
                const currentOrder = [...this.view.settings.sectionOrder];
                const draggedIdx = currentOrder.indexOf(draggedId);
                if (draggedIdx > -1) {
                    currentOrder.splice(draggedIdx, 1);
                }
                currentOrder.push(draggedId);
                this.view.settings.sectionOrder = currentOrder;
                this.view.setManualRefresh(true);
                this.view.saveSettingsFn(); // Persist changes
                this.view.onRefresh();
            }
        };
    }
    /**
     * Add drag-and-drop handlers to a section element
     */
    private addSectionDragHandlers(element: HTMLElement, sectionId: string): void {
        element.ondragstart = (e) => {
            // Set BOTH standard text/plain and custom type for compatibility + filtering
            e.dataTransfer?.setData('text/plain', sectionId);
            e.dataTransfer?.setData('text/section-id', sectionId);
            element.addClass('is-dragging');
        };

        element.ondragend = () => {
            element.removeClass('is-dragging');
        };

        element.ondragover = (e) => {
            // Only accept section drags (check for our custom MIME type)
            if (e.dataTransfer?.types?.includes('text/section-id')) {
                e.preventDefault();
                element.addClass('drag-over');
            }
        };

        element.ondragleave = () => {
            element.removeClass('drag-over');
        };

        element.ondrop = (e) => {
            e.preventDefault();
            element.removeClass('drag-over');
            const draggedId = e.dataTransfer?.getData('text/section-id');
            if (draggedId && draggedId !== sectionId) {
                this.view.handleSectionDrop(draggedId, sectionId);
            }
        };
    }

    /**
     * Render "Subreddit notes explorer" collapsible section
     */
    renderSubredditExplorerSection(container: HTMLElement): void {
        if (!this.view.settings.enableSubredditExplorer) return;

        const subredditMap = getAllRedditNotes(this.view.app, this.view.settings, this.view.urlIndex);
        if (subredditMap.size === 0) return;

        // Remove existing subreddit section before creating new one
        const existingSection = container.querySelector('[data-section-id="subreddit"]');
        if (existingSection) existingSection.remove();

        const details = container.createEl('details', { cls: 'web-sidecar-domain-section web-sidecar-aux-section' });
        details.setAttribute('data-section-id', 'subreddit');
        details.setAttribute('draggable', 'true');

        // Drag-and-drop handlers
        this.addSectionDragHandlers(details, 'subreddit');
        // Preserve open state
        if (this.view.isSubredditExplorerOpen) {
            details.setAttribute('open', '');
        }
        details.addEventListener('toggle', () => {
            this.view.setSubredditExplorerOpen(details.hasAttribute('open'));
        });

        const summary = details.createEl('summary', { cls: 'web-sidecar-domain-summary' });
        const summaryIcon = summary.createSpan({ cls: 'web-sidecar-domain-icon' });

        // Reddit favicon for the main explorer group
        const favicon = summaryIcon.createEl('img', {
            cls: 'web-sidecar-favicon-small',
            attr: {
                src: `https://www.google.com/s2/favicons?domain=reddit.com&sz=16`,
                alt: 'Reddit',
                width: '14',
                height: '14'
            }
        });

        summary.createSpan({ text: `Subreddit notes explorer (${subredditMap.size})` });

        // Sort button - cycles through: alpha -> count -> recent -> alpha
        const getSortIcon = (sort: string) => {
            switch (sort) {
                case 'alpha': return 'arrow-down-az';
                case 'count': return 'arrow-down-wide-narrow';
                case 'recent': return 'clock';
                default: return 'arrow-down-az';
            }
        };
        const getSortLabel = (sort: string) => {
            switch (sort) {
                case 'alpha': return 'Sorted by name';
                case 'count': return 'Sorted by count';
                case 'recent': return 'Sorted by recent';
                default: return 'Sorted by name';
            }
        };
        const getNextSort = (sort: string): 'alpha' | 'count' | 'recent' => {
            switch (sort) {
                case 'alpha': return 'count';
                case 'count': return 'recent';
                case 'recent': return 'alpha';
                default: return 'count';
            }
        };

        const sortBtn = summary.createEl('button', {
            cls: 'web-sidecar-sort-btn-tiny web-sidecar-align-right clickable-icon',
            attr: {
                'aria-label': getSortLabel(this.view.subredditSort),
            }
        });
        setIcon(sortBtn, getSortIcon(this.view.subredditSort));

        // Prevent summary expansion when clicking sort
        sortBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.view.setSubredditSort(getNextSort(this.view.subredditSort));
            // Force manual refresh to bypass interaction lock if needed, though usually sort is explicit
            this.view.setManualRefresh(true);
            this.view.onRefresh();
        };

        const groupList = details.createDiv({ cls: 'web-sidecar-domain-list' });

        // Helper to get max mtime of notes in a group
        const getMaxMtime = (notes: import('../../types').MatchedNote[]) => {
            return Math.max(...notes.map(n => n.file.stat.mtime));
        };

        // Sort subreddits
        const sortedSubreddits = Array.from(subredditMap.entries()).sort((a, b) => {
            if (this.view.subredditSort === 'count') {
                const countDiff = b[1].length - a[1].length;
                if (countDiff !== 0) return countDiff;
            } else if (this.view.subredditSort === 'recent') {
                const mtimeDiff = getMaxMtime(b[1]) - getMaxMtime(a[1]);
                if (mtimeDiff !== 0) return mtimeDiff;
            }
            return a[0].localeCompare(b[0]);
        });

        for (const [subreddit, notes] of sortedSubreddits) {
            this.renderSubredditGroup(groupList, subreddit, notes);
        }
    }

    /**
     * Render a single subreddit group
     */
    private renderSubredditGroup(container: HTMLElement, subreddit: string, notes: import('../../types').MatchedNote[]): void {
        const details = container.createEl('details', { cls: 'web-sidecar-domain-group' });

        // State persistence
        const groupId = `subreddit:${subreddit}`;
        if (this.view.expandedGroupIds.has(groupId)) {
            details.setAttribute('open', '');
        }
        details.addEventListener('toggle', () => {
            this.view.setGroupExpanded(groupId, details.hasAttribute('open'));
        });

        const summary = details.createEl('summary', { cls: 'web-sidecar-domain-row' });

        // Context menu on right-click
        summary.addEventListener('contextmenu', (e) => this.contextMenus.showSubredditContextMenu(e, subreddit));

        // Reuse domain group styling
        const faviconContainer = summary.createDiv({ cls: 'web-sidecar-domain-favicon' });
        faviconContainer.createEl('img', {
            attr: {
                src: `https://www.google.com/s2/favicons?domain=reddit.com&sz=16`,
                alt: '',
                width: '14',
                height: '14'
            }
        });

        summary.createSpan({ text: subreddit, cls: 'web-sidecar-domain-name' });

        // Link icon to open subreddit (to the left of count)
        const linkBtn = summary.createEl('button', {
            cls: 'web-sidecar-group-link-btn clickable-icon',
            attr: { 'aria-label': `Open ${subreddit}` }
        });
        setIcon(linkBtn, 'external-link');
        linkBtn.onclick = async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const subredditUrl = `https://reddit.com/${subreddit}`;
            await this.view.openUrlSmartly(subredditUrl, e as any);
        };

        summary.createSpan({
            text: notes.length.toString(),
            cls: 'web-sidecar-domain-count',
            attr: {
                'title': notes.length === 1 ? '1 Note' : `${notes.length} Notes`
            }
        });

        const notesList = details.createEl('ul', { cls: 'web-sidecar-list web-sidecar-domain-notes' });
        for (const note of notes) {
            this.noteRenderer.renderNoteItem(notesList, note.file, note.url);
        }
    }

    /**
     * Render "Web notes grouped by domain" collapsible section
     */
    renderDomainGroupingSection(container: HTMLElement): void {
        const recentNotes = getRecentNotesWithUrls(
            this.view.app,
            this.view.settings,
            100, // Get more notes for domain grouping
            this.view.urlIndex
        );

        if (recentNotes.length === 0) return;

        // Group notes by domain
        const domainMap = new Map<string, { notes: typeof recentNotes, domain: string }>();
        for (const note of recentNotes) {
            const domain = extractDomain(note.url);
            if (!domain) continue;
            if (!domainMap.has(domain)) {
                domainMap.set(domain, { notes: [], domain });
            }
            domainMap.get(domain)!.notes.push(note);
        }

        // Only show if we have domains
        if (domainMap.size === 0) return;

        // Remove existing domain section before creating new one
        const existingSection = container.querySelector('[data-section-id="domain"]');
        if (existingSection) existingSection.remove();

        const details = container.createEl('details', { cls: 'web-sidecar-domain-section web-sidecar-aux-section' });
        details.setAttribute('data-section-id', 'domain');
        details.setAttribute('draggable', 'true');

        // Drag-and-drop handlers
        this.addSectionDragHandlers(details, 'domain');
        // Preserve open state
        if (this.view.isDomainGroupOpen) {
            details.setAttribute('open', '');
        }
        details.addEventListener('toggle', () => {
            this.view.setDomainGroupOpen(details.hasAttribute('open'));
        });

        const summary = details.createEl('summary', { cls: 'web-sidecar-domain-summary' });
        const summaryIcon = summary.createSpan({ cls: 'web-sidecar-domain-icon' });
        setIcon(summaryIcon, 'globe');
        summary.createSpan({ text: `Web notes grouped by domain (${domainMap.size})` });

        // Sort button - cycles through: alpha -> count -> recent -> alpha
        const getSortIcon = (sort: string) => {
            switch (sort) {
                case 'alpha': return 'arrow-down-az';
                case 'count': return 'arrow-down-wide-narrow';
                case 'recent': return 'clock';
                default: return 'arrow-down-az';
            }
        };
        const getSortLabel = (sort: string) => {
            switch (sort) {
                case 'alpha': return 'Sorted by name';
                case 'count': return 'Sorted by count';
                case 'recent': return 'Sorted by recent';
                default: return 'Sorted by name';
            }
        };
        const getNextSort = (sort: string): 'alpha' | 'count' | 'recent' => {
            switch (sort) {
                case 'alpha': return 'count';
                case 'count': return 'recent';
                case 'recent': return 'alpha';
                default: return 'count';
            }
        };

        const sortBtn = summary.createEl('button', {
            cls: 'web-sidecar-sort-btn-tiny web-sidecar-align-right clickable-icon',
            attr: {
                'aria-label': getSortLabel(this.view.domainSort),
            }
        });
        setIcon(sortBtn, getSortIcon(this.view.domainSort));

        // Prevent summary expansion when clicking sort
        sortBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.view.setDomainSort(getNextSort(this.view.domainSort));
            // Force manual refresh to bypass interaction lock if needed
            this.view.setManualRefresh(true);
            this.view.onRefresh();
        };

        const domainList = details.createDiv({ cls: 'web-sidecar-domain-list' });

        // Helper to get max mtime of notes in a group
        const getMaxMtime = (notes: { file: import('obsidian').TFile }[]) => {
            return Math.max(...notes.map(n => n.file.stat.mtime));
        };

        // Sort domains
        const sortedDomains = Array.from(domainMap.entries()).sort((a, b) => {
            if (this.view.domainSort === 'count') {
                const countDiff = b[1].notes.length - a[1].notes.length;
                if (countDiff !== 0) return countDiff;
            } else if (this.view.domainSort === 'recent') {
                const mtimeDiff = getMaxMtime(b[1].notes) - getMaxMtime(a[1].notes);
                if (mtimeDiff !== 0) return mtimeDiff;
            }
            return a[0].localeCompare(b[0]);
        });

        for (const [domain, data] of sortedDomains) {
            this.renderDomainGroup(domainList, domain, data.notes);
        }
    }

    /**
     * Render a single domain group (expandable)
     */
    private renderDomainGroup(container: HTMLElement, domain: string, notes: ReturnType<typeof getRecentNotesWithUrls>): void {
        const domainDetails = container.createEl('details', { cls: 'web-sidecar-domain-group' });

        // State persistence
        const groupId = `domain:${domain}`;
        if (this.view.expandedGroupIds.has(groupId)) {
            domainDetails.setAttribute('open', '');
        }
        domainDetails.addEventListener('toggle', () => {
            this.view.setGroupExpanded(groupId, domainDetails.hasAttribute('open'));
        });

        const domainSummary = domainDetails.createEl('summary', { cls: 'web-sidecar-domain-row' });

        // Context menu on right-click
        domainSummary.addEventListener('contextmenu', (e) => this.contextMenus.showDomainContextMenu(e, domain));

        // Favicon
        const faviconContainer = domainSummary.createDiv({ cls: 'web-sidecar-domain-favicon' });

        // Skip favicon for internal "domains"
        const isInternal = domain === 'about' || domain === 'chrome' || domain === 'obsidian';

        if (!isInternal) {
            const favicon = faviconContainer.createEl('img', {
                attr: {
                    src: `https://www.google.com/s2/favicons?domain=${domain}&sz=32`,
                    alt: '',
                    width: '14',
                    height: '14'
                }
            });
            favicon.onerror = () => {
                faviconContainer.empty();
                setIcon(faviconContainer, 'globe');
            };
        } else {
            setIcon(faviconContainer, 'globe');
        }

        // Domain name
        domainSummary.createSpan({ text: domain, cls: 'web-sidecar-domain-name' });

        // Link icon to open domain homepage (to the left of count)
        const linkBtn = domainSummary.createEl('button', {
            cls: 'web-sidecar-group-link-btn clickable-icon',
            attr: { 'aria-label': `Open ${domain}` }
        });
        setIcon(linkBtn, 'external-link');
        linkBtn.onclick = async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const domainUrl = `https://${domain}`;
            await this.view.openUrlSmartly(domainUrl, e as any);
        };

        // Note count badge
        domainSummary.createSpan({
            text: notes.length.toString(),
            cls: 'web-sidecar-domain-count',
            attr: {
                'title': notes.length === 1 ? '1 Note' : `${notes.length} Notes`
            }
        });

        // Notes list
        const notesList = domainDetails.createEl('ul', { cls: 'web-sidecar-list web-sidecar-domain-notes' });
        for (const note of notes) {
            this.noteRenderer.renderNoteItem(notesList, note.file, note.url);
        }
    }

    /**
     * Render "Group all web notes by tags" section
     */
    renderTagGroupingSection(container: HTMLElement): void {
        const tagMap = getNotesGroupedByTags(this.view.app, this.view.settings, this.view.urlIndex);
        if (tagMap.size === 0) return;

        // Remove existing section
        const existingSection = container.querySelector('[data-section-id="tag"]');
        if (existingSection) existingSection.remove();

        const details = container.createEl('details', { cls: 'web-sidecar-tag-section web-sidecar-aux-section' });
        details.setAttribute('data-section-id', 'tag');
        details.setAttribute('draggable', 'true');

        this.addSectionDragHandlers(details, 'tag');
        if (this.view.isTagGroupOpen) {
            details.setAttribute('open', '');
        }
        details.addEventListener('toggle', () => {
            this.view.setTagGroupOpen(details.hasAttribute('open'));
        });

        const summary = details.createEl('summary', { cls: 'web-sidecar-domain-summary' });
        const summaryIcon = summary.createSpan({ cls: 'web-sidecar-domain-icon' });
        setIcon(summaryIcon, 'tag');
        summary.createSpan({ text: `Web notes grouped by tags (${tagMap.size})` });

        this.renderSortButton(summary, this.view.tagSort, (sort) => {
            this.view.setTagSort(sort);
            this.view.setManualRefresh(true);
            this.view.onRefresh();
        });

        const groupList = details.createDiv({ cls: 'web-sidecar-domain-list' });
        const sortedGroups = this.sortGroups(tagMap, this.view.tagSort);

        for (const [tag, notes] of sortedGroups) {
            this.renderTagGroup(groupList, tag, notes, 'tag');
        }
    }

    /**
     * Render "Group web notes from selected tags" section
     */
    renderSelectedTagGroupingSection(container: HTMLElement): void {
        const rawList = this.view.settings.selectedTagsAllowlist || '';
        const allowedTags = new Set(rawList.split(',')
            .map(t => t.trim())
            .filter(t => t.length > 0)
            .map(t => t.startsWith('#') ? t : '#' + t));

        if (allowedTags.size === 0) return;

        const tagMap = getNotesGroupedByTags(this.view.app, this.view.settings, this.view.urlIndex, allowedTags);
        if (tagMap.size === 0) return;

        // Remove existing section
        const existingSection = container.querySelector('[data-section-id="selected-tag"]');
        if (existingSection) existingSection.remove();

        const details = container.createEl('details', { cls: 'web-sidecar-selected-tag-section web-sidecar-aux-section' });
        details.setAttribute('data-section-id', 'selected-tag');
        details.setAttribute('draggable', 'true');

        this.addSectionDragHandlers(details, 'selected-tag');
        if (this.view.isSelectedTagGroupOpen) {
            details.setAttribute('open', '');
        }
        details.addEventListener('toggle', () => {
            this.view.setSelectedTagGroupOpen(details.hasAttribute('open'));
        });

        const summary = details.createEl('summary', { cls: 'web-sidecar-domain-summary' });
        const summaryIcon = summary.createSpan({ cls: 'web-sidecar-domain-icon' });
        setIcon(summaryIcon, 'list-filter');
        summary.createSpan({ text: `Web notes from selected tags (${tagMap.size})` });

        this.renderSortButton(summary, this.view.selectedTagSort, (sort) => {
            this.view.setSelectedTagSort(sort);
            this.view.setManualRefresh(true);
            this.view.onRefresh();
        });

        const groupList = details.createDiv({ cls: 'web-sidecar-domain-list' });
        const sortedGroups = this.sortGroups(tagMap, this.view.selectedTagSort);

        for (const [tag, notes] of sortedGroups) {
            // Using same group renderer but maybe different ID prefix to allow separate expansion states
            this.renderTagGroup(groupList, tag, notes, 'selected-tag');
        }
    }

    private renderSortButton(container: HTMLElement, currentSort: string, onSortChange: (sort: 'alpha' | 'count' | 'recent') => void) {
        const getSortIcon = (sort: string) => {
            switch (sort) {
                case 'alpha': return 'arrow-down-az';
                case 'count': return 'arrow-down-wide-narrow';
                case 'recent': return 'clock';
                default: return 'arrow-down-az';
            }
        };
        const getSortLabel = (sort: string) => {
            switch (sort) {
                case 'alpha': return 'Sorted by name';
                case 'count': return 'Sorted by count';
                case 'recent': return 'Sorted by recent';
                default: return 'Sorted by name';
            }
        };
        const getNextSort = (sort: string): 'alpha' | 'count' | 'recent' => {
            switch (sort) {
                case 'alpha': return 'count';
                case 'count': return 'recent';
                case 'recent': return 'alpha';
                default: return 'count';
            }
        };

        const sortBtn = container.createEl('button', {
            cls: 'web-sidecar-sort-btn-tiny web-sidecar-align-right clickable-icon',
            attr: { 'aria-label': getSortLabel(currentSort) }
        });
        setIcon(sortBtn, getSortIcon(currentSort));

        sortBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            onSortChange(getNextSort(currentSort));
        };
    }

    private sortGroups(map: Map<string, any[]>, sortOrder: 'alpha' | 'count' | 'recent'): [string, any[]][] {
        const getMaxMtime = (notes: { file: import('obsidian').TFile }[]) => {
            return Math.max(...notes.map(n => n.file.stat.mtime));
        };

        return Array.from(map.entries()).sort((a, b) => {
            if (sortOrder === 'count') {
                const countDiff = b[1].length - a[1].length;
                if (countDiff !== 0) return countDiff;
            } else if (sortOrder === 'recent') {
                const mtimeDiff = getMaxMtime(b[1]) - getMaxMtime(a[1]);
                if (mtimeDiff !== 0) return mtimeDiff;
            }
            return a[0].localeCompare(b[0]);
        });
    }

    private renderTagGroup(container: HTMLElement, tag: string, notes: import('../../types').MatchedNote[], sectionPrefix: string): void {
        const details = container.createEl('details', { cls: 'web-sidecar-domain-group' });

        // State persistence - make unique per section
        const groupId = `${sectionPrefix}:${tag}`;
        if (this.view.expandedGroupIds.has(groupId)) {
            details.setAttribute('open', '');
        }
        details.addEventListener('toggle', () => {
            this.view.setGroupExpanded(groupId, details.hasAttribute('open'));
        });

        const summary = details.createEl('summary', { cls: 'web-sidecar-domain-row' });

        // TODO: Context menu for tag? Maybe later.

        // Icon
        const faviconContainer = summary.createDiv({ cls: 'web-sidecar-domain-favicon' });
        // Use tag icon instead of favicon
        const iconSpan = faviconContainer.createSpan({ cls: 'web-sidecar-tag-icon-scaled' });
        setIcon(iconSpan, 'tag');

        // Tag name
        summary.createSpan({ text: tag, cls: 'web-sidecar-domain-name' });

        // Count badge
        summary.createSpan({
            text: notes.length.toString(),
            cls: 'web-sidecar-domain-count',
            attr: {
                'title': notes.length === 1 ? '1 Note' : `${notes.length} Notes`
            }
        });

        // Notes list
        const notesList = details.createEl('ul', { cls: 'web-sidecar-list web-sidecar-domain-notes' });
        for (const note of notes) {
            this.noteRenderer.renderNoteItem(notesList, note.file, note.url);
        }
    }

}
