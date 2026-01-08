
import { TFile, View, setIcon, App, WorkspaceLeaf, MarkdownView } from 'obsidian';
import { MatchResult, WebSidecarSettings, IWebSidecarView } from '../../../types';
import { extractDomain } from '../../../services/urlUtils';
import { leafHasFile } from '../../../services/obsidianHelpers';
import { ContextMenus } from '../ContextMenus';

export interface NoteRowContext {
    view: IWebSidecarView;
    contextMenus: ContextMenus;
    settings: WebSidecarSettings;
}

export interface NoteRowOptions {
    file: TFile;
    url: string;
    stopPropagation?: boolean;
}

/**
 * Checks if a note is currently focused in the workspace
 */
export function isNoteFocused(app: App, view: IWebSidecarView, filePath: string): boolean {
    let activeLeaf = app.workspace.getActiveViewOfType(View)?.leaf;
    // Handle sidecar focus/fallback
    if (activeLeaf === view.leaf && view.lastActiveLeaf) {
        activeLeaf = view.lastActiveLeaf;
    }

    // Check if active leaf matches file path
    // We use a looser check here to match original logic safely
    if (activeLeaf?.view instanceof MarkdownView && activeLeaf.view.file?.path === filePath) {
        return true;
    }
    return false;
}

/**
 * Checks if a note is open anywhere in the workspace
 */
export function isNoteOpen(app: App, filePath: string): boolean {
    let isOpen = false;
    app.workspace.iterateAllLeaves((leaf: WorkspaceLeaf) => {
        if (leafHasFile(leaf, filePath)) {
            isOpen = true;
        }
    });
    return isOpen;
}

/**
 * Creates a standard note list item with link
 */
export function createNoteLink(
    container: HTMLElement,
    options: NoteRowOptions,
    ctx: NoteRowContext
): HTMLElement {
    const { file, url, stopPropagation } = options;
    const { view, contextMenus, settings } = ctx;

    const li = container.createEl('li');
    li.setAttribute('data-note-path', file.path);

    // Apply focused state
    if (isNoteFocused(view.app, view, file.path)) {
        li.addClass('is-focused');
    }

    // Apply open/closed state
    if (settings.linkedNoteDisplayStyle !== 'none') {
        const isOpen = isNoteOpen(view.app, file.path);
        li.addClass(isOpen ? 'is-open' : 'is-closed');
    }

    const link = li.createEl('a', {
        text: file.basename,
        cls: 'web-sidecar-linked-notes-note-link',
        attr: { href: '#' }
    });

    link.addEventListener('click', (e) => {
        e.preventDefault();
        if (stopPropagation) e.stopPropagation();
        void view.openNoteSmartly(file, e);
    });

    link.addEventListener('contextmenu', (e) => {
        if (stopPropagation) e.stopPropagation();
        contextMenus.showNoteContextMenu(e, file, url);
    });

    return li;
}

/**
 * Creates a "New linked note" button
 */
export function createNewNoteButton(
    container: HTMLElement,
    url: string,
    leafId: string | undefined,
    ctx: NoteRowContext
): HTMLElement {
    const { view } = ctx;

    const newNoteBtn = container.createDiv({ cls: 'web-sidecar-new-note-btn' });
    const noteIcon = newNoteBtn.createSpan({ cls: 'web-sidecar-new-note-icon' });
    setIcon(noteIcon, 'file-plus');
    newNoteBtn.createSpan({ text: 'New linked note', cls: 'web-sidecar-new-note-text' });
    newNoteBtn.setAttribute('aria-label', 'New linked note');

    newNoteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        view.openCreateNoteModal(url, leafId);
    });

    return newNoteBtn;
}

/**
 * Generates the header text for "More web notes"
 */
export function getMoreNotesHeader(url: string, settings: WebSidecarSettings, matchedChannel?: string): string {
    const domain = extractDomain(url);

    if (matchedChannel) {
        return `More from ${matchedChannel}`;
    }

    // Simplify to domain-based header
    return `More web notes (${domain || 'this domain'})`;
}

/**
 * Renders the collapsible TLD/Domain matches section
 */
export function renderTldSection(
    container: HTMLElement,
    url: string,
    matches: MatchResult,
    ctx: NoteRowContext,
    stopPropagation: boolean = false
): void {
    const { view, contextMenus, settings } = ctx;

    const domain = extractDomain(url);
    let headerText = `More web notes (${domain || 'this domain'})`;

    // Note: Use matches.matchedChannel if available
    if (matches.matchedChannel) {
        headerText = `More from ${matches.matchedChannel}`;
    }

    // Create collapsible details element
    const details = container.createEl('details', { cls: 'web-sidecar-tld-section' });
    const summary = details.createEl('summary', { cls: 'web-sidecar-linked-notes-subtitle' });
    summary.createSpan({ text: headerText });

    // Stop propagation to prevent parent tab collapse/expand
    summary.addEventListener('click', (e) => e.stopPropagation());
    details.addEventListener('click', (e) => e.stopPropagation());

    const domainList = details.createEl('ul', { cls: 'web-sidecar-linked-notes-note-list' });

    for (const match of matches.tldMatches) {
        const li = domainList.createEl('li');

        // Apply open/closed styling
        if (settings.linkedNoteDisplayStyle !== 'none') {
            const isOpen = isNoteOpen(view.app, match.file.path);
            li.addClass(isOpen ? 'is-open' : 'is-closed');
        }

        const link = li.createEl('a', {
            text: match.file.basename,
            cls: 'web-sidecar-linked-notes-note-link web-sidecar-muted',
            attr: { href: '#' }
        });

        link.addEventListener('click', (e) => {
            e.preventDefault();
            if (stopPropagation) e.stopPropagation();
            void view.openNoteSmartly(match.file, e);
        });

        link.addEventListener('contextmenu', (e) => {
            if (stopPropagation) e.stopPropagation();
            contextMenus.showNoteContextMenu(e, match.file, match.url);
        });
    }
}

/**
 * Apply style-mode class to container
 */
export function applyStyleModeClass(container: HTMLElement, settings: WebSidecarSettings): void {
    if (settings.linkedNoteDisplayStyle === 'style') {
        container.addClass('style-mode');
    } else {
        container.removeClass('style-mode');
    }
}
