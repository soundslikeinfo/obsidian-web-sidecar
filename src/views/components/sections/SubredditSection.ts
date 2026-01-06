import { setIcon } from 'obsidian';
import { IWebSidecarView, MatchedNote } from '../../../types';
import { NoteRenderer } from '../NoteRenderer';
import { ContextMenus } from '../ContextMenus';
import { getAllRedditNotes } from '../../../services/noteMatcher';
import { getFaviconUrl } from '../../../services/faviconUtils';
import { addSectionDragHandlers, renderSortButton, sortGroups } from './SectionHelpers';

export class SubredditSection {
    constructor(
        private view: IWebSidecarView,
        private noteRenderer: NoteRenderer,
        private contextMenus: ContextMenus
    ) { }

    /**
     * Render "Subreddit notes explorer" collapsible section
     */
    render(container: HTMLElement): void {
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
        addSectionDragHandlers(this.view, details, 'subreddit');
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
        summaryIcon.createEl('img', {
            cls: 'web-sidecar-favicon-small',
            attr: {
                src: getFaviconUrl('reddit.com', 16),
                alt: 'Reddit',
                width: '14',
                height: '14'
            }
        });

        summary.createSpan({ text: `Subreddit notes explorer (${subredditMap.size})` });

        // Sort button
        renderSortButton(summary, this.view.subredditSort, (sort) => {
            this.view.setSubredditSort(sort);
            this.view.setManualRefresh(true);
            this.view.onRefresh();
        });

        const groupList = details.createDiv({ cls: 'web-sidecar-domain-list' });

        const sortedSubreddits = sortGroups(subredditMap, this.view.subredditSort);

        for (const [subreddit, notes] of sortedSubreddits) {
            this.renderSubredditGroup(groupList, subreddit, notes);
        }
    }

    /**
     * Render a single subreddit group
     */
    private renderSubredditGroup(container: HTMLElement, subreddit: string, notes: MatchedNote[]): void {
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
                src: getFaviconUrl('reddit.com', 16),
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
            await this.view.openUrlSmartly(subredditUrl, e);
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
            this.noteRenderer.renderNoteItem(notesList, note.file, note.url, false, false);
        }
    }
}
