/*
 * Web Sidecar
 * Copyright (c) 2025 soundslikeinfo
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { Setting } from 'obsidian';
import type WebSidecarPlugin from '../main';

/**
 * Renders the auxiliary sections settings
 */
export function renderAuxiliarySectionsSettings(containerEl: HTMLElement, plugin: WebSidecarPlugin, redisplay: () => void): void {
    const auxGroup = containerEl.createDiv({ cls: 'web-sidecar-settings-group' });
    auxGroup.createEl('div', { text: 'Auxiliary sections', cls: 'web-sidecar-settings-group-title' });

    const auxSectionsContainer = auxGroup.createDiv({ cls: 'web-sidecar-settings-scroll-area' });

    new Setting(auxSectionsContainer)
        .setName('Recent web notes')
        .setDesc('Show section with recently modified notes that have URLs')
        .addToggle(toggle => toggle
            .setValue(plugin.settings.enableRecentNotes)
            .onChange(async (value) => {
                plugin.settings.enableRecentNotes = value;
                await plugin.saveSettings();
            }));

    new Setting(auxSectionsContainer)
        .setName('Group by domain')
        .setDesc('Show section with notes grouped by their domain')
        .addToggle(toggle => toggle
            .setValue(plugin.settings.enableTldSearch)
            .onChange(async (value) => {
                plugin.settings.enableTldSearch = value;
                await plugin.saveSettings();
            }));

    new Setting(auxSectionsContainer)
        .setName('Group by tag')
        .setDesc('Show section with notes grouped by their tags')
        .addToggle(toggle => toggle
            .setValue(plugin.settings.enableTagGrouping)
            .onChange(async (value) => {
                plugin.settings.enableTagGrouping = value;
                await plugin.saveSettings();
            }));

    new Setting(auxSectionsContainer)
        .setName('Group by selected tags')
        .setDesc('Show section with notes grouped by specific tags')
        .addToggle(toggle => toggle
            .setValue(plugin.settings.enableSelectedTagGrouping)
            .onChange(async (value) => {
                plugin.settings.enableSelectedTagGrouping = value;
                await plugin.saveSettings();
                redisplay();
            }));

    if (plugin.settings.enableSelectedTagGrouping) {
        new Setting(auxSectionsContainer)
            .setName('Selected tags allowlist')
            .setDesc('Enter tags to group by, separated by commas (e.g. #todo, #research)')
            .setClass('web-sidecar-sub-setting')
            .addText(text => text
                .setPlaceholder('#todo, #research')
                .setValue(plugin.settings.selectedTagsAllowlist)
                .onChange(async (value) => {
                    plugin.settings.selectedTagsAllowlist = value;
                    await plugin.saveSettings();
                }));
    }

    new Setting(auxSectionsContainer)
        .setName('Group by subreddit (reddit.com)')
        .setDesc('Show section with notes grouped by subreddit')
        .addToggle(toggle => toggle
            .setValue(plugin.settings.enableSubredditExplorer)
            .onChange(async (value) => {
                plugin.settings.enableSubredditExplorer = value;
                await plugin.saveSettings();
            }));

    new Setting(auxSectionsContainer)
        .setName('Group by YouTube channel (youtube.com)')
        .setDesc('Show section with notes grouped by YouTube channel')
        .addToggle(toggle => toggle
            .setValue(plugin.settings.enableYouTubeChannelExplorer)
            .onChange(async (value) => {
                plugin.settings.enableYouTubeChannelExplorer = value;
                await plugin.saveSettings();
            }));

    new Setting(auxSectionsContainer)
        .setName('Group by X (Twitter) user')
        .setDesc('Show section with notes grouped by X/Twitter user')
        .addToggle(toggle => toggle
            .setValue(plugin.settings.enableTwitterExplorer)
            .onChange(async (value) => {
                plugin.settings.enableTwitterExplorer = value;
                await plugin.saveSettings();
            }));

    new Setting(auxSectionsContainer)
        .setName('Group by GitHub repository')
        .setDesc('Show section with notes grouped by GitHub repository (owner/repo)')
        .addToggle(toggle => toggle
            .setValue(plugin.settings.enableGithubExplorer)
            .onChange(async (value) => {
                plugin.settings.enableGithubExplorer = value;
                await plugin.saveSettings();
            }));
}

/**
 * Renders the domain rules settings
 */
export function renderDomainRulesSettings(containerEl: HTMLElement, plugin: WebSidecarPlugin): void {
    const domainRulesContainer = containerEl.createDiv({ cls: 'web-sidecar-settings-group' });
    domainRulesContainer.createEl('div', { text: 'Domain Rules', cls: 'web-sidecar-settings-group-title' });

    new Setting(domainRulesContainer).setName('reddit.com').setHeading();

    new Setting(domainRulesContainer)
        .setName('Reveal other notes from the same subreddit')
        .setDesc('Show only notes from the same subreddit as the current page.')
        .setClass('web-sidecar-sub-setting')
        .addToggle(toggle => toggle
            .setValue(plugin.settings.enableSubredditFilter)
            .onChange(async (value) => {
                plugin.settings.enableSubredditFilter = value;
                await plugin.saveSettings();
            }));

    new Setting(domainRulesContainer).setName('youtube.com').setHeading();

    new Setting(domainRulesContainer)
        .setName('Reveal other notes from the same YouTube channel')
        .setDesc('Show only notes from the same channel.')
        .setClass('web-sidecar-sub-setting')
        .addToggle(toggle => toggle
            .setValue(plugin.settings.enableYouTubeChannelFilter)
            .onChange(async (value) => {
                plugin.settings.enableYouTubeChannelFilter = value;
                await plugin.saveSettings();
            }));

    new Setting(domainRulesContainer)
        .setName('Channel name property fields')
        .setDesc('Frontmatter properties containing channel name, in priority order (first match wins)')
        .setClass('web-sidecar-sub-setting')
        .addText(text => text
            .setPlaceholder('channel_name, author')
            .setValue(plugin.settings.youtubeChannelPropertyFields.join(', '))
            .onChange(async (value) => {
                plugin.settings.youtubeChannelPropertyFields = value
                    .split(',')
                    .map(s => s.trim())
                    .filter(s => s.length > 0);
                await plugin.saveSettings();
            }));

    domainRulesContainer.createEl('div', {
        text: 'Opening up more domain rules soon...',
        cls: 'setting-item-description',
        attr: { style: 'font-style: italic; padding-left: 14px; margin-top: 8px;' }
    });
}
