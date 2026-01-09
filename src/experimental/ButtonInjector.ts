/*
 * Web Sidecar
 * Copyright (c) 2025 soundslikeinfo
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { App, WorkspaceLeaf, setIcon, TFile, WorkspaceSplit } from 'obsidian';
import type { WebSidecarSettings } from '../types';
import { findMatchingNotes } from '../services/noteMatcher';
import type { UrlIndex } from '../services/UrlIndex';
import { getWebViewerHomepage } from '../services/webViewerUtils';
import { getLeafId as getLeafIdHelper } from '../services/obsidianHelpers';

const WEB_VIEW_TYPES = ['webviewer', 'surfing-view'];

export class ButtonInjector {
    private app: App;
    private getSettings: () => WebSidecarSettings;
    private urlIndex: UrlIndex;
    private injectedButtons: Map<string, HTMLElement> = new Map();

    constructor(app: App, getSettings: () => WebSidecarSettings, urlIndex: UrlIndex) {
        this.app = app;
        this.getSettings = getSettings;
        this.urlIndex = urlIndex;
    }

    /**
     * Inject buttons into all open web viewer tabs
     */
    injectButtonsIntoAllWebViewers(): void {
        const leaves = this.getWebViewerLeaves();

        // Clean up buttons for closed leaves
        const activeLeafIds = new Set(leaves.map(l => this.getLeafId(l)));
        for (const leafId of this.injectedButtons.keys()) {
            if (!activeLeafIds.has(leafId)) {
                const btn = this.injectedButtons.get(leafId);
                btn?.remove();
                this.injectedButtons.delete(leafId);
            }
        }

        // Inject buttons into new leaves
        for (const leaf of leaves) {
            this.maybeInjectButton(leaf);
        }
    }

    /**
     * Maybe inject a button into a specific leaf if it's a web viewer
     * Always calls injectButton to handle settings changes
     */
    maybeInjectButton(leaf: WorkspaceLeaf): void {
        const viewType = leaf.view.getViewType();
        if (!WEB_VIEW_TYPES.includes(viewType)) {
            return;
        }

        const leafId = this.getLeafId(leaf);
        this.injectButton(leaf, leafId);
    }

    /**
     * Remove all injected buttons
     */
    removeAllButtons(): void {
        for (const btn of this.injectedButtons.values()) {
            btn.remove();
        }
        this.injectedButtons.clear();
    }

    /**
     * Update all buttons (dynamic "Open Note" button)
     */
    updateAllButtons(): void {
        const settings = this.getSettings();
        if (!settings.enableWebViewerActions) return;

        const leaves = this.getWebViewerLeaves();
        for (const leaf of leaves) {
            this.updateOpenNoteButton(leaf);
        }
    }

    /**
     * Inject the header buttons (New Tab and/or New Note) into a web viewer's header
     * This method handles both initial injection AND settings updates
     */
    private injectButton(leaf: WorkspaceLeaf, leafId: string): void {
        // Find the view actions container (where reader view and more options icons are)
        const viewHeader = leaf.view.containerEl.querySelector('.view-header');
        if (!viewHeader) {
            return;
        }

        const viewActions = viewHeader.querySelector('.view-actions');
        if (!viewActions) {
            return;
        }

        const settings = this.getSettings();
        const lastChild = viewActions.lastElementChild;

        // Handle New note button - add or remove based on setting
        const existingNewNoteBtn = viewActions.querySelector('.web-sidecar-new-note-header-btn');
        if (settings.showWebViewerNewNoteButton) {
            if (!existingNewNoteBtn) {
                const newNoteBtn = document.createElement('button');
                newNoteBtn.className = 'clickable-icon view-action web-sidecar-new-note-header-btn';
                newNoteBtn.setAttribute('aria-label', 'New linked web note');
                newNoteBtn.setAttribute('data-tooltip-position', 'bottom');
                setIcon(newNoteBtn, 'file-plus');

                newNoteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.openCreateNoteModal(leaf);
                });

                if (lastChild) {
                    viewActions.insertBefore(newNoteBtn, lastChild);
                } else {
                    viewActions.appendChild(newNoteBtn);
                }
            }
        } else {
            // Remove if setting is off
            existingNewNoteBtn?.remove();
        }

        // Handle New Tab button - add or remove based on setting
        const existingNewTabBtn = viewActions.querySelector('.web-sidecar-new-tab-header-btn');
        if (settings.showWebViewerHeaderButton) {
            if (!existingNewTabBtn) {
                const newTabBtn = document.createElement('button');
                newTabBtn.className = 'clickable-icon view-action web-sidecar-new-tab-header-btn';
                newTabBtn.setAttribute('aria-label', 'New web viewer');
                newTabBtn.setAttribute('data-tooltip-position', 'bottom');
                setIcon(newTabBtn, 'plus-circle');

                newTabBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    void this.openNewWebViewer();
                });

                // Insert after New note button if it exists, otherwise before lastChild
                const newNoteBtnNow = viewActions.querySelector('.web-sidecar-new-note-header-btn');
                if (newNoteBtnNow && newNoteBtnNow.nextSibling) {
                    viewActions.insertBefore(newTabBtn, newNoteBtnNow.nextSibling);
                } else if (lastChild) {
                    viewActions.insertBefore(newTabBtn, lastChild);
                } else {
                    viewActions.appendChild(newTabBtn);
                }
            }
        } else {
            // Remove if setting is off
            existingNewTabBtn?.remove();
        }

        // Also run dynamic update for Open Note button
        this.updateOpenNoteButton(leaf);

        // Track that we've processed this leaf
        const anyButton = viewActions.querySelector('.web-sidecar-new-tab-header-btn') ||
            viewActions.querySelector('.web-sidecar-new-note-header-btn');
        if (anyButton) {
            this.injectedButtons.set(leafId, anyButton as HTMLElement);
        }
    }

    /**
     * Update the "Open Note" button based on current URL
     */
    private updateOpenNoteButton(leaf: WorkspaceLeaf): void {
        const settings = this.getSettings();
        if (!settings.showWebViewerOpenNoteButton) {
            // Remove if exists
            const btn = leaf.view.containerEl.querySelector('.web-sidecar-open-note-header-btn');
            if (btn) btn.remove();
            return;
        }

        const state = leaf.view.getState();
        const url = typeof state?.url === 'string' ? state.url : '';
        if (!url || url === 'about:blank') {
            const btn = leaf.view.containerEl.querySelector('.web-sidecar-open-note-header-btn');
            if (btn) btn.remove();
            return;
        }

        // Find linked notes (exact matches only for this button usually)
        const matches = findMatchingNotes(this.app, url, settings, this.urlIndex);
        const linkedNotes = matches.exactMatches.map(m => m.file);

        // Find container
        const viewHeader = leaf.view.containerEl.querySelector('.view-header');
        const viewActions = viewHeader?.querySelector('.view-actions');
        if (!viewActions) return;

        const existingBtn = viewActions.querySelector('.web-sidecar-open-note-header-btn') as HTMLElement;

        if (linkedNotes.length === 0) {
            if (existingBtn) existingBtn.remove();
            return;
        }

        // Determine note to open
        let noteToOpen: TFile = linkedNotes[0]!;
        let tooltip = 'Open note to the right';
        let iconName = 'split-square-horizontal';

        if (linkedNotes.length > 1) {
            // Sort by mtime
            linkedNotes.sort((a, b) => b.stat.mtime - a.stat.mtime);
            noteToOpen = linkedNotes[0]!;
            tooltip = 'Open most recent note to the right';
            iconName = 'history';
        }

        // Check if button already exists with correct state
        if (existingBtn && existingBtn.getAttribute('data-note-path') === noteToOpen.path) {
            return;
        }

        // Create or update button
        let btn = existingBtn;
        if (!btn) {
            btn = document.createElement('button');
            btn.className = 'clickable-icon view-action web-sidecar-open-note-header-btn';

            // Insert it at correct position (after New Note, before New Tab)
            const newNoteBtn = viewActions.querySelector('.web-sidecar-new-note-header-btn');
            const newTabBtn = viewActions.querySelector('.web-sidecar-new-tab-header-btn');

            if (newNoteBtn && newNoteBtn.nextSibling) {
                viewActions.insertBefore(btn, newNoteBtn.nextSibling);
            } else if (newTabBtn) {
                viewActions.insertBefore(btn, newTabBtn);
            } else {
                // If neither, just append (it'll be before More Options usually)
                const lastChild = viewActions.lastElementChild;
                if (lastChild) {
                    viewActions.insertBefore(btn, lastChild);
                } else {
                    viewActions.appendChild(btn);
                }
            }
        }

        // Update properties
        btn.setAttribute('aria-label', tooltip);
        btn.setAttribute('data-tooltip-position', 'bottom');
        btn.setAttribute('data-note-path', noteToOpen.path);
        setIcon(btn, iconName);

        // Remove old listeners (cloning is easiest way to wipe listeners)
        const newBtn = btn.cloneNode(true) as HTMLElement;
        btn.replaceWith(newBtn);

        newBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            // Reuse existing right split instead of always creating new
            const newLeaf = this.getOrCreateRightLeaf(leaf);
            void newLeaf.openFile(noteToOpen);
        });
    }

    /**
     * Get an existing right-side leaf in the same window, or create a new split.
     * Prefers groups with markdown notes (the right pane).
     */
    private getOrCreateRightLeaf(referenceLeaf: WorkspaceLeaf): WorkspaceLeaf {
        const workspace = this.app.workspace;
        const mainLeaves = this.getMainAreaLeaves();

        if (mainLeaves.length === 0) {
            return workspace.getLeaf('split', 'vertical');
        }

        let sourceLeaf = referenceLeaf;
        if (!this.isInMainArea(sourceLeaf)) {
            sourceLeaf = mainLeaves[0]!;
        }

        const sourceParent = sourceLeaf.parent;
        const tabGroups = new Map<WorkspaceSplit, WorkspaceLeaf[]>();

        for (const leaf of mainLeaves) {
            if (!leaf.parent) continue;
            if (!tabGroups.has(leaf.parent)) {
                tabGroups.set(leaf.parent, []);
            }
            tabGroups.get(leaf.parent)!.push(leaf);
        }

        let targetParent: WorkspaceSplit | null = null;
        let fallbackParent: WorkspaceSplit | null = null;

        for (const [parent, leaves] of tabGroups.entries()) {
            if (parent === sourceParent) continue;

            // Prefer markdown groups (the right pane where notes live)
            const hasMarkdown = leaves.some(l => l.view?.getViewType() === 'markdown');

            if (hasMarkdown) {
                targetParent = parent;
                break;
            } else if (!fallbackParent) {
                fallbackParent = parent;
            }
        }

        const chosenParent = targetParent || fallbackParent;
        if (chosenParent) {
            return workspace.createLeafInParent(chosenParent, -1);
        }

        return workspace.getLeaf('split', 'vertical');
    }

    private isInMainArea(leaf: WorkspaceLeaf): boolean {
        let current: WorkspaceSplit | null = leaf.parent;
        const rootSplit = this.app.workspace.rootSplit;

        while (current) {
            if (current === rootSplit) {
                return true;
            }
            current = current.parent;
        }
        return false;
    }

    private getMainAreaLeaves(): WorkspaceLeaf[] {
        const workspace = this.app.workspace;
        const allLeaves = workspace.getLeavesOfType('markdown')
            .concat(workspace.getLeavesOfType('webviewer'))
            .concat(workspace.getLeavesOfType('surfing-view'))
            .concat(workspace.getLeavesOfType('empty'));

        return allLeaves.filter(leaf => this.isInMainArea(leaf));
    }

    private openCreateNoteModal(leaf: WorkspaceLeaf): void {
        const state = leaf.view.getState();
        const url = state?.url || '';
        if (!url || url === 'about:blank') {
            return;
        }

        const leafId = this.getLeafId(leaf);

        // Trigger a custom event that main.ts can listen to
        const event = new CustomEvent('web-sidecar:create-note', {
            detail: { url, leafId }
        });
        window.dispatchEvent(event);
    }

    private async openNewWebViewer(): Promise<void> {
        const homepage = getWebViewerHomepage(this.app);
        const leaf = this.app.workspace.getLeaf('tab');
        await leaf.setViewState({
            type: 'webviewer',
            state: { url: homepage, navigate: true }
        });
        void this.app.workspace.revealLeaf(leaf);
    }

    private getWebViewerLeaves(): WorkspaceLeaf[] {
        return this.app.workspace.getLeavesOfType('webviewer')
            .concat(this.app.workspace.getLeavesOfType('surfing-view'));
    }

    private getLeafId(leaf: WorkspaceLeaf): string {
        return getLeafIdHelper(leaf) || leaf.view.getViewType() + '-' + Date.now();
    }
}
