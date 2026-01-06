import { setIcon } from 'obsidian';
import { IWebSidecarView } from '../../../types';
import { NoteRenderer } from '../NoteRenderer';
import { getRecentNotesWithUrls } from '../../../services/noteMatcher';
import { addSectionDragHandlers } from './SectionHelpers';

export class RecentNotesSection {
    constructor(
        private view: IWebSidecarView,
        private noteRenderer: NoteRenderer
    ) { }

    /**
     * Render the collapsible "Recent web notes" section
     */
    render(container: HTMLElement): void {
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
        addSectionDragHandlers(this.view, details, 'recent');

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
     * Render the empty state with recent notes (fallback when no tabs open)
     */
    renderEmptyState(container: HTMLElement): void {
        // Check if linked mode - use consistent layout
        if (this.view.settings.tabAppearance === 'linked-mode') {
            // No controls needed here - nav-header already provides refresh button

            // "+ New web tab" button (always visible)
            const newTabBtn = container.createDiv({ cls: 'web-sidecar-new-tab-btn' });
            const plusIcon = newTabBtn.createSpan({ cls: 'web-sidecar-new-tab-icon' });
            setIcon(plusIcon, 'plus');
            newTabBtn.createSpan({ text: 'New web viewer', cls: 'web-sidecar-new-tab-text' });
            newTabBtn.addEventListener('click', () => this.view.openNewWebViewer());
            // Orchestration of aux sections happens in SectionRenderer
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
}
