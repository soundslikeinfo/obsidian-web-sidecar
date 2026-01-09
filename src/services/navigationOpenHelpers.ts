/*
 * Web Sidecar
 * Copyright (c) 2025 soundslikeinfo
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { App, TFile, WorkspaceLeaf } from 'obsidian';
import { WebSidecarSettings } from '../types';
import { getViewFile } from './obsidianHelpers';
import {
    getWebViewerLeaves,
    getMainAreaLeaves,
    findBlankWebViewer
} from './navigationLeafHelpers';

export interface OpenPairedContext {
    app: App;
    getSettings: () => WebSidecarSettings;
    getOrCreateRightLeaf: (ref?: WorkspaceLeaf) => WorkspaceLeaf;
    triggerRefresh: () => Promise<void>;
}

/**
 * Open both web viewer AND note together (paired opening)
 */
export async function openPaired(
    ctx: OpenPairedContext,
    file: TFile,
    url: string,
    e: MouseEvent
): Promise<void> {
    const { app, getSettings, getOrCreateRightLeaf, triggerRefresh } = ctx;

    // CMD/Ctrl + click = open in new popout window
    if (e.metaKey || e.ctrlKey) {
        const newWindow = app.workspace.openPopoutLeaf();
        await newWindow.openFile(file);
        return;
    }

    const webLeaves = getWebViewerLeaves(app);
    let webLeaf: WorkspaceLeaf | null = null;

    // Check if URL is already open
    for (const leaf of webLeaves) {
        const state = leaf.view.getState();
        if (state?.url === url) {
            webLeaf = leaf;
            break;
        }
    }

    // Check if note is already open
    const markdownLeaves = app.workspace.getLeavesOfType('markdown');
    let noteLeaf: WorkspaceLeaf | null = null;
    for (const leaf of markdownLeaves) {
        const viewFile = getViewFile(leaf.view);
        if (viewFile && viewFile.path === file.path) {
            noteLeaf = leaf;
            break;
        }
    }

    // Both already open - just focus note
    if (webLeaf && noteLeaf) {
        await app.workspace.revealLeaf(noteLeaf);
        return;
    }

    const settings = getSettings();

    // Web viewer exists - just open/focus note
    if (webLeaf) {
        if (noteLeaf) {
            await app.workspace.revealLeaf(noteLeaf);
        } else if (settings.noteOpenBehavior === 'split') {
            const newNoteLeaf = getOrCreateRightLeaf(webLeaf);
            await newNoteLeaf.openFile(file);
        } else {
            const newNoteLeaf = app.workspace.getLeaf('tab');
            await newNoteLeaf.openFile(file);
        }
        return;
    }

    // Need to create web viewer
    const blankWebLeaf = findBlankWebViewer(app);
    if (blankWebLeaf) {
        webLeaf = blankWebLeaf;
    } else {
        let parentLeaf = app.workspace.getLeaf();
        const mainLeaves = getMainAreaLeaves(app);

        if (mainLeaves.length > 0) {
            const webGroupLeaf = mainLeaves.find(l => l.view.getViewType() === 'webviewer');
            if (webGroupLeaf) {
                parentLeaf = webGroupLeaf;
            } else {
                parentLeaf = mainLeaves[0]!;
            }
        }

        webLeaf = app.workspace.createLeafInParent(parentLeaf.parent, -1);
    }

    await webLeaf.setViewState({
        type: 'webviewer',
        state: { url, navigate: true }
    });

    // Open note
    if (noteLeaf) {
        await app.workspace.revealLeaf(noteLeaf);
    } else if (settings.noteOpenBehavior === 'split') {
        const newNoteLeaf = getOrCreateRightLeaf(webLeaf);
        await newNoteLeaf.openFile(file);
    } else {
        const newNoteLeaf = app.workspace.getLeaf('tab');
        await newNoteLeaf.openFile(file);
    }

    await triggerRefresh();
}
