
import { IWebSidecarView } from '../../types';
import { NoteRenderer } from './NoteRenderer';
import { ContextMenus } from './ContextMenus';
import { addEndDropZone } from './sections/SectionHelpers';
import { RecentNotesSection } from './sections/RecentNotesSection';
import { DomainSection } from './sections/DomainSection';
import { SubredditSection } from './sections/SubredditSection';
import { TagSection } from './sections/TagSection';
import { YouTubeSection } from './sections/YouTubeSection';
import { TwitterSection } from './sections/TwitterSection';

export class SectionRenderer {
    private view: IWebSidecarView;
    private noteRenderer: NoteRenderer;
    private contextMenus: ContextMenus;

    // Sub-renderers
    private recentSection: RecentNotesSection;
    private domainSection: DomainSection;
    private subredditSection: SubredditSection;
    private tagSection: TagSection;
    private youtubeSection: YouTubeSection;
    private twitterSection: TwitterSection;

    constructor(view: IWebSidecarView, noteRenderer: NoteRenderer, contextMenus: ContextMenus) {
        this.view = view;
        this.noteRenderer = noteRenderer;
        this.contextMenus = contextMenus;

        // Initialize sub-renderers
        this.recentSection = new RecentNotesSection(view, noteRenderer);
        this.domainSection = new DomainSection(view, noteRenderer, contextMenus);
        this.subredditSection = new SubredditSection(view, noteRenderer, contextMenus);
        this.tagSection = new TagSection(view, noteRenderer);
        this.youtubeSection = new YouTubeSection(view, noteRenderer);
        this.twitterSection = new TwitterSection(view, noteRenderer);
    }

    /**
     * Render the empty state with recent notes
     */
    renderEmptyState(container: HTMLElement): void {
        this.recentSection.renderEmptyState(container);

        // If linked mode, we also render auxiliary sections below
        if (this.view.settings.tabAppearance === 'linked-mode') {
            this.renderAuxiliarySections(container);
        }
    }

    /**
     * Render the collapsible "Recent web notes" section
     */
    renderRecentWebNotesSection(container: HTMLElement): void {
        this.recentSection.render(container);
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
        const tabListContainer = container.querySelector('.web-sidecar-linked-notes-tabs');

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
                        this.recentSection.render(auxContainer);
                    }
                    break;
                case 'domain':
                    if (this.view.settings.enableTldSearch) {
                        this.domainSection.render(auxContainer);
                    }
                    break;
                case 'subreddit':
                    if (this.view.settings.enableSubredditExplorer) {
                        this.subredditSection.render(auxContainer);
                    }
                    break;
                case 'tag':
                    if (this.view.settings.enableTagGrouping) {
                        this.tagSection.render(auxContainer);
                    }
                    break;
                case 'selected-tag':
                    if (this.view.settings.enableSelectedTagGrouping) {
                        this.tagSection.renderSelected(auxContainer);
                    }
                    break;
                case 'youtube':
                    if (this.view.settings.enableYouTubeChannelExplorer) {
                        this.youtubeSection.render(auxContainer);
                    }
                    break;
                case 'twitter':
                    if (this.view.settings.enableTwitterExplorer) {
                        this.twitterSection.render(auxContainer);
                    }
                    break;
            }
        }

        // Add an end-of-list drop zone to allow dropping sections at the very end
        addEndDropZone(this.view, auxContainer);
    }

    // Delegation methods for specific sections if needed individually (kept for API compatibility if any)

    renderDomainGroupingSection(container: HTMLElement): void {
        this.domainSection.render(container);
    }

    renderSubredditExplorerSection(container: HTMLElement): void {
        this.subredditSection.render(container);
    }

    renderTagGroupingSection(container: HTMLElement): void {
        this.tagSection.render(container);
    }

    renderSelectedTagGroupingSection(container: HTMLElement): void {
        this.tagSection.renderSelected(container);
    }

    renderYouTubeChannelExplorerSection(container: HTMLElement): void {
        this.youtubeSection.render(container);
    }

    renderTwitterExplorerSection(container: HTMLElement): void {
        this.twitterSection.render(container);
    }
}
