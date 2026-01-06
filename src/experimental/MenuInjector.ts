
import { App, setIcon, TFile, View, WorkspaceLeaf, WorkspaceSplit } from 'obsidian';
import type { WebSidecarSettings } from '../types';
import { findMatchingNotes } from '../services/noteMatcher';
import type { UrlIndex } from '../services/UrlIndex';
import { getWebViewerHomepage } from '../services/webViewerUtils';

const WEB_VIEW_TYPES = ['webviewer', 'surfing-view'];

export class MenuInjector {
    private app: App;
    private getSettings: () => WebSidecarSettings;
    private urlIndex: UrlIndex;

    constructor(app: App, getSettings: () => WebSidecarSettings, urlIndex: UrlIndex) {
        this.app = app;
        this.getSettings = getSettings;
        this.urlIndex = urlIndex;
    }

    /**
     * Maybe inject our menu item into a newly opened menu
     */
    maybeInjectMenuItem(menuEl: HTMLElement): void {
        // Check if the active leaf is a web viewer
        const activeLeaf = this.app.workspace.getActiveViewOfType(View)?.leaf;
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
        title.textContent = 'New web viewer';

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
            void this.openNewWebViewer();
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
        const leaf = this.app.workspace.getActiveViewOfType(View)?.leaf;
        if (!leaf) return;

        const state = leaf.view.getState();
        const url = typeof state?.url === 'string' ? state.url : undefined;
        if (!url) return;

        // Find linked notes
        const matches = findMatchingNotes(this.app, url, this.getSettings(), this.urlIndex);
        const linkedNotes = matches.exactMatches.map(m => m.file);

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
            iconName = 'history';
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
        menuItem.addEventListener('click', (e) => {
            e.stopPropagation();
            menuEl.remove();

            // Open note to the right (reuse existing split)
            if (noteToOpen) {
                const newLeaf = this.getOrCreateRightLeaf(leaf);
                void newLeaf.openFile(noteToOpen);
            }
        });

        // Insert after "New web viewer" item if it exists, or at sensible position
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

    private async openNewWebViewer(): Promise<void> {
        const homepage = getWebViewerHomepage(this.app);
        const leaf = this.app.workspace.getLeaf('tab');
        await leaf.setViewState({
            type: 'webviewer',
            state: { url: homepage, navigate: true }
        });
        void this.app.workspace.revealLeaf(leaf);
    }
}
