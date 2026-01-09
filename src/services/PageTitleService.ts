/*
 * Web Sidecar
 * Copyright (c) 2025 soundslikeinfo
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { requestUrl } from 'obsidian';

export class PageTitleService {
    private cache: Map<string, string> = new Map();

    getCachedTitle(url: string): string | undefined {
        return this.cache.get(url);
    }

    async fetchTitle(url: string): Promise<string | null> {
        // Return from cache if available
        if (this.cache.has(url)) {
            return this.cache.get(url)!;
        }

        try {
            // Check for internal URLs to skip
            if (url.startsWith('about:') || url.startsWith('chrome:') || url.startsWith('obsidian:')) {
                return null;
            }

            const response = await requestUrl({ url: url });
            const html = response.text;

            // Simple regex to extract title
            const match = html.match(/<title>([^<]*)<\/title>/i);
            if (match && match[1]) {
                const title = match[1].trim();
                // simple HTML entity decode might be needed, but for now just trim
                // basic entity decode:
                const decodedTitle = title.replace(/&amp;/g, '&')
                    .replace(/&lt;/g, '<')
                    .replace(/&gt;/g, '>')
                    .replace(/&quot;/g, '"')
                    .replace(/&#39;/g, "'");

                this.cache.set(url, decodedTitle);
                return decodedTitle;
            }
        } catch (e) {
            console.debug('Web Sidecar: Failed to fetch title for', url, e);
        }
        return null;
    }
}
