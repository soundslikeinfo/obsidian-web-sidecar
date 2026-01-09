/*
 * Web Sidecar
 * Copyright (c) 2025 soundslikeinfo
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { App, WorkspaceLeaf, WorkspaceSplit } from 'obsidian';

/**
 * Check if a leaf is in the main content area (not a sidebar)
 */
export function isInMainArea(app: App, leaf: WorkspaceLeaf): boolean {
    let current: WorkspaceSplit | null = leaf.parent;
    const rootSplit = app.workspace.rootSplit;

    while (current) {
        if (current === rootSplit) {
            return true;
        }
        current = current.parent;
    }
    return false;
}

/**
 * Check if a leaf is in a popout window (not the main window)
 */
export function isPopout(app: App, leaf: WorkspaceLeaf): boolean {
    return leaf.getRoot() !== app.workspace.rootSplit;
}

/**
 * Get all leaves in the main content area (excluding sidebars)
 */
export function getMainAreaLeaves(app: App): WorkspaceLeaf[] {
    const workspace = app.workspace;
    const allLeaves = workspace.getLeavesOfType('markdown')
        .concat(workspace.getLeavesOfType('webviewer'))
        .concat(workspace.getLeavesOfType('surfing-view'))
        .concat(workspace.getLeavesOfType('empty'));

    return allLeaves.filter(leaf => isInMainArea(app, leaf));
}

/**
 * Get all web viewer leaves (webviewer + surfing-view)
 */
export function getWebViewerLeaves(app: App): WorkspaceLeaf[] {
    return app.workspace.getLeavesOfType('webviewer')
        .concat(app.workspace.getLeavesOfType('surfing-view'));
}

/**
 * Get all markdown leaves
 */
export function getMarkdownLeaves(app: App): WorkspaceLeaf[] {
    return app.workspace.getLeavesOfType('markdown');
}

/**
 * Find web viewer leaves matching a specific URL
 */
export function findWebViewersByUrl(app: App, url: string): WorkspaceLeaf[] {
    return getWebViewerLeaves(app).filter(leaf => {
        const state = leaf.view.getState();
        return state?.url === url;
    });
}

/**
 * Find a blank/empty web viewer that can be reused
 */
export function findBlankWebViewer(app: App): WorkspaceLeaf | null {
    const leaves = getWebViewerLeaves(app);
    for (const leaf of leaves) {
        const state = leaf.view.getState();
        if (!state?.url || state.url === 'about:blank' || state.url === '') {
            return leaf;
        }
    }
    return null;
}
