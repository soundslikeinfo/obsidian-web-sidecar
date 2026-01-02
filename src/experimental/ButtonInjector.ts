
import { App, WorkspaceLeaf, setIcon, TFile } from 'obsidian';
import type { WebSidecarSettings } from '../types';
import { findMatchingNotes } from '../services/noteMatcher';
import type { UrlIndex } from '../services/UrlIndex';

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
     */
    maybeInjectButton(leaf: WorkspaceLeaf): void {
        const viewType = leaf.view.getViewType();
        if (!WEB_VIEW_TYPES.includes(viewType)) {
            return;
        }

        const leafId = this.getLeafId(leaf);

        // Already injected
        if (this.injectedButtons.has(leafId)) {
            return;
        }

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
        let injectedAny = false;

        // Inject New Note button first (so it appears left of New Tab)
        if (settings.showWebViewerNewNoteButton && !viewActions.querySelector('.web-sidecar-new-note-header-btn')) {
            const newNoteBtn = document.createElement('button');
            newNoteBtn.className = 'clickable-icon view-action web-sidecar-new-note-header-btn';
            newNoteBtn.setAttribute('aria-label', 'New note for this URL');
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
            injectedAny = true;
        }

        // Inject New Tab button
        if (settings.showWebViewerHeaderButton && !viewActions.querySelector('.web-sidecar-new-tab-header-btn')) {
            const newTabBtn = document.createElement('button');
            newTabBtn.className = 'clickable-icon view-action web-sidecar-new-tab-header-btn';
            newTabBtn.setAttribute('aria-label', 'New web viewer');
            newTabBtn.setAttribute('data-tooltip-position', 'bottom');
            setIcon(newTabBtn, 'plus-circle');

            newTabBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.openNewWebViewer();
            });

            // Insert before more options (last element)
            const insertBefore = viewActions.querySelector('.web-sidecar-new-note-header-btn') || lastChild;
            if (insertBefore && insertBefore !== viewActions.querySelector('.web-sidecar-new-tab-header-btn')) {
                viewActions.insertBefore(newTabBtn, insertBefore.nextSibling || lastChild);
            } else if (lastChild) {
                viewActions.insertBefore(newTabBtn, lastChild);
            } else {
                viewActions.appendChild(newTabBtn);
            }
            injectedAny = true;
        }

        // Also run dynamic update
        this.updateOpenNoteButton(leaf);

        if (injectedAny) {
            // Track that we've injected into this leaf (using a marker element)
            this.injectedButtons.set(leafId, viewActions.querySelector('.web-sidecar-new-tab-header-btn') ||
                viewActions.querySelector('.web-sidecar-new-note-header-btn') as HTMLElement);
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

        // Check if button already exists with correct state to prevent pulsing (unnecessary replacement)
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

        newBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const newLeaf = this.app.workspace.createLeafBySplit(leaf, 'vertical');
            await newLeaf.openFile(noteToOpen);
        });
    }

    private openCreateNoteModal(leaf: WorkspaceLeaf): void {
        const state = leaf.view.getState();
        const url = state?.url || '';
        if (!url || url === 'about:blank') {
            return;
        }

        // Trigger a custom event that main.ts can listen to, or directly open modal
        const event = new CustomEvent('web-sidecar:create-note', {
            detail: { url }
        });
        window.dispatchEvent(event);
    }

    private async openNewWebViewer(): Promise<void> {
        const leaf = this.app.workspace.getLeaf('tab');
        await leaf.setViewState({
            type: 'webviewer',
            state: { url: 'about:blank', navigate: true }
        });
        this.app.workspace.revealLeaf(leaf);
    }

    private getWebViewerLeaves(): WorkspaceLeaf[] {
        return this.app.workspace.getLeavesOfType('webviewer')
            .concat(this.app.workspace.getLeavesOfType('surfing-view'));
    }

    private getLeafId(leaf: WorkspaceLeaf): string {
        return (leaf as any).id || leaf.view.getViewType() + '-' + Date.now();
    }
}
