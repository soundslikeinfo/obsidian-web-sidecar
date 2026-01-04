
import { App, WorkspaceLeaf, Menu } from 'obsidian';
import type { WebSidecarSettings } from '../types';
import { WebViewerUI } from './WebViewerUI';
import type { UrlIndex } from '../services/UrlIndex';

const WEB_VIEW_TYPES = ['webviewer', 'surfing-view'];

/**
 * Class to handle web viewer header action injection
 */
export class WebViewerManager {
    private app: App;
    private getSettings: () => WebSidecarSettings;
    private ui: WebViewerUI;
    private unregisterCallbacks: (() => void)[] = [];
    private menuObserver: MutationObserver | null = null;
    private currentWebViewerLeaf: WorkspaceLeaf | null = null;

    constructor(app: App, getSettings: () => WebSidecarSettings, urlIndex: UrlIndex) {
        this.app = app;
        this.getSettings = getSettings;
        this.ui = new WebViewerUI(app, getSettings, urlIndex);
    }

    /**
     * Initialize event listeners and inject buttons into existing web viewers
     */
    initialize(): void {
        // Listen for layout changes to inject buttons into new web viewers
        const layoutRef = this.app.workspace.on('layout-change', () => {
            const settings = this.getSettings();
            if (settings.enableWebViewerActions) {
                this.ui.injectButtonsIntoAllWebViewers();
            }
        });
        this.unregisterCallbacks.push(() => this.app.workspace.offref(layoutRef));

        // Listen for active leaf changes
        const leafRef = this.app.workspace.on('active-leaf-change', (leaf) => {
            const settings = this.getSettings();
            if (settings.enableWebViewerActions && leaf) {
                this.ui.maybeInjectButton(leaf);
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
        if (settings.enableWebViewerActions) {
            this.ui.injectButtonsIntoAllWebViewers();
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
                        this.ui.maybeInjectMenuItem(node);
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
     * Clean up all injected buttons and event listeners
     */
    destroy(): void {
        this.ui.removeAllButtons();
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
        if (settings.enableWebViewerActions) {
            this.ui.injectButtonsIntoAllWebViewers();
        } else {
            this.ui.removeAllButtons();
        }
    }

    /**
     * Update all buttons (dynamic "Open Note" button)
     * Called by main polling loop
     */
    updateAllButtons(): void {
        this.ui.updateAllButtons();
    }

    /**
     * Add menu item to the "More Options" menu for web viewers
     * Called from main plugin when registering the file-menu event
     * Note: This is kept for compatibility but the MutationObserver approach
     * is more reliable for web viewer menus, handled by WebViewerUI inside MutationObserver
     * But we can also expose a method if Main.ts calls it manually?
     * Checking original code: Main.ts calls `addMenuItems`.
     */
    addMenuItems(menu: Menu, leaf: WorkspaceLeaf): void {
        // Original implementation added a simple item. 
        // We can replicate that logic or just rely on MutationObserver.
        // If main.ts calls this for Context Menu on files, it's different.
        // But `addMenuItems` in original file checked if leaf is webviewer.

        const viewType = leaf.view.getViewType();
        if (!WEB_VIEW_TYPES.includes(viewType)) {
            return;
        }

        if (!this.getSettings().enableWebViewerActions) {
            return;
        }

        // We can't easily use UI logic here because UI logic is DOM based (inserting into existing menu element)
        // whereas this receives an Obsidian `Menu` object.
        // So we reimplement the simple addition using Menu API.

        /* 
        Original code:
        menu.addItem((item) => {
            item.setTitle('New web view tab')
                .setIcon('plus-circle')
                .onClick(() => {
                    this.openNewWebViewer();
                });
        });
        */

        // However, `openNewWebViewer` is private in UI.
        // We'll need access to it or reimplement it. Reimplementing is simplest.

        menu.addItem((item) => {
            item.setTitle('New web view tab')
                .setIcon('plus-circle')
                .onClick(async () => {
                    const newLeaf = this.app.workspace.getLeaf('tab');
                    await newLeaf.setViewState({
                        type: 'webviewer',
                        state: { url: 'about:blank', navigate: true }
                    });
                    this.app.workspace.revealLeaf(newLeaf);
                });
        });
    }
}
