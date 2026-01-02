import { App, WorkspaceLeaf, setIcon, Menu, TFile } from 'obsidian';
import type { WebSidecarSettings } from '../types';

/**
 * Supported web viewer types
 */
const WEB_VIEW_TYPES = ['webviewer', 'surfing-view'];

/**
 * Class to handle web viewer header action injection
 */
export class WebViewerActions {
    private app: App;
    private getSettings: () => WebSidecarSettings;
    private injectedButtons: Map<string, HTMLElement> = new Map();
    private unregisterCallbacks: (() => void)[] = [];
    private menuObserver: MutationObserver | null = null;
    private currentWebViewerLeaf: WorkspaceLeaf | null = null;

    constructor(app: App, getSettings: () => WebSidecarSettings) {
        this.app = app;
        this.getSettings = getSettings;
    }

    /**
     * Initialize event listeners and inject buttons into existing web viewers
     */
    initialize(): void {
        // Listen for layout changes to inject buttons into new web viewers
        const layoutRef = this.app.workspace.on('layout-change', () => {
            const settings = this.getSettings();
            if (settings.enableWebViewerActions && settings.showWebViewerHeaderButton) {
                this.injectButtonsIntoAllWebViewers();
            }
        });
        this.unregisterCallbacks.push(() => this.app.workspace.offref(layoutRef));

        // Listen for active leaf changes
        const leafRef = this.app.workspace.on('active-leaf-change', (leaf) => {
            const settings = this.getSettings();
            if (settings.enableWebViewerActions && leaf) {
                if (settings.showWebViewerHeaderButton) {
                    this.maybeInjectButton(leaf);
                }
                // Track current web viewer for menu injection
                const viewType = leaf.view.getViewType();
                if (WEB_VIEW_TYPES.includes(viewType)) {
                    this.currentWebViewerLeaf = leaf;
                }
            }
        });
        this.unregisterCallbacks.push(() => this.app.workspace.offref(leafRef));

        // Set up MutationObserver to watch for menu popups
        this.setupMenuObserver();

        // Initial injection for existing web viewers
        const settings = this.getSettings();
        if (settings.enableWebViewerActions && settings.showWebViewerHeaderButton) {
            this.injectButtonsIntoAllWebViewers();
        }
    }

    /**
     * Set up MutationObserver to detect when menus are shown
     */
    private setupMenuObserver(): void {
        this.menuObserver = new MutationObserver((mutations) => {
            const settings = this.getSettings();
            if (!settings.enableWebViewerActions || !settings.showWebViewerMenuOption) {
                return;
            }

            for (const mutation of mutations) {
                const addedNodes = Array.from(mutation.addedNodes);
                for (const node of addedNodes) {
                    if (node instanceof HTMLElement && node.classList.contains('menu')) {
                        this.maybeInjectMenuItem(node);
                    }
                }
            }
        });

        // Observe the body for menu additions
        this.menuObserver.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    /**
     * Maybe inject our menu item into a newly opened menu
     */
    private maybeInjectMenuItem(menuEl: HTMLElement): void {
        // Check if the active leaf is a web viewer
        const activeLeaf = this.app.workspace.activeLeaf;
        if (!activeLeaf) {
            return;
        }

        const viewType = activeLeaf.view.getViewType();
        if (!WEB_VIEW_TYPES.includes(viewType)) {
            return;
        }

        // Check if menu option is enabled
        if (!this.getSettings().showWebViewerMenuOption) {
            return;
        }

        // Look for indicators this is a pane menu (has Split right, Split down, etc.)
        const menuItemsNodeList = menuEl.querySelectorAll('.menu-item-title');
        const menuItemsArr = Array.from(menuItemsNodeList);
        let isPaneMenu = false;
        for (const item of menuItemsArr) {
            const text = item.textContent?.trim();
            if (text === 'Split right' || text === 'Split down' || text === 'Open in default browser') {
                isPaneMenu = true;
                break;
            }
        }

        if (!isPaneMenu) {
            return;
        }

        // Check if we already injected (avoid duplicates)
        if (menuEl.querySelector('.web-sidecar-menu-item')) {
            return;
        }

        // Find the position to insert (after "Open in default browser" or at the end of the first section)
        const menuSections = menuEl.querySelectorAll('.menu-separator');
        const items = Array.from(menuEl.children);

        // Find "Open in default browser" and insert after it
        let insertAfterEl: Element | null = null;
        for (const item of items) {
            const title = item.querySelector('.menu-item-title');
            if (title?.textContent?.trim() === 'Open in default browser') {
                insertAfterEl = item;
                break;
            }
        }

        // Create our menu item
        const menuItem = document.createElement('div');
        menuItem.className = 'menu-item web-sidecar-menu-item';

        const icon = document.createElement('div');
        icon.className = 'menu-item-icon';
        setIcon(icon, 'plus-circle');

        const title = document.createElement('div');
        title.className = 'menu-item-title';
        title.textContent = 'New web view tab';

        menuItem.appendChild(icon);
        menuItem.appendChild(title);

        // Handle hover state properly - clear sibling hover states
        menuItem.addEventListener('mouseenter', () => {
            // Remove hover/selected classes from all siblings
            const siblings = menuEl.querySelectorAll('.menu-item');
            siblings.forEach((sibling) => {
                if (sibling !== menuItem) {
                    sibling.classList.remove('selected', 'is-selected');
                    // Also trigger mouseleave to reset Obsidian's internal state
                    sibling.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
                }
            });
            menuItem.classList.add('selected');
        });

        menuItem.addEventListener('mouseleave', () => {
            menuItem.classList.remove('selected');
        });

        menuItem.addEventListener('click', (e) => {
            e.stopPropagation();
            // Close the menu
            menuEl.remove();
            this.openNewWebViewer();
        });

        // Create a separator to appear above our menu item
        const separator = document.createElement('div');
        separator.className = 'menu-separator';

        // Insert after "Open in default browser" or at a sensible position
        if (insertAfterEl && insertAfterEl.nextSibling) {
            // Insert separator then menu item after "Open in default browser"
            insertAfterEl.parentNode?.insertBefore(separator, insertAfterEl.nextSibling);
            separator.parentNode?.insertBefore(menuItem, separator.nextSibling);
        } else if (menuSections.length > 0 && menuSections[0]) {
            // Insert before the first separator
            const firstSeparator = menuSections[0];
            firstSeparator.parentNode?.insertBefore(separator, firstSeparator);
            separator.parentNode?.insertBefore(menuItem, separator.nextSibling);
        } else {
            // Fallback: append separator and menu item to menu
            menuEl.appendChild(separator);
            menuEl.appendChild(menuItem);
        }

        // Try to inject "Open note to the right" if enabled
        if (this.getSettings().showWebViewerOpenNoteOption) {
            this.maybeInjectOpenNoteOption(menuEl, insertAfterEl);
        }
    }

    /**
     * Inject "Open note to the right" option if there are notes linked to the current URL
     */
    private maybeInjectOpenNoteOption(menuEl: HTMLElement, insertAfterEl: Element | null): void {
        const leaf = this.currentWebViewerLeaf || this.app.workspace.activeLeaf;
        if (!leaf) return;

        const state = leaf.view.getState();
        const url = typeof state?.url === 'string' ? state.url : undefined;
        if (!url) return;

        // Find linked notes
        const linkedNotes = this.findNotesForUrl(url);
        if (linkedNotes.length === 0) return;

        // Determine which note to open
        let noteToOpen: TFile | undefined = linkedNotes[0];
        let menuText = 'Open note to the right';
        let iconName = 'split-square-horizontal';

        // If multiple notes, find the most recently modified one
        if (linkedNotes.length > 1) {
            linkedNotes.sort((a, b) => b.stat.mtime - a.stat.mtime);
            noteToOpen = linkedNotes[0];
            menuText = 'Open most recent note to the right';
            iconName = 'history'; // Use history icon to indicate recency
        }

        if (!noteToOpen) return;

        // Create menu item
        const menuItem = document.createElement('div');
        menuItem.className = 'menu-item web-sidecar-menu-item-note';

        const icon = document.createElement('div');
        icon.className = 'menu-item-icon';
        setIcon(icon, iconName);

        const title = document.createElement('div');
        title.className = 'menu-item-title';
        title.textContent = menuText;

        menuItem.appendChild(icon);
        menuItem.appendChild(title);

        // Hover handling
        menuItem.addEventListener('mouseenter', () => {
            const siblings = menuEl.querySelectorAll('.menu-item');
            siblings.forEach((sibling) => {
                if (sibling !== menuItem) {
                    sibling.classList.remove('selected', 'is-selected');
                    sibling.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
                }
            });
            menuItem.classList.add('selected');
        });

        menuItem.addEventListener('mouseleave', () => {
            menuItem.classList.remove('selected');
        });

        // Click handling
        menuItem.addEventListener('click', async (e) => {
            e.stopPropagation();
            menuEl.remove();

            // Open note to the right
            if (noteToOpen) {
                const newLeaf = this.app.workspace.createLeafBySplit(leaf, 'vertical');
                await newLeaf.openFile(noteToOpen);
            }
        });

        // Insert after "New web view tab" item if it exists, or at sensible position
        const newTabItem = menuEl.querySelector('.web-sidecar-menu-item');
        if (newTabItem && newTabItem.nextSibling) {
            newTabItem.parentNode?.insertBefore(menuItem, newTabItem.nextSibling);
        } else if (newTabItem) {
            newTabItem.parentNode?.appendChild(menuItem);
        } else if (insertAfterEl && insertAfterEl.nextSibling) {
            insertAfterEl.parentNode?.insertBefore(menuItem, insertAfterEl.nextSibling);
        } else {
            menuEl.appendChild(menuItem);
        }
    }

    /**
     * Find all notes in the vault that have the given URL in their frontmatter
     */
    private findNotesForUrl(url: string): TFile[] {
        const settings = this.getSettings();
        const { vault, metadataCache } = this.app;
        const linkedNotes: TFile[] = [];

        // Normalize URL for comparison (remove protocol, www, trailing slash)
        const normalize = (u: string) => u.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '').toLowerCase();
        const targetUrl = normalize(url);

        const files = vault.getMarkdownFiles();
        for (const file of files) {
            const cache = metadataCache.getFileCache(file);
            if (!cache?.frontmatter) continue;

            for (const field of settings.urlPropertyFields) {
                if (cache.frontmatter[field]) {
                    const value = cache.frontmatter[field];
                    // Handle both single string and array of strings
                    const urls = Array.isArray(value) ? value : [value];

                    for (const u of urls) {
                        if (typeof u === 'string' && normalize(u) === targetUrl) {
                            linkedNotes.push(file);
                            break; // Found match in this file, move to next file
                        }
                    }
                }
            }
        }
        return linkedNotes;
    }

    /**
     * Clean up all injected buttons and event listeners
     */
    destroy(): void {
        this.removeAllButtons();
        this.menuObserver?.disconnect();
        this.menuObserver = null;
        for (const unregister of this.unregisterCallbacks) {
            unregister();
        }
        this.unregisterCallbacks = [];
    }

    /**
     * Called when settings change - re-evaluate button injection
     */
    onSettingsChanged(): void {
        const settings = this.getSettings();
        if (settings.enableWebViewerActions && settings.showWebViewerHeaderButton) {
            this.injectButtonsIntoAllWebViewers();
        } else {
            this.removeAllButtons();
        }
    }

    /**
     * Inject buttons into all open web viewer tabs
     */
    private injectButtonsIntoAllWebViewers(): void {
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
    private maybeInjectButton(leaf: WorkspaceLeaf): void {
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
     * Update all buttons (dynamic "Open Note" button)
     * Called by main polling loop
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
            newTabBtn.setAttribute('aria-label', 'New web view tab');
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

        // Find linked notes
        const linkedNotes = this.findNotesForUrl(url);

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
            linkedNotes.sort((a, b) => b.stat.mtime - a.stat.mtime);
            noteToOpen = linkedNotes[0]!;
            tooltip = 'Open most recent note to the right';
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

    /**
     * Open create note modal for the current web viewer's URL
     */
    private openCreateNoteModal(leaf: WorkspaceLeaf): void {
        const state = leaf.view.getState();
        const url = state?.url || '';
        if (!url || url === 'about:blank') {
            return;
        }

        // Trigger a custom event that main.ts can listen to, or directly open modal
        // For now, we'll dispatch a custom event
        const event = new CustomEvent('web-sidecar:create-note', {
            detail: { url }
        });
        window.dispatchEvent(event);
    }

    /**
     * Remove all injected buttons
     */
    private removeAllButtons(): void {
        for (const btn of this.injectedButtons.values()) {
            btn.remove();
        }
        this.injectedButtons.clear();
    }

    /**
     * Get all web viewer leaves
     */
    private getWebViewerLeaves(): WorkspaceLeaf[] {
        return this.app.workspace.getLeavesOfType('webviewer')
            .concat(this.app.workspace.getLeavesOfType('surfing-view'));
    }

    /**
     * Get a unique ID for a leaf
     */
    private getLeafId(leaf: WorkspaceLeaf): string {
        return (leaf as any).id || leaf.view.getViewType() + '-' + Date.now();
    }

    /**
     * Open a new web viewer tab
     */
    private async openNewWebViewer(): Promise<void> {
        const leaf = this.app.workspace.getLeaf('tab');
        await leaf.setViewState({
            type: 'webviewer',
            state: { url: 'about:blank', navigate: true }
        });
        this.app.workspace.revealLeaf(leaf);
    }

    /**
     * Add menu item to the "More Options" menu for web viewers
     * Called from main plugin when registering the file-menu event
     * Note: This is kept for compatibility but the MutationObserver approach
     * is more reliable for web viewer menus
     */
    addMenuItems(menu: Menu, leaf: WorkspaceLeaf): void {
        const viewType = leaf.view.getViewType();
        if (!WEB_VIEW_TYPES.includes(viewType)) {
            return;
        }

        if (!this.getSettings().enableWebViewerActions) {
            return;
        }

        menu.addItem((item) => {
            item.setTitle('New web view tab')
                .setIcon('plus-circle')
                .onClick(() => {
                    this.openNewWebViewer();
                });
        });
    }
}

