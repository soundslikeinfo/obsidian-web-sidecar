import { ItemView, WorkspaceLeaf, TFile, setIcon } from 'obsidian';
import type { WebSidecarSettings, WebViewerInfo } from './types';
import { findMatchingNotes, getRecentNotesWithUrls } from './noteMatcher';
import { extractDomain } from './urlUtils';
import { CreateNoteModal } from './createNoteModal';

export const VIEW_TYPE_WEB_SIDECAR = 'web-sidecar-view';

/**
 * Sidebar view for Web Sidecar plugin
 */
export class WebSidecarView extends ItemView {
    private settings: WebSidecarSettings;
    private currentInfo: WebViewerInfo | null = null;
    private getSettings: () => WebSidecarSettings;
    private onRefresh: () => void;

    constructor(
        leaf: WorkspaceLeaf,
        getSettings: () => WebSidecarSettings,
        onRefresh: () => void
    ) {
        super(leaf);
        this.getSettings = getSettings;
        this.onRefresh = onRefresh;
        this.settings = getSettings();
    }

    getViewType(): string {
        return VIEW_TYPE_WEB_SIDECAR;
    }

    getDisplayText(): string {
        return 'Web Sidecar';
    }

    getIcon(): string {
        return 'globe';
    }

    async onOpen(): Promise<void> {
        this.settings = this.getSettings();
        this.renderEmptyState();
    }

    async onClose(): Promise<void> {
        // Cleanup
    }

    /**
     * Update the view with web viewer info
     */
    updateWithInfo(info: WebViewerInfo | null): void {
        this.settings = this.getSettings();
        this.currentInfo = info;

        if (!info) {
            this.renderEmptyState();
        } else {
            this.renderUrlMatches(info);
        }
    }

    /**
     * Legacy method for compatibility
     */
    updateUrl(url: string | null): void {
        if (url) {
            this.updateWithInfo({ url });
        } else {
            this.updateWithInfo(null);
        }
    }

    /**
     * Render the empty state with recent notes
     */
    private renderEmptyState(): void {
        const container = this.containerEl.children[1] as HTMLElement;
        container.empty();
        container.addClass('web-sidecar-container');

        // Header with refresh button
        const header = container.createDiv({ cls: 'web-sidecar-header' });
        const headerRow = header.createDiv({ cls: 'web-sidecar-header-row' });
        headerRow.createEl('h4', { text: 'No web viewer active' });

        const refreshBtn = headerRow.createEl('button', {
            cls: 'web-sidecar-refresh-btn clickable-icon',
            attr: { 'aria-label': 'Refresh' }
        });
        setIcon(refreshBtn, 'refresh-cw');
        refreshBtn.addEventListener('click', () => this.onRefresh());

        // Recent notes section
        const recentNotes = getRecentNotesWithUrls(
            this.app,
            this.settings,
            this.settings.recentNotesCount
        );

        if (recentNotes.length > 0) {
            const recentSection = container.createDiv({ cls: 'web-sidecar-section' });
            recentSection.createEl('h5', { text: 'Recent notes with URLs' });

            const list = recentSection.createEl('ul', { cls: 'web-sidecar-list' });

            for (const note of recentNotes) {
                this.renderNoteItem(list, note.file, note.url);
            }
        } else {
            container.createEl('p', {
                text: 'No notes with URL properties found.',
                cls: 'web-sidecar-empty-text'
            });
        }
    }

    /**
     * Render matches for a URL
     */
    private renderUrlMatches(info: WebViewerInfo): void {
        const container = this.containerEl.children[1] as HTMLElement;
        container.empty();
        container.addClass('web-sidecar-container');

        const url = info.url;
        const domain = extractDomain(url);

        // Header section with site info
        const header = container.createDiv({ cls: 'web-sidecar-header' });

        // Header row with title and refresh button
        const headerRow = header.createDiv({ cls: 'web-sidecar-header-row' });

        // Site info with favicon
        const siteInfo = headerRow.createDiv({ cls: 'web-sidecar-site-info' });

        // Favicon
        if (domain) {
            const favicon = siteInfo.createEl('img', {
                cls: 'web-sidecar-favicon',
                attr: {
                    src: `https://www.google.com/s2/favicons?domain=${domain}&sz=32`,
                    alt: '',
                    width: '16',
                    height: '16'
                }
            });
            favicon.onerror = () => {
                favicon.style.display = 'none';
            };
        }

        // Title
        const title = info.title || domain || 'Web Page';
        siteInfo.createEl('span', { text: title, cls: 'web-sidecar-site-title' });

        // Refresh button
        const refreshBtn = headerRow.createEl('button', {
            cls: 'web-sidecar-refresh-btn clickable-icon',
            attr: { 'aria-label': 'Refresh' }
        });
        setIcon(refreshBtn, 'refresh-cw');
        refreshBtn.addEventListener('click', () => this.onRefresh());

        // URL display (smaller, below title)
        const urlDisplay = header.createDiv({ cls: 'web-sidecar-url' });
        urlDisplay.createEl('code', { text: url, cls: 'web-sidecar-full-url' });

        // Create note button
        const createBtn = header.createEl('button', {
            cls: 'web-sidecar-create-btn',
            attr: { 'aria-label': 'Create note for this URL' }
        });
        setIcon(createBtn, 'plus');
        createBtn.createSpan({ text: 'Create note' });
        createBtn.addEventListener('click', () => this.openCreateNoteModal(url));

        // Find matches
        const matches = findMatchingNotes(this.app, url, this.settings);

        // Exact matches section
        this.renderMatchSection(
            container,
            'Exact matches',
            matches.exactMatches.map(m => ({ file: m.file, url: m.url })),
            'exact'
        );

        // TLD matches section (collapsible)
        if (this.settings.enableTldSearch && matches.tldMatches.length > 0) {
            this.renderCollapsibleSection(
                container,
                `Same domain (${domain})`,
                matches.tldMatches.map(m => ({ file: m.file, url: m.url }))
            );
        }

        // Empty state for no matches
        if (matches.exactMatches.length === 0 && matches.tldMatches.length === 0) {
            container.createEl('p', {
                text: 'No matching notes found.',
                cls: 'web-sidecar-empty-text'
            });
        }
    }

    /**
     * Render a section with matched notes
     */
    private renderMatchSection(
        container: HTMLElement,
        title: string,
        notes: { file: TFile; url: string }[],
        type: 'exact' | 'tld'
    ): void {
        if (notes.length === 0) return;

        const section = container.createDiv({ cls: `web-sidecar-section web-sidecar-${type}` });
        section.createEl('h5', { text: `${title} (${notes.length})` });

        const list = section.createEl('ul', { cls: 'web-sidecar-list' });

        for (const note of notes) {
            this.renderNoteItem(list, note.file, note.url);
        }
    }

    /**
     * Render a collapsible section
     */
    private renderCollapsibleSection(
        container: HTMLElement,
        title: string,
        notes: { file: TFile; url: string }[]
    ): void {
        const details = container.createEl('details', { cls: 'web-sidecar-collapsible' });
        const summary = details.createEl('summary');
        summary.createSpan({ text: `${title} (${notes.length})` });

        const list = details.createEl('ul', { cls: 'web-sidecar-list' });

        for (const note of notes) {
            this.renderNoteItem(list, note.file, note.url);
        }
    }

    /**
     * Render a single note item
     */
    private renderNoteItem(list: HTMLElement, file: TFile, url: string): void {
        const li = list.createEl('li', { cls: 'web-sidecar-item' });

        const link = li.createEl('a', {
            text: file.basename,
            cls: 'web-sidecar-link',
            attr: { href: '#' }
        });

        link.addEventListener('click', (e) => {
            e.preventDefault();
            this.app.workspace.openLinkText(file.path, '', true);
        });

        // Show URL snippet
        const urlSnippet = li.createEl('span', {
            cls: 'web-sidecar-url-snippet'
        });
        const domain = extractDomain(url);
        urlSnippet.setText(domain || url);
    }

    /**
     * Open the create note modal
     */
    private openCreateNoteModal(url: string): void {
        new CreateNoteModal(
            this.app,
            url,
            this.settings,
            async (path) => {
                // Open the newly created note
                const file = this.app.vault.getAbstractFileByPath(path);
                if (file instanceof TFile) {
                    await this.app.workspace.openLinkText(path, '', true);
                }
                // Refresh the view
                this.onRefresh();
            }
        ).open();
    }
}
