/*
 * Web Sidecar
 * Copyright (c) 2025 soundslikeinfo
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { App, WorkspaceLeaf } from 'obsidian';
import type { WebSidecarSettings } from '../types';
import type { UrlIndex } from '../services/UrlIndex';
import { ButtonInjector } from './ButtonInjector';
import { MenuInjector } from './MenuInjector';

export class WebViewerUI {
    private buttonInjector: ButtonInjector;
    private menuInjector: MenuInjector;

    constructor(app: App, getSettings: () => WebSidecarSettings, urlIndex: UrlIndex) {
        this.buttonInjector = new ButtonInjector(app, getSettings, urlIndex);
        this.menuInjector = new MenuInjector(app, getSettings, urlIndex);
    }

    /**
     * Inject buttons into all open web viewer tabs
     */
    injectButtonsIntoAllWebViewers(): void {
        this.buttonInjector.injectButtonsIntoAllWebViewers();
    }

    /**
     * Maybe inject a button into a specific leaf if it's a web viewer
     */
    maybeInjectButton(leaf: WorkspaceLeaf): void {
        this.buttonInjector.maybeInjectButton(leaf);
    }

    /**
     * Remove all injected buttons
     */
    removeAllButtons(): void {
        this.buttonInjector.removeAllButtons();
    }

    /**
     * Update all buttons (dynamic "Open Note" button)
     */
    updateAllButtons(): void {
        this.buttonInjector.updateAllButtons();
    }

    /**
     * Maybe inject our menu item into a newly opened menu
     */
    maybeInjectMenuItem(menuEl: HTMLElement): void {
        this.menuInjector.maybeInjectMenuItem(menuEl);
    }
}
