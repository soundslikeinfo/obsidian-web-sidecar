/*
 * Web Sidecar
 * Copyright (c) 2025 soundslikeinfo
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { App, TFile, WorkspaceLeaf, WorkspaceSplit, View } from 'obsidian';
import { CreateNoteModal } from '../modals/createNoteModal';
import { TrackedWebViewer, WebSidecarSettings } from '../types';
import type { UrlIndex } from './UrlIndex';
import { getWebViewerHomepage } from './webViewerUtils';
import { getViewFile } from './obsidianHelpers';

// Import helper modules
import {
    getMainAreaLeaves,
    getWebViewerLeaves
} from './navigationLeafHelpers';
import {
    focusWebViewerById,
    focusTrackedTab,
    focusNextWebViewerByUrl,
    focusNextTrackedTab,
    focusNextNoteByPath
} from './navigationFocusHelpers';
import {
    closeWebViewerLeaf,
    closeAllWebViewersForUrl,
    closeLinkedNoteLeaves
} from './navigationCloseHelpers';
import { openPaired as openPairedHelper } from './navigationOpenHelpers';

export class NavigationService {
    private app: App;
    private getSettings: () => WebSidecarSettings;
    private urlIndex: UrlIndex;
    private urlCycleIndex: Map<string, number> = new Map();
    private noteCycleIndex: Map<string, number> = new Map();
    private isManualRefreshCallback: (val: boolean) => void;
    private onRefreshCallback: () => void;

    constructor(
        app: App,
        getSettings: () => WebSidecarSettings,
        urlIndex: UrlIndex,
        setManualRefresh: (val: boolean) => void,
        onRefresh: () => void
    ) {
        this.app = app;
        this.getSettings = getSettings;
        this.urlIndex = urlIndex;
        this.isManualRefreshCallback = setManualRefresh;
        this.onRefreshCallback = onRefresh;
    }

    // --- Focus Operations (delegated to helper) ---

    async focusWebViewer(leafId: string): Promise<void> {
        await focusWebViewerById(this.app, leafId);
    }

    focusTab(tab: TrackedWebViewer): void {
        focusTrackedTab(this.app, tab);
    }

    focusNextInstance(url: string, allTabs: TrackedWebViewer[]): void {
        focusNextTrackedTab(this.app, url, allTabs, this.urlCycleIndex);
    }

    focusNextWebViewerInstance(url: string): void {
        focusNextWebViewerByUrl(this.app, url, this.urlCycleIndex);
    }

    focusNextNoteInstance(filePath: string): void {
        focusNextNoteByPath(this.app, filePath, this.noteCycleIndex);
    }

    // --- Close Operations (delegated to helper) ---

    closeLeaf(leafId: string): void {
        closeWebViewerLeaf(this.app, leafId, {
            isManualRefreshCallback: this.isManualRefreshCallback,
            onRefreshCallback: this.onRefreshCallback
        });
    }

    closeAllLeavesForUrl(url: string): void {
        closeAllWebViewersForUrl(this.app, url, {
            isManualRefreshCallback: this.isManualRefreshCallback,
            onRefreshCallback: this.onRefreshCallback
        });
    }

    closeLinkedNoteLeaves(url: string): void {
        closeLinkedNoteLeaves(this.app, url, this.getSettings(), this.urlIndex, {
            isManualRefreshCallback: this.isManualRefreshCallback,
            onRefreshCallback: this.onRefreshCallback
        });
    }

    // --- Smart Opening Operations ---

    async openNoteSmartly(file: TFile, e: MouseEvent | KeyboardEvent, referenceLeafId?: string): Promise<void> {
        // CMD/Ctrl + click = open in new popout window
        if (e.metaKey || e.ctrlKey) {
            const newWindow = this.app.workspace.openPopoutLeaf();
            await newWindow.openFile(file);
            return;
        }

        // Shift + click = force new tab
        if (e.shiftKey) {
            await this.app.workspace.openLinkText(file.path, '', 'tab');
            return;
        }

        // Check if note is already open anywhere
        const leaves = this.app.workspace.getLeavesOfType('markdown');
        for (const leaf of leaves) {
            const viewFile = getViewFile(leaf.view);
            if (viewFile && viewFile.path === file.path) {
                await this.app.workspace.revealLeaf(leaf);
                this.app.workspace.setActiveLeaf(leaf, { focus: true });
                return;
            }
        }

        // Not open - use noteOpenBehavior setting
        const settings = this.getSettings();
        if (settings.noteOpenBehavior === 'split') {
            let referenceLeaf: WorkspaceLeaf | undefined;
            if (referenceLeafId) {
                // If ID provided, try to find it
                const leaf = this.app.workspace.getLeafById(referenceLeafId);
                // Also verify it's valid/attached
                if (leaf && leaf.view) referenceLeaf = leaf;
            }

            const newLeaf = this.getOrCreateRightLeaf(referenceLeaf);
            await newLeaf.openFile(file);
        } else {
            const newLeaf = this.app.workspace.getLeaf('tab');
            await newLeaf.openFile(file);
        }

        await this.triggerRefresh();
    }

    async openUrlSmartly(url: string, e: MouseEvent): Promise<void> {
        // CMD/Ctrl + click = open in new popout window
        if (e.metaKey || e.ctrlKey) {
            const newWindow = this.app.workspace.openPopoutLeaf();
            await newWindow.setViewState({
                type: 'webviewer',
                state: { url, navigate: true }
            });
            this.isManualRefreshCallback(true);
            this.onRefreshCallback();
            return;
        }

        // Shift + click = force new tab
        if (e.shiftKey) {
            const leaf = this.app.workspace.getLeaf('tab');
            await leaf.setViewState({
                type: 'webviewer',
                state: { url, navigate: true }
            });
            this.isManualRefreshCallback(true);
            this.onRefreshCallback();
            return;
        }

        // Default: focus existing or open new
        await this.openUrlInWebViewer(url);
        await this.triggerRefresh();
    }

    async openNewWebViewer(): Promise<void> {
        this.isManualRefreshCallback(true);
        const homepage = getWebViewerHomepage(this.app);

        const settings = this.getSettings();
        const leaf = settings.preferWebViewerLeft
            ? this.getOrCreateWebViewerLeaf()
            : this.app.workspace.getLeaf('tab');

        await leaf.setViewState({
            type: 'webviewer',
            state: { url: homepage, navigate: true }
        });
        await this.app.workspace.revealLeaf(leaf);
        this.app.workspace.setActiveLeaf(leaf, { focus: true });

        await this.triggerRefresh();
    }

    openCreateNoteModal(url: string, leafId?: string): void {
        new CreateNoteModal(
            this.app,
            url,
            this.getSettings(),
            (path) => {
                void (async () => {
                    const file = this.app.vault.getAbstractFileByPath(path);
                    if (file instanceof TFile) {
                        await this.app.workspace.openLinkText(path, '', true);
                    }

                    // Update sticky origin for this leaf
                    if (leafId) {
                        // Note linking handled by TabStateService's polling/scanning
                    }

                    this.onRefreshCallback();
                })();
            }
        ).open();
    }

    // --- Paired Opening ---

    async openPaired(file: TFile, url: string, e: MouseEvent): Promise<void> {
        await openPairedHelper(
            {
                app: this.app,
                getSettings: this.getSettings,
                getOrCreateRightLeaf: (ref) => this.getOrCreateRightLeaf(ref),
                triggerRefresh: () => this.triggerRefresh()
            },
            file,
            url,
            e
        );
    }

    // --- Leaf Management (kept in main class due to complexity) ---

    getOrCreateRightLeaf(referenceLeaf?: WorkspaceLeaf): WorkspaceLeaf {
        const workspace = this.app.workspace;
        const mainLeaves = getMainAreaLeaves(this.app);

        if (mainLeaves.length === 0) {
            return workspace.getLeaf('split', 'vertical');
        }

        // Collect all unique tab groups
        const tabGroups = new Map<WorkspaceSplit, WorkspaceLeaf[]>();
        for (const leaf of mainLeaves) {
            if (!leaf.parent) continue;
            if (!tabGroups.has(leaf.parent)) {
                tabGroups.set(leaf.parent, []);
            }
            tabGroups.get(leaf.parent)!.push(leaf);
        }

        // Ensure reference leaf's parent is included if valid
        if (referenceLeaf && referenceLeaf.parent && !tabGroups.has(referenceLeaf.parent)) {
            tabGroups.set(referenceLeaf.parent, [referenceLeaf]);
        }

        // Identify the "Web Viewer Group" (source) 
        let webViewerGroup: WorkspaceSplit | null = null;

        for (const [parent, leaves] of tabGroups.entries()) {
            const hasWebViewer = leaves.some(l =>
                l.view?.getViewType() === 'webviewer' ||
                l.view?.getViewType() === 'surfing-view'
            );
            if (hasWebViewer) {
                webViewerGroup = parent;
                break;
            }
        }

        // Determine source: reference > web viewer > null
        const sourceParent = referenceLeaf?.parent || webViewerGroup;

        // Case 1: We have a source (web viewer or reference), find a different group
        if (sourceParent) {
            for (const [parent, leaves] of tabGroups.entries()) {
                if (parent === sourceParent) continue;
                // Prefer markdown-heavy groups
                const hasMarkdown = leaves.some(l => l.view?.getViewType() === 'markdown');
                if (hasMarkdown) {
                    return workspace.createLeafInParent(parent, -1);
                }
            }
            // No markdown group found, pick any different group
            for (const [parent] of tabGroups.entries()) {
                if (parent !== sourceParent) {
                    return workspace.createLeafInParent(parent, -1);
                }
            }
        }

        // Case 2: No web viewer and no reference - use active leaf's group for continuity
        const activeLeaf = workspace.getActiveViewOfType(View)?.leaf;
        if (activeLeaf && activeLeaf.parent && tabGroups.has(activeLeaf.parent)) {
            return workspace.createLeafInParent(activeLeaf.parent, -1);
        }

        // Case 3: Only one group or can't determine - split from first available
        if (tabGroups.size === 1) {
            const firstLeaf = mainLeaves[0]!;
            return workspace.createLeafBySplit(firstLeaf, 'vertical');
        }

        // Fallback: use first group
        const firstParent = tabGroups.keys().next().value;
        if (firstParent) {
            return workspace.createLeafInParent(firstParent, -1);
        }

        return workspace.getLeaf('split', 'vertical');
    }

    getOrCreateWebViewerLeaf(): WorkspaceLeaf {
        const workspace = this.app.workspace;
        const mainLeaves = getMainAreaLeaves(this.app);

        if (mainLeaves.length === 0) {
            return workspace.getLeaf('tab');
        }

        // Prioritize finding an existing web viewer group anywhere
        const allWebViewerLeaves = this.app.workspace.getLeavesOfType('webviewer')
            .concat(this.app.workspace.getLeavesOfType('surfing-view'));

        const existingWebViewerLeaf = allWebViewerLeaves.find(l => l.parent !== null);

        if (existingWebViewerLeaf && existingWebViewerLeaf.parent) {
            return workspace.createLeafInParent(existingWebViewerLeaf.parent, -1);
        }

        // Fallback to Main Area check logic (incase web viewers are floating/popout and we want main area)
        const webViewerLeaf = mainLeaves.find(l =>
            l.view.getViewType() === 'webviewer' ||
            l.view.getViewType() === 'surfing-view'
        );

        if (webViewerLeaf && webViewerLeaf.parent) {
            return workspace.createLeafInParent(webViewerLeaf.parent, -1);
        }

        // No web viewers - check for paired layout
        const tabGroups = new Map<WorkspaceSplit, WorkspaceLeaf[]>();
        for (const leaf of mainLeaves) {
            if (!leaf.parent) continue;
            if (!tabGroups.has(leaf.parent)) {
                tabGroups.set(leaf.parent, []);
            }
            tabGroups.get(leaf.parent)!.push(leaf);
        }

        if (tabGroups.size <= 1) {
            return workspace.getLeaf('tab');
        }

        // Find group without markdown (likely web viewer group)
        for (const [parent, leaves] of tabGroups.entries()) {
            const hasMarkdown = leaves.some(l => l.view?.getViewType() === 'markdown');
            if (!hasMarkdown) {
                return workspace.createLeafInParent(parent, -1);
            }
        }

        // Fallback: first group
        const firstParent = tabGroups.keys().next().value;
        if (firstParent) {
            return workspace.createLeafInParent(firstParent, -1);
        }

        return workspace.getLeaf('tab');
    }

    // --- Private Helpers ---

    private async openUrlInWebViewer(url: string): Promise<void> {
        const leaves = getWebViewerLeaves(this.app);

        for (const leaf of leaves) {
            const state = leaf.view.getState();
            if (state?.url === url) {
                await this.app.workspace.revealLeaf(leaf);
                return;
            }
        }

        const settings = this.getSettings();
        const leaf = settings.preferWebViewerLeft
            ? this.getOrCreateWebViewerLeaf()
            : this.app.workspace.getLeaf('tab');

        await leaf.setViewState({
            type: 'webviewer',
            state: { url, navigate: true }
        });
        await this.app.workspace.revealLeaf(leaf);
    }

    private async triggerRefresh(): Promise<void> {
        // Triple refresh to ensure UI catches up
        this.isManualRefreshCallback(true);
        this.onRefreshCallback();

        // 2. Short delay (standard)
        await new Promise(resolve => setTimeout(resolve, 150));
        this.isManualRefreshCallback(true);
        this.onRefreshCallback();

        // 3. Long delay (catch-all for slow internal state updates)
        await new Promise(resolve => setTimeout(resolve, 250)); // Total ~400ms from start
        this.isManualRefreshCallback(true);
        this.onRefreshCallback();
    }
}
