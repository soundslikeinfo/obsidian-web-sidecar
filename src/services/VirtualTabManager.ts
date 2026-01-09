/*
 * Web Sidecar
 * Copyright (c) 2025 soundslikeinfo
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { MarkdownView } from 'obsidian';
import type { VirtualTab, WebSidecarSettings, TrackedWebViewer } from '../types';
import type WebSidecarPlugin from '../main';
import { isSameRedditPost } from './matchers/reddit';

export class VirtualTabManager {
    private plugin: WebSidecarPlugin;
    private getSettings: () => WebSidecarSettings;
    // Shared URL title cache from parent service
    private getUrlTitleCache: () => Map<string, string>;

    constructor(
        plugin: WebSidecarPlugin,
        getSettings: () => WebSidecarSettings,
        getUrlTitleCache: () => Map<string, string>
    ) {
        this.plugin = plugin;
        this.getSettings = getSettings;
        this.getUrlTitleCache = getUrlTitleCache;
    }

    /**
     * Get virtual tabs from open notes with URL properties
     * Deduplicated by file path (same note in multiple tabs = 1 virtual tab)
     */
    getVirtualTabs(trackedTabs: TrackedWebViewer[]): VirtualTab[] {
        const virtualTabs: VirtualTab[] = [];
        const openUrls = new Set<string>();
        for (const t of trackedTabs) {
            openUrls.add(t.url);
            if (t.originalUrl) openUrls.add(t.originalUrl);
        }
        const settings = this.getSettings();
        const urlTitleCache = this.getUrlTitleCache();

        // Track pinned tab URLs to exclude from virtual tabs
        // Only filter if pinned tabs feature is enabled
        const pinnedUrls = new Set<string>();
        if (settings.enablePinnedTabs) {
            for (const pin of settings.pinnedTabs) {
                pinnedUrls.add(pin.url);
                if (pin.currentUrl) pinnedUrls.add(pin.currentUrl);
            }
        }

        // Track files we've already processed to deduplicate
        const processedFilePaths = new Set<string>();

        // Get all open markdown leaves
        const markdownLeaves = this.plugin.app.workspace.getLeavesOfType('markdown');

        for (const leaf of markdownLeaves) {
            const view = leaf.view;
            if (!(view instanceof MarkdownView)) continue;

            const file = view.file;
            if (!file) continue;

            // Deduplicate by file path - skip if already processed
            if (processedFilePaths.has(file.path)) continue;
            processedFilePaths.add(file.path);

            // Get frontmatter
            const cache = this.plugin.app.metadataCache.getFileCache(file);
            const frontmatter = cache?.frontmatter;
            if (!frontmatter) continue;

            // Check each URL property field
            for (const propName of settings.urlPropertyFields) {
                const propValue = frontmatter[propName] as unknown;
                if (!propValue) continue;

                // Handle string or array
                const values = Array.isArray(propValue) ? propValue : [propValue];

                let foundUrl: string | undefined;

                for (const val of values) {
                    if (typeof val === 'string' && val.trim().startsWith('http')) {
                        foundUrl = val.trim();
                        break;
                    }
                }

                if (foundUrl) {
                    // Skip if URL is already open in a web viewer
                    const urlToCheck = foundUrl; // Capture for closure
                    const isAlreadyOpen = Array.from(openUrls).some(openUrl =>
                        openUrl === urlToCheck || isSameRedditPost(openUrl, urlToCheck)
                    );
                    if (isAlreadyOpen) continue;

                    // Skip if URL belongs to a pinned tab (shown in pinned section instead)
                    // Check using same robust logic as open URLs
                    const isPinned = Array.from(pinnedUrls).some(pinUrl =>
                        pinUrl === urlToCheck || isSameRedditPost(pinUrl, urlToCheck)
                    );
                    if (isPinned) continue;

                    virtualTabs.push({
                        file,
                        url: foundUrl,
                        propertyName: propName,
                        cachedTitle: urlTitleCache.get(foundUrl),
                    });
                    break; // Only add one virtual tab per note
                }
            }
        }

        return virtualTabs;
    }
}
