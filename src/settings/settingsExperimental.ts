/*
 * Web Sidecar
 * Copyright (c) 2025 soundslikeinfo
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { Setting } from 'obsidian';
import type WebSidecarPlugin from '../main';

/**
 * Renders the experimental features settings section
 */
export function renderExperimentalSettings(containerEl: HTMLElement, plugin: WebSidecarPlugin, redisplay: () => void): void {
    new Setting(containerEl).setName('Experimental features').setHeading();

    containerEl.createEl('div', {
        text: '⚠️ Disclaimer: Experimental features may be unstable or break with Obsidian updates. Use with caution.',
        cls: 'setting-item-description'
    });

    // Pinned Tabs Section
    new Setting(containerEl).setName('Pinned Tabs').setHeading();

    new Setting(containerEl)
        .setName('Enable pinned web view tabs')
        .setDesc('Allow pinning web views to the top of the sidecar')
        .addToggle(toggle => toggle
            .setValue(plugin.settings.enablePinnedTabs)
            .onChange(async (value) => {
                plugin.settings.enablePinnedTabs = value;
                await plugin.saveSettings();
                redisplay();
            }));

    if (plugin.settings.enablePinnedTabs) {
        new Setting(containerEl)
            .setName('Pinned property key')
            .setDesc('Frontmatter property used to identify notes linked to pins (e.g. pinned-status)')
            .setClass('web-sidecar-sub-setting')
            .addText(text => text
                .setPlaceholder('Pinned-status')
                .setValue(plugin.settings.pinnedPropertyKey)
                .onChange(async (value) => {
                    plugin.settings.pinnedPropertyKey = value;
                    await plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Pinned property value')
            .setDesc('Value for the property that marks a note as pinned source (e.g. sidecar)')
            .setClass('web-sidecar-sub-setting')
            .addText(text => text
                .setPlaceholder('sidecar')
                .setValue(plugin.settings.pinnedPropertyValue)
                .onChange(async (value) => {
                    plugin.settings.pinnedPropertyValue = value;
                    await plugin.saveSettings();
                }));
    }

    new Setting(containerEl)
        .setName('Web viewer header actions')
        .setDesc('Add a "New web view tab" button to web viewer headers and menus. May break with future Obsidian updates.')
        .addToggle(toggle => toggle
            .setValue(plugin.settings.enableWebViewerActions)
            .onChange(async (value) => {
                plugin.settings.enableWebViewerActions = value;
                await plugin.saveSettings();
                redisplay();
            }));

    // Sub-options (only show if main toggle is enabled)
    if (plugin.settings.enableWebViewerActions) {
        renderWebViewerActionSettings(containerEl, plugin);
    }
}

/**
 * Renders web viewer action sub-settings
 */
function renderWebViewerActionSettings(containerEl: HTMLElement, plugin: WebSidecarPlugin): void {
    // Header buttons section
    new Setting(containerEl).setName('Action row').setHeading();

    new Setting(containerEl)
        .setName('New web viewer button')
        .setDesc('Add ⊕ button to open a new web viewer tab')
        .setClass('web-sidecar-sub-setting')
        .addToggle(toggle => toggle
            .setValue(plugin.settings.showWebViewerHeaderButton)
            .onChange(async (value) => {
                plugin.settings.showWebViewerHeaderButton = value;
                await plugin.saveSettings();
            }));

    new Setting(containerEl)
        .setName('New note button')
        .addToggle(toggle => toggle
            .setValue(plugin.settings.showWebViewerNewNoteButton)
            .onChange(async (value) => {
                plugin.settings.showWebViewerNewNoteButton = value;
                await plugin.saveSettings();
            }));

    new Setting(containerEl)
        .setName('Open linked web note button')
        .setDesc('Add button to open linked note for current URL (if it exists)')
        .setClass('web-sidecar-sub-setting')
        .addToggle(toggle => toggle
            .setValue(plugin.settings.showWebViewerOpenNoteButton)
            .onChange(async (value) => {
                plugin.settings.showWebViewerOpenNoteButton = value;
                await plugin.saveSettings();
            }));

    // Menu options section
    new Setting(containerEl).setName('More options menu').setHeading();

    new Setting(containerEl)
        .setName('New web view tab')
        .setDesc('Add "New web view tab" option to menu')
        .setClass('web-sidecar-sub-setting')
        .addToggle(toggle => toggle
            .setValue(plugin.settings.showWebViewerMenuOption)
            .onChange(async (value) => {
                plugin.settings.showWebViewerMenuOption = value;
                await plugin.saveSettings();
            }));

    new Setting(containerEl)
        .setName('Open note to the right')
        .setDesc('Add "Open note to the right" option when viewing URLs that are linked in notes')
        .setClass('web-sidecar-sub-setting')
        .addToggle(toggle => toggle
            .setValue(plugin.settings.showWebViewerOpenNoteOption)
            .onChange(async (value) => {
                plugin.settings.showWebViewerOpenNoteOption = value;
                await plugin.saveSettings();
            }));
}
