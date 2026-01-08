import { App } from 'obsidian';
import { WebSidecarSettings } from '../types';
import { getLeafId, getViewFile } from './obsidianHelpers';
import { getWebViewerLeaves, getMarkdownLeaves } from './navigationLeafHelpers';
import { findMatchingNotes } from './noteMatcher';
import type { UrlIndex } from './UrlIndex';

export interface CloseCallbacks {
    isManualRefreshCallback: (val: boolean) => void;
    onRefreshCallback: () => void;
}

/**
 * Close a specific web viewer leaf by ID
 */
export function closeWebViewerLeaf(
    app: App,
    leafId: string,
    callbacks: CloseCallbacks
): void {
    const leaves = getWebViewerLeaves(app);

    for (const leaf of leaves) {
        const id = getLeafId(leaf) || leaf.view.getViewType() + '-' + leaves.indexOf(leaf);
        if (id === leafId) {
            leaf.detach();
        }
    }

    // Fallback: try getLeafById if it works with internal IDs
    const leaf = app.workspace.getLeafById(leafId);
    if (leaf) {
        leaf.detach();
    }

    callbacks.isManualRefreshCallback(true);
    callbacks.onRefreshCallback();

    // Delayed refresh to ensure UI catches up
    setTimeout(() => {
        callbacks.isManualRefreshCallback(true);
        callbacks.onRefreshCallback();
    }, 100);
}

/**
 * Close all web viewer leaves for a specific URL
 */
export function closeAllWebViewersForUrl(
    app: App,
    url: string,
    callbacks: CloseCallbacks
): void {
    const leaves = getWebViewerLeaves(app);

    for (const leaf of leaves) {
        const state = leaf.view.getState();
        if (state?.url === url) {
            leaf.detach();
        }
    }

    callbacks.isManualRefreshCallback(true);
    callbacks.onRefreshCallback();

    // Delayed refresh to ensure UI catches up
    setTimeout(() => {
        callbacks.isManualRefreshCallback(true);
        callbacks.onRefreshCallback();
    }, 100);
}

/**
 * Close all linked note leaves for a URL
 */
export function closeLinkedNoteLeaves(
    app: App,
    url: string,
    settings: WebSidecarSettings,
    urlIndex: UrlIndex,
    callbacks: CloseCallbacks
): void {
    const matches = findMatchingNotes(app, url, settings, urlIndex);
    const allMatches = [...matches.exactMatches, ...matches.tldMatches];

    if (matches.subredditMatches) {
        matches.subredditMatches.forEach(notes => allMatches.push(...notes));
    }

    if (allMatches.length === 0) return;

    const filePaths = new Set(allMatches.map(m => m.file.path));
    const leaves = getMarkdownLeaves(app);

    for (const leaf of leaves) {
        const file = getViewFile(leaf.view);
        if (file && filePaths.has(file.path)) {
            leaf.detach();
        }
    }

    callbacks.isManualRefreshCallback(true);
    callbacks.onRefreshCallback();

    // Multiple delayed refreshes to ensure UI catches up after bulk close
    setTimeout(() => {
        callbacks.isManualRefreshCallback(true);
        callbacks.onRefreshCallback();
    }, 150);

    setTimeout(() => {
        callbacks.isManualRefreshCallback(true);
        callbacks.onRefreshCallback();
    }, 400);
}
