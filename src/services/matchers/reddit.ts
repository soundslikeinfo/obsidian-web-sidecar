/*
 * Web Sidecar
 * Copyright (c) 2025 soundslikeinfo
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { App, TFile } from 'obsidian';
import type { WebSidecarSettings, MatchedNote } from '../../types';
import type { UrlIndex } from '../UrlIndex';

/**
 * Extract subreddit name from URL if it's a reddit URL
 * Returns "r/subredditName" or null
 */
export function extractSubreddit(url: string): string | null {
    // Matches reddit.com/r/subreddit and captures 'subreddit'
    // Handles www, old, new subdomains
    // Case insensitive
    const regex = /https?:\/\/(?:www\.|old\.|new\.)?reddit\.com\/r\/([^/]+)/i;
    const match = url.match(regex);
    if (match && match[1]) {
        return `r/${match[1]}`;
    }
    return null;
}

/**
 * Extract the Reddit post ID from a URL
 * e.g. .../comments/1q4o8pu/... -> "1q4o8pu"
 */
export function extractRedditPostId(url: string): string | null {
    // Matches /comments/{id}
    const regex = /\/comments\/([a-z0-9]+)/i;
    const match = url.match(regex);
    return match && match[1] ? match[1] : null;
}

/**
 * Check if two URLs refer to the same Reddit post
 * This handles cases where one URL might include a slug and the other doesn't,
 * or if the slug changed (e.g. to "removed_by_moderator").
 */
export function isSameRedditPost(url1: string, url2: string): boolean {
    // Fast check: both must contain "reddit.com"
    if (!url1.includes('reddit.com') || !url2.includes('reddit.com')) return false;

    const id1 = extractRedditPostId(url1);
    const id2 = extractRedditPostId(url2);

    if (id1 && id2) {
        return id1 === id2;
    }
    return false;
}


/**
 * Get all notes that link to Reddit, grouped by subreddit
 */
export function getAllRedditNotes(
    app: App,
    settings: WebSidecarSettings,
    urlIndex?: UrlIndex
): Map<string, MatchedNote[]> {
    const subredditMap = new Map<string, MatchedNote[]>();

    // Optimization: Use index for reddit.com domain
    let filesToCheck: TFile[] | ReadonlyArray<TFile>;
    if (urlIndex) {
        filesToCheck = urlIndex.getFilesForDomain('reddit.com');
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

            const values = Array.isArray(propValue) ? propValue : [propValue];

            for (const val of values) {
                if (typeof val !== 'string') continue;

                // Fast check for reddit
                if (!val.includes('reddit.com')) continue;

                const subreddit = extractSubreddit(val);
                if (subreddit) {
                    if (!subredditMap.has(subreddit)) {
                        subredditMap.set(subreddit, []);
                    }

                    // Avoid duplicates per subreddit
                    const existing = subredditMap.get(subreddit)!;
                    if (!existing.some(m => m.file.path === file.path)) {
                        existing.push({
                            file,
                            matchType: 'tld', // broadly considering it TLD/domain match
                            url: val,
                            propertyName: propName
                        });
                    }
                }
            }
        }
    }

    // Sort notes within each subreddit by recency
    for (const notes of subredditMap.values()) {
        notes.sort((a, b) => b.file.stat.mtime - a.file.stat.mtime);
    }

    return subredditMap;
}
