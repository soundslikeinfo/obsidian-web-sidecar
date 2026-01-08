
import { setIcon } from 'obsidian';
import { IWebSidecarView, MatchedNote } from '../../../types';
import { NoteRenderer } from '../NoteRenderer';
import { getAllGithubNotes } from '../../../services/matchers/github';
import { getFaviconUrl } from '../../../services/faviconUtils';
import { addSectionDragHandlers, renderSortButton, sortGroups } from './SectionHelpers';

export class GithubSection {
    constructor(
        private view: IWebSidecarView,
        private noteRenderer: NoteRenderer
    ) { }

    /**
     * Render "GitHub repository notes explorer" collapsible section
     */
    render(container: HTMLElement): void {
        if (!this.view.settings.enableGithubExplorer) return;

        const repoMap = getAllGithubNotes(
            this.view.app, this.view.settings, this.view.urlIndex
        );
        if (repoMap.size === 0) return;

        // Remove existing section before creating new one
        const existingSection = container.querySelector('[data-section-id="github"]');
        if (existingSection) existingSection.remove();

        const details = container.createEl('details', {
            cls: 'web-sidecar-domain-section web-sidecar-aux-section'
        });
        details.setAttribute('data-section-id', 'github');
        details.setAttribute('draggable', 'true');

        addSectionDragHandlers(this.view, details, 'github');

        // Preserve open state
        if (this.view.isGithubExplorerOpen) {
            details.setAttribute('open', '');
        }
        details.addEventListener('toggle', () => {
            this.view.setGithubExplorerOpen(details.hasAttribute('open'));
        });

        const summary = details.createEl('summary', { cls: 'web-sidecar-domain-summary' });
        const summaryIcon = summary.createSpan({ cls: 'web-sidecar-domain-icon' });

        // GitHub favicon
        summaryIcon.createEl('img', {
            cls: 'web-sidecar-favicon-small',
            attr: {
                src: getFaviconUrl('github.com', 16),
                alt: 'GitHub',
                width: '14',
                height: '14'
            }
        });

        summary.createSpan({ text: `GitHub repos (${repoMap.size})` });

        // Sort button
        renderSortButton(summary, this.view.githubSort, (sort) => {
            this.view.setGithubSort(sort);
            this.view.setManualRefresh(true);
            this.view.onRefresh();
        });

        const groupList = details.createDiv({ cls: 'web-sidecar-domain-list' });
        const sortedRepos = sortGroups(repoMap, this.view.githubSort);

        for (const [repo, notes] of sortedRepos) {
            this.renderGithubRepoGroup(groupList, repo, notes);
        }
    }

    /**
     * Render a single GitHub repo group
     */
    private renderGithubRepoGroup(
        container: HTMLElement,
        repo: string,
        notes: MatchedNote[]
    ): void {
        const details = container.createEl('details', { cls: 'web-sidecar-domain-group' });

        // State persistence
        const groupId = `github:${repo}`;
        if (this.view.expandedGroupIds.has(groupId)) {
            details.setAttribute('open', '');
        }
        details.addEventListener('toggle', () => {
            this.view.setGroupExpanded(groupId, details.hasAttribute('open'));
        });

        const summary = details.createEl('summary', { cls: 'web-sidecar-domain-row' });

        // Repo icon (GH icon as fallback since owner avatar requires API)
        const faviconContainer = summary.createDiv({ cls: 'web-sidecar-domain-favicon' });
        faviconContainer.createEl('img', {
            attr: {
                src: getFaviconUrl('github.com', 16),
                alt: '',
                width: '14',
                height: '14'
            }
        });

        // Repo name (owner/repo)
        summary.createSpan({ text: repo, cls: 'web-sidecar-domain-name' });

        // External Link to GitHub repo
        // https://github.com/owner/repo
        const repoUrl = `https://github.com/${repo}`;
        const extLinkBtn = summary.createEl('button', {
            cls: 'web-sidecar-group-link-btn clickable-icon',
            attr: { 'aria-label': `Open ${repo} on GitHub` }
        });
        setIcon(extLinkBtn, 'external-link');
        extLinkBtn.onclick = async (e) => {
            e.preventDefault();
            e.stopPropagation();
            await this.view.openUrlSmartly(repoUrl, e);
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
            this.noteRenderer.renderNoteItem(notesList, note.file, note.url, false, false);
        }
    }
}
