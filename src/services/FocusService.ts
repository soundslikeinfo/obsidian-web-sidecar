/*
 * Web Sidecar
 * Copyright (c) 2025 soundslikeinfo
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { App } from 'obsidian';
import { getLeafId, leafHasFile } from './obsidianHelpers';
import { TrackedWebViewer } from '../types';

/**
 * Handles focus cycling and tab focusing operations
 */
export class FocusService {
    private urlCycleIndex: Map<string, number> = new Map();
    private noteCycleIndex: Map<string, number> = new Map();

    constructor(private app: App) { }

    /**
     * Focus a specific web viewer leaf by ID
     */
    async focusWebViewer(leafId: string): Promise<void> {
        const leaves = this.app.workspace.getLeavesOfType('webviewer')
            .concat(this.app.workspace.getLeavesOfType('surfing-view'));

        for (const leaf of leaves) {
            const id = getLeafId(leaf) || leaf.view.getViewType() + '-' + leaves.indexOf(leaf);
            if (id === leafId) {
                await this.app.workspace.revealLeaf(leaf);
                this.app.workspace.setActiveLeaf(leaf, { focus: true });
                return;
            }
        }
    }

    /**
     * Robustly focus a tracked tab using its leaf reference if available
     */
    focusTab(tab: TrackedWebViewer): void {
        if (tab.leaf) {
            if (tab.leaf.view && tab.leaf.parent) {
                void this.app.workspace.revealLeaf(tab.leaf);
                this.app.workspace.setActiveLeaf(tab.leaf, { focus: true });
                return;
            }
        }
        void this.focusWebViewer(tab.leafId);
    }

    /**
     * Focus the next instance of a URL (cycle through duplicates)
     */
    focusNextInstance(url: string, allTabs: TrackedWebViewer[]): void {
        if (allTabs.length === 0) return;

        const currentIndex = this.urlCycleIndex.get(url) || 0;
        const nextIndex = (currentIndex + 1) % allTabs.length;
        this.urlCycleIndex.set(url, nextIndex);

        const targetTab = allTabs[nextIndex];
        if (targetTab) {
            this.focusTab(targetTab);
        }
    }

    /**
     * Focus the next instance of a note file (cycle through multiple open tabs)
     */
    focusNextNoteInstance(filePath: string): void {
        const leaves = this.app.workspace.getLeavesOfType('markdown')
            .filter(leaf => leafHasFile(leaf, filePath));

        if (leaves.length === 0) return;

        if (leaves.length === 1) {
            void this.app.workspace.revealLeaf(leaves[0]!);
            this.app.workspace.setActiveLeaf(leaves[0]!, { focus: true });
            return;
        }

        const currentIndex = this.noteCycleIndex.get(filePath) || 0;
        const nextIndex = (currentIndex + 1) % leaves.length;
        this.noteCycleIndex.set(filePath, nextIndex);

        void this.app.workspace.revealLeaf(leaves[nextIndex]!);
        this.app.workspace.setActiveLeaf(leaves[nextIndex]!, { focus: true });
    }
}
