import { TFile, WorkspaceLeaf } from 'obsidian';
import { IWebSidecarView, TrackedWebViewer, PinnedTab } from '../../types';
import { openWebViewerAndRefresh, openInDefaultBrowser } from './context-menus/ContextMenuHelpers';
import { showWebViewerContextMenu } from './context-menus/WebViewerContextMenu';
import { showNoteContextMenu } from './context-menus/NoteContextMenu';
import { showVirtualTabContextMenu } from './context-menus/VirtualTabContextMenu';
import { showPinnedTabContextMenu } from './context-menus/PinnedTabContextMenu';
import { showDomainContextMenu, showSubredditContextMenu } from './context-menus/GroupContextMenu';

export class ContextMenus {
    private view: IWebSidecarView;

    constructor(view: IWebSidecarView) {
        this.view = view;
    }

    /**
     * Helper: Open a web viewer and trigger triple forced refresh for UI update
     */
    private async openWebViewerAndRefresh(
        leafGetter: () => WorkspaceLeaf,
        url: string,
        reveal: boolean = false
    ): Promise<void> {
        return openWebViewerAndRefresh(this.view, leafGetter, url, reveal);
    }

    /**
     * Show context menu for a web viewer tab
     */
    showWebViewerContextMenu(event: MouseEvent, tab: TrackedWebViewer): void {
        showWebViewerContextMenu(this.view, event, tab);
    }

    /**
     * Show context menu for a note item
     */
    showNoteContextMenu(event: MouseEvent, file: TFile, url: string): void {
        showNoteContextMenu(this.view, event, file, url);
    }

    /**
     * Show context menu for a virtual tab (open note with URL, no active web tab)
     */
    showVirtualTabContextMenu(event: MouseEvent, url: string, file: TFile): void {
        showVirtualTabContextMenu(this.view, event, url, file);
    }

    /**
     * Show context menu for a domain group (Web domains)
     */
    showDomainContextMenu(event: MouseEvent, domain: string): void {
        showDomainContextMenu(this.view, event, domain);
    }

    /**
     * Show context menu for a subreddit group (Subreddit notes explorer)
     */
    showSubredditContextMenu(event: MouseEvent, subreddit: string): void {
        showSubredditContextMenu(this.view, event, subreddit);
    }

    /**
     * Helper to open URL in system default browser mechanism
     */
    private openInDefaultBrowser(url: string): void {
        openInDefaultBrowser(url);
    }

    /**
     * Show context menu for a Pinned Tab
     */
    showPinnedTabContextMenu(event: MouseEvent, pin: PinnedTab): void {
        showPinnedTabContextMenu(this.view, event, pin);
    }
}

