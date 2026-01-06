import { setIcon } from 'obsidian';
import { IWebSidecarView, MatchedNote } from '../../../types';
import { NoteRenderer } from '../NoteRenderer';
import { getNotesGroupedByTags } from '../../../services/noteMatcher';
import { addSectionDragHandlers, renderSortButton, sortGroups } from './SectionHelpers';

export class TagSection {
    constructor(
        private view: IWebSidecarView,
        private noteRenderer: NoteRenderer
    ) { }

    /**
     * Render "Group all web notes by tags" section
     */
    render(container: HTMLElement): void {
        const tagMap = getNotesGroupedByTags(this.view.app, this.view.settings, this.view.urlIndex);
        if (tagMap.size === 0) return;

        // Remove existing section
        const existingSection = container.querySelector('[data-section-id="tag"]');
        if (existingSection) existingSection.remove();

        const details = container.createEl('details', { cls: 'web-sidecar-tag-section web-sidecar-aux-section' });
        details.setAttribute('data-section-id', 'tag');
        details.setAttribute('draggable', 'true');

        addSectionDragHandlers(this.view, details, 'tag');
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

        renderSortButton(summary, this.view.tagSort, (sort) => {
            this.view.setTagSort(sort);
            this.view.setManualRefresh(true);
            this.view.onRefresh();
        });

        const groupList = details.createDiv({ cls: 'web-sidecar-domain-list' });
        const sortedGroups = sortGroups(tagMap, this.view.tagSort);

        for (const [tag, notes] of sortedGroups) {
            this.renderTagGroup(groupList, tag, notes, 'tag');
        }
    }

    /**
     * Render "Group web notes from selected tags" section
     */
    renderSelected(container: HTMLElement): void {
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

        addSectionDragHandlers(this.view, details, 'selected-tag');
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

        renderSortButton(summary, this.view.selectedTagSort, (sort) => {
            this.view.setSelectedTagSort(sort);
            this.view.setManualRefresh(true);
            this.view.onRefresh();
        });

        const groupList = details.createDiv({ cls: 'web-sidecar-domain-list' });
        const sortedGroups = sortGroups(tagMap, this.view.selectedTagSort);

        for (const [tag, notes] of sortedGroups) {
            // Using same group renderer but maybe different ID prefix to allow separate expansion states
            this.renderTagGroup(groupList, tag, notes, 'selected-tag');
        }
    }

    private renderTagGroup(container: HTMLElement, tag: string, notes: MatchedNote[], sectionPrefix: string): void {
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
