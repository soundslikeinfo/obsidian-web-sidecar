/*
 * Web Sidecar
 * Copyright (c) 2025 soundslikeinfo
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { App, TFile } from 'obsidian';
import type { WebSidecarSettings, MatchedNote } from '../../types';
import type { UrlIndex } from '../UrlIndex';

/**
 * Check if URL belongs to a YouTube domain (all variants)
 */
export function isYouTubeDomain(url: string): boolean {
    // Match: youtube.com, youtu.be, m.youtube.com, mobile.youtube.com
    // Also matches: youtube-nocookie.com, youtube.co.uk, etc.
    const regex = /^https?:\/\/(?:(?:www\.|m\.|mobile\.)?youtube(?:-nocookie)?\.(?:com|[a-z]{2}(?:\.[a-z]{2})?)|youtu\.be)/i;
    return regex.test(url);
}

/**
 * Extract YouTube channel name from note frontmatter
 * Uses configured property fields in priority order (first match wins)
 */
export function extractYouTubeChannel(
    frontmatter: Record<string, unknown>,
    propertyFields: string[]
): string | null {
    for (const propName of propertyFields) {
        const value = frontmatter[propName];

        if (typeof value === 'string' && value.trim()) {
            return value.trim().replace(/^\[\[|\]\]$/g, '');
        }

        // Handle array values (take first string)
        if (Array.isArray(value) && value.length > 0) {
            const first = value[0] as unknown;
            if (typeof first === 'string' && first.trim()) {
                return first.trim().replace(/^\[\[|\]\]$/g, '');
            }
        }
    }
    return null;
}


/**
 * Get all notes that link to YouTube, grouped by channel name
 * Channel name is extracted from frontmatter properties (not URL)
 */
export function getAllYouTubeNotes(
    app: App,
    settings: WebSidecarSettings,
    urlIndex?: UrlIndex
): Map<string, MatchedNote[]> {
    const channelMap = new Map<string, MatchedNote[]>();
    const propertyFields = settings.youtubeChannelPropertyFields || [];

    if (propertyFields.length === 0) return channelMap;

    // Get all files with URLs
    let filesToCheck: TFile[] | ReadonlyArray<TFile>;
    if (urlIndex) {
        filesToCheck = urlIndex.getAllFilesWithUrls();
    } else {
        filesToCheck = app.vault.getMarkdownFiles();
    }

    for (const file of filesToCheck) {
        const cache = app.metadataCache.getFileCache(file);
        const frontmatter = cache?.frontmatter;
        if (!frontmatter) continue;

        // Check each configured property field for a URL
        for (const propName of settings.urlPropertyFields) {
            const propValue = frontmatter[propName] as unknown;
            if (!propValue) continue;

            const values = Array.isArray(propValue) ? propValue : [propValue];

            for (const val of values) {
                if (typeof val !== 'string') continue;

                // Fast check for YouTube
                if (!isYouTubeDomain(val)) continue;

                // Get channel name from frontmatter
                const channel = extractYouTubeChannel(frontmatter, propertyFields);

                if (!channel) continue;

                if (!channelMap.has(channel)) {
                    channelMap.set(channel, []);
                }

                // Avoid duplicates per channel
                const existing = channelMap.get(channel)!;
                if (!existing.some(m => m.file.path === file.path)) {
                    existing.push({
                        file,
                        matchType: 'tld',
                        url: val,
                        propertyName: propName
                    });
                }
            }
        }
    }

    // Sort notes within each channel by recency
    for (const notes of channelMap.values()) {
        notes.sort((a, b) => b.file.stat.mtime - a.file.stat.mtime);
    }

    return channelMap;
}
