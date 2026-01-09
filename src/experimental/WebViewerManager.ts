/*
 * Web Sidecar
 * Copyright (c) 2025 soundslikeinfo
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { App, WorkspaceLeaf, Menu } from 'obsidian';
import type { WebSidecarSettings } from '../types';
import { WebViewerUI } from './WebViewerUI';
import type { UrlIndex } from '../services/UrlIndex';
import { getWebViewerHomepage } from '../services/webViewerUtils';

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
     */
    addMenuItems(menu: Menu, leaf: WorkspaceLeaf): void {
        const viewType = leaf.view.getViewType();
        if (!WEB_VIEW_TYPES.includes(viewType)) {
            return;
        }

        if (!this.getSettings().enableWebViewerActions) {
            return;
        }

        // Add "New web view tab" menu item
        menu.addItem((item) => {
            item.setTitle('New web view tab')
                .setIcon('plus-circle')
                .onClick(async () => {
                    const homepage = getWebViewerHomepage(this.app);
                    const newLeaf = this.app.workspace.getLeaf('tab');
                    await newLeaf.setViewState({
                        type: 'webviewer',
                        state: { url: homepage, navigate: true }
                    });
                    void this.app.workspace.revealLeaf(newLeaf);
                });
        });
    }
}
