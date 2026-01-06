
import { setIcon } from 'obsidian';
import { IWebSidecarView, MatchedNote } from '../../../types';
import { NoteRenderer } from '../NoteRenderer';
import { getAllTwitterNotes } from '../../../services/matchers/twitter';
import { getFaviconUrl } from '../../../services/faviconUtils';
import { addSectionDragHandlers, renderSortButton, sortGroups } from './SectionHelpers';

export class TwitterSection {
    constructor(
        private view: IWebSidecarView,
        private noteRenderer: NoteRenderer
    ) { }

    /**
     * Render "Twitter/X user notes explorer" collapsible section
     */
    render(container: HTMLElement): void {
        if (!this.view.settings.enableTwitterExplorer) return;

        const userMap = getAllTwitterNotes(
            this.view.app, this.view.settings, this.view.urlIndex
        );
        if (userMap.size === 0) return;

        // Remove existing section before creating new one
        const existingSection = container.querySelector('[data-section-id="twitter"]');
        if (existingSection) existingSection.remove();

        const details = container.createEl('details', {
            cls: 'web-sidecar-domain-section web-sidecar-aux-section'
        });
        details.setAttribute('data-section-id', 'twitter');
        details.setAttribute('draggable', 'true');

        addSectionDragHandlers(this.view, details, 'twitter');

        // Preserve open state
        if (this.view.isTwitterExplorerOpen) {
            details.setAttribute('open', '');
        }
        details.addEventListener('toggle', () => {
            this.view.setTwitterExplorerOpen(details.hasAttribute('open'));
        });

        const summary = details.createEl('summary', { cls: 'web-sidecar-domain-summary' });
        const summaryIcon = summary.createSpan({ cls: 'web-sidecar-domain-icon' });

        // X favicon
        summaryIcon.createEl('img', {
            cls: 'web-sidecar-favicon-small',
            attr: {
                src: getFaviconUrl('x.com', 16),
                alt: 'X',
                width: '14',
                height: '14'
            }
        });

        summary.createSpan({ text: `X Users (${userMap.size})` });

        // Sort button
        renderSortButton(summary, this.view.twitterSort, (sort) => {
            this.view.setTwitterSort(sort);
            this.view.setManualRefresh(true);
            this.view.onRefresh();
        });

        const groupList = details.createDiv({ cls: 'web-sidecar-domain-list' });
        const sortedUsers = sortGroups(userMap, this.view.twitterSort);

        for (const [user, notes] of sortedUsers) {
            this.renderTwitterUserGroup(groupList, user, notes);
        }
    }

    /**
     * Render a single Twitter user group
     */
    private renderTwitterUserGroup(
        container: HTMLElement,
        user: string,
        notes: MatchedNote[]
    ): void {
        const details = container.createEl('details', { cls: 'web-sidecar-domain-group' });

        // State persistence
        const groupId = `twitter:${user}`;
        if (this.view.expandedGroupIds.has(groupId)) {
            details.setAttribute('open', '');
        }
        details.addEventListener('toggle', () => {
            this.view.setGroupExpanded(groupId, details.hasAttribute('open'));
        });

        const summary = details.createEl('summary', { cls: 'web-sidecar-domain-row' });

        // User avatar/favicon (use X favicon for now, or user profile pic if we could fetch it, but we can't easily)
        const faviconContainer = summary.createDiv({ cls: 'web-sidecar-domain-favicon' });
        faviconContainer.createEl('img', {
            attr: {
                src: getFaviconUrl('x.com', 16),
                alt: '',
                width: '14',
                height: '14'
            }
        });

        // User handle
        summary.createSpan({ text: user, cls: 'web-sidecar-domain-name' });

        // Link buttons if user matches a note in the vault
        // Notes might be named "@username" or "username"?
        // `user` is "@username".
        // Search by name? Or if any note has this URL?
        // Let's check if there is a note with the exact name "@username" or "username".
        const cleanName = user.substring(1); // remove @
        let userNoteFile = this.view.app.metadataCache.getFirstLinkpathDest(user, '');
        if (!userNoteFile) userNoteFile = this.view.app.metadataCache.getFirstLinkpathDest(cleanName, '');

        if (userNoteFile) {
            // Note link button
            const noteLinkBtn = summary.createEl('button', {
                cls: 'web-sidecar-group-link-btn clickable-icon',
                attr: { 'aria-label': `Open ${user} note` }
            });
            setIcon(noteLinkBtn, 'file-text');
            noteLinkBtn.onclick = async (e) => {
                e.preventDefault();
                e.stopPropagation();
                await this.view.app.workspace.getLeaf(false).openFile(userNoteFile!);
            };
        }

        // External Link to X profile
        // https://x.com/username
        const profileUrl = `https://x.com/${cleanName}`;
        const extLinkBtn = summary.createEl('button', {
            cls: 'web-sidecar-group-link-btn clickable-icon',
            attr: { 'aria-label': `Open ${user} on X` }
        });
        setIcon(extLinkBtn, 'external-link');
        extLinkBtn.onclick = async (e) => {
            e.preventDefault();
            e.stopPropagation();
            await this.view.openUrlSmartly(profileUrl, e);
        };

        // Count badge
        summary.createSpan({
            text: notes.length.toString(),
            cls: 'web-sidecar-domain-count',
            attr: { 'title': notes.length === 1 ? '1 Note' : `${notes.length} Notes` }
        });

        // Notes list
        const notesList = details.createEl('ul', {
            cls: 'web-sidecar-list web-sidecar-domain-notes'
        });
        for (const note of notes) {
            this.noteRenderer.renderNoteItem(notesList, note.file, note.url);
        }
    }
}
