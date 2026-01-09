/*
 * Web Sidecar
 * Copyright (c) 2025 soundslikeinfo
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { App, TFile } from 'obsidian';
import type { WebSidecarSettings, MatchedNote } from '../../types';
import type { UrlIndex } from '../UrlIndex';

/**
 * Extract GitHub repository from URL
 * Returns "owner/repo" or null
 */
export function extractGithubRepo(url: string): string | null {
    // Matches github.com/owner/repo
    // Capture group 1 is owner, group 2 is repo
    const regex = /https?:\/\/(?:www\.)?github\.com\/([^/?#]+)\/([^/?#]+)/i;
    const match = url.match(regex);

    if (match && match[1] && match[2]) {
        const owner = match[1];
        const repo = match[2];

        // Filter out non-repo paths
        // GitHub usernames/repos are quite flexible, but reserved words exist.
        const reserved = ['settings', 'notifications', 'search', 'explore', 'marketplace', 'topics', 'collections', 'trending', 'sponsors', 'pricing', 'features', 'enterprise', 'team', 'customer-stories', 'security', 'readme', 'premium-support', 'join'];
        if (reserved.includes(owner.toLowerCase())) return null;

        return `${owner}/${repo}`;
    }
    return null;
}

/**
 * Get all notes that link to GitHub, grouped by repository (owner/repo)
 */
export function getAllGithubNotes(
    app: App,
    settings: WebSidecarSettings,
    urlIndex?: UrlIndex
): Map<string, MatchedNote[]> {
    const repoMap = new Map<string, MatchedNote[]>();

    let filesToCheck: TFile[] | ReadonlyArray<TFile>;
    if (urlIndex) {
        const githubFiles = urlIndex.getFilesForDomain('github.com');
        filesToCheck = githubFiles;
    } else {
        filesToCheck = app.vault.getMarkdownFiles();
    }

    // Deduplicate filesToCheck if needed?
    const processedPaths = new Set<string>();

    for (const file of filesToCheck) {
        if (processedPaths.has(file.path)) continue;
        processedPaths.add(file.path);

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

                // Fast check for domain
                if (!val.includes('github.com')) continue;

                const repo = extractGithubRepo(val);
                if (repo) {
                    if (!repoMap.has(repo)) {
                        repoMap.set(repo, []);
                    }

                    // Avoid duplicates per repo
                    const existing = repoMap.get(repo)!;
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

    // Sort notes within each group by recency
    for (const notes of repoMap.values()) {
        notes.sort((a, b) => b.file.stat.mtime - a.file.stat.mtime);
    }

    return repoMap;
}
