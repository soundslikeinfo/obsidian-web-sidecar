/*
 * Web Sidecar
 * Copyright (c) 2025 soundslikeinfo
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { App, TFile } from 'obsidian';
import type { WebSidecarSettings, RecentNoteWithUrl } from '../../types';
import type { UrlIndex } from '../UrlIndex';
import { isValidUrl } from '../urlUtils';

/**
 * Get recent notes that have URL properties
 */
export function getRecentNotesWithUrls(
    app: App,
    settings: WebSidecarSettings,
    limit: number = 10,
    urlIndex?: UrlIndex
): RecentNoteWithUrl[] {
    const notesWithUrls: RecentNoteWithUrl[] = [];

    // Optimization: Use index if available
    let filesToCheck: TFile[] | ReadonlyArray<TFile>;
    if (urlIndex) {
        // Use the cached recent files (capped at 150 safety limit)
        filesToCheck = urlIndex.getRecentFiles(150);
    } else {
        filesToCheck = app.vault.getMarkdownFiles();
    }

    for (const file of filesToCheck) {
        const cache = app.metadataCache.getFileCache(file);
        const frontmatter = cache?.frontmatter;

        if (!frontmatter) continue;

        // Check each configured property field
        for (const propName of settings.urlPropertyFields) {
            const propValue = frontmatter[propName] as unknown;

            if (!propValue) continue;

            // Handle array or string
            const values = Array.isArray(propValue) ? propValue : [propValue];

            for (const val of values) {
                if (typeof val !== 'string') continue;
                if (!isValidUrl(val)) continue;

                notesWithUrls.push({
                    file,
                    url: val,
                    propertyName: propName,
                    modifiedTime: file.stat.mtime,
                });
                break; // Only add each file once
            }
            if (notesWithUrls[notesWithUrls.length - 1]?.file.path === file.path) break;
        }
    }

    // Sort by modification time (most recent first) and limit
    return notesWithUrls
        .sort((a, b) => b.modifiedTime - a.modifiedTime)
        .slice(0, limit);
}
