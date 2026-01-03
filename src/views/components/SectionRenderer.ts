
import { setIcon } from 'obsidian';
import { extractDomain } from '../../services/urlUtils';
import { getRecentNotesWithUrls, getAllRedditNotes, extractSubreddit } from '../../services/noteMatcher';
import { IWebSidecarView } from '../../types';
import { NoteRenderer } from './NoteRenderer';

export class SectionRenderer {
    private view: IWebSidecarView;
    private noteRenderer: NoteRenderer;

    constructor(view: IWebSidecarView, noteRenderer: NoteRenderer) {
        this.view = view;
        this.noteRenderer = noteRenderer;
    }

    /**
     * Render the empty state with recent notes
     */
    renderEmptyState(container: HTMLElement): void {
        // Check if browser mode - use consistent layout
        if (this.view.settings.tabAppearance === 'browser') {
            // Header with controls
            const header = container.createDiv({ cls: 'web-sidecar-browser-header' });
            const controls = header.createDiv({ cls: 'web-sidecar-controls' });
            const refreshBtn = controls.createEl('button', {
                cls: 'web-sidecar-refresh-btn clickable-icon',
                attr: { 'aria-label': 'Refresh' }
            });
            setIcon(refreshBtn, 'refresh-cw');
            // Using callback for consistency with other buttons, though direct referencing works too if properly bound
            refreshBtn.addEventListener('click', () => this.view.onRefresh());

            // "+ New web tab" button (always visible)
            const newTabBtn = container.createDiv({ cls: 'web-sidecar-new-tab-btn' });
            const plusIcon = newTabBtn.createSpan({ cls: 'web-sidecar-new-tab-icon' });
            setIcon(plusIcon, 'plus');
            newTabBtn.createSpan({ text: 'New web viewer', cls: 'web-sidecar-new-tab-text' });
            newTabBtn.addEventListener('click', () => this.view.openNewWebViewer());

            // "Recent web notes" collapsible section at bottom
            this.renderRecentWebNotesSection(container);
            return;
        }

        // Notes mode (original behavior)
        const header = container.createDiv({ cls: 'web-sidecar-header' });
        const headerRow = header.createDiv({ cls: 'web-sidecar-header-row' });
        headerRow.createEl('h4', { text: 'No web viewer tabs open' });

        const refreshBtn = headerRow.createEl('button', {
            cls: 'web-sidecar-refresh-btn clickable-icon',
            attr: { 'aria-label': 'Refresh' }
        });
        setIcon(refreshBtn, 'refresh-cw');
        refreshBtn.addEventListener('click', () => this.view.onRefresh());

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

        const details = container.createEl('details', { cls: 'web-sidecar-recent-section' });
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

        // Add domain grouping section below (it handles its own cleanup)
        this.renderDomainGroupingSection(container);
        // Add subreddit explorer section below that (it handles its own cleanup)
        this.renderSubredditExplorerSection(container);
    }

    /**
     * Render "Subreddit notes explorer" collapsible section
     */
    private renderSubredditExplorerSection(container: HTMLElement): void {
        if (!this.view.settings.enableSubredditExplorer) return;

        const subredditMap = getAllRedditNotes(this.view.app, this.view.settings, this.view.urlIndex);
        if (subredditMap.size === 0) return;

        // Remove existing subreddit section before creating new one
        const existingSection = container.querySelector('[data-section-type="subreddit-explorer"]');
        if (existingSection) existingSection.remove();

        const details = container.createEl('details', { cls: 'web-sidecar-domain-section' });
        details.setAttribute('data-section-type', 'subreddit-explorer');
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

        // Sort button
        const sortBtn = summary.createEl('button', {
            cls: 'web-sidecar-sort-btn-tiny web-sidecar-align-right clickable-icon',
            attr: {
                'aria-label': `Sort by ${this.view.subredditSort === 'alpha' ? 'count' : 'name'}`,
            }
        });
        // sortBtn.style.marginLeft = 'auto'; // Handled by class
        setIcon(sortBtn, this.view.subredditSort === 'alpha' ? 'arrow-down-wide-narrow' : 'arrow-down-az');

        // Prevent summary expansion when clicking sort
        sortBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.view.setSubredditSort(this.view.subredditSort === 'alpha' ? 'count' : 'alpha');
            // Force manual refresh to bypass interaction lock if needed, though usually sort is explicit
            this.view.setManualRefresh(true);
            this.view.onRefresh();
        };

        const groupList = details.createDiv({ cls: 'web-sidecar-domain-list' });

        // Sort subreddits
        const sortedSubreddits = Array.from(subredditMap.entries()).sort((a, b) => {
            if (this.view.subredditSort === 'count') {
                const countDiff = b[1].length - a[1].length;
                if (countDiff !== 0) return countDiff;
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
    private renderDomainGroupingSection(container: HTMLElement): void {
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
        const existingSection = container.querySelector('[data-section-type="domain-groups"]');
        if (existingSection) existingSection.remove();

        const details = container.createEl('details', { cls: 'web-sidecar-domain-section' });
        details.setAttribute('data-section-type', 'domain-groups');
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

        // Sort button
        const sortBtn = summary.createEl('button', {
            cls: 'web-sidecar-sort-btn-tiny web-sidecar-align-right clickable-icon',
            attr: {
                'aria-label': `Sort by ${this.view.domainSort === 'alpha' ? 'count' : 'name'}`,
            }
        });
        // sortBtn.style.marginLeft = 'auto'; // Handled by class
        setIcon(sortBtn, this.view.domainSort === 'alpha' ? 'arrow-down-wide-narrow' : 'arrow-down-az');

        // Prevent summary expansion when clicking sort
        sortBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.view.setDomainSort(this.view.domainSort === 'alpha' ? 'count' : 'alpha');
            // Force manual refresh to bypass interaction lock if needed
            this.view.setManualRefresh(true);
            this.view.onRefresh();
        };

        const domainList = details.createDiv({ cls: 'web-sidecar-domain-list' });

        // Sort domains
        const sortedDomains = Array.from(domainMap.entries()).sort((a, b) => {
            if (this.view.domainSort === 'count') {
                const countDiff = b[1].notes.length - a[1].notes.length;
                if (countDiff !== 0) return countDiff;
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

        // Favicon
        const faviconContainer = domainSummary.createDiv({ cls: 'web-sidecar-domain-favicon' });
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

        // Domain name
        domainSummary.createSpan({ text: domain, cls: 'web-sidecar-domain-name' });

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
}
