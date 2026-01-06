
import { App, TFile } from 'obsidian';
import type { WebSidecarSettings, MatchedNote } from '../../types';
import type { UrlIndex } from '../UrlIndex';

/**
 * Extract Twitter/X username from URL
 * Returns "@username" or null
 */
export function extractTwitterUser(url: string): string | null {
    // Matches x.com/user, twitter.com/user
    // Handles www, mobile subdomains
    // Capture group 1 is the username
    const regex = /https?:\/\/(?:www\.|mobile\.)?(?:twitter\.com|x\.com)\/([^/?#]+)/i;
    const match = url.match(regex);

    if (match && match[1]) {
        const user = match[1];
        // Filter out common non-user paths
        const reserved = ['home', 'explore', 'notifications', 'messages', 'search', 'settings', 'i', 'compose', 'hashtag'];
        if (reserved.includes(user.toLowerCase())) return null;

        return `@${user}`;
    }
    return null;
}

/**
 * Get all notes that link to Twitter/X, grouped by user
 */
export function getAllTwitterNotes(
    app: App,
    settings: WebSidecarSettings,
    urlIndex?: UrlIndex
): Map<string, MatchedNote[]> {
    const userMap = new Map<string, MatchedNote[]>();

    let filesToCheck: TFile[] | ReadonlyArray<TFile>;
    if (urlIndex) {
        // We need both twitter.com and x.com
        const twitterFiles = urlIndex.getFilesForDomain('twitter.com');
        const xFiles = urlIndex.getFilesForDomain('x.com');
        filesToCheck = [...twitterFiles, ...xFiles];
    } else {
        filesToCheck = app.vault.getMarkdownFiles();
    }

    // Deduplicate filesToCheck if needed? (Set)
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
                if (!val.includes('twitter.com') && !val.includes('x.com')) continue;

                const user = extractTwitterUser(val);
                if (user) {
                    if (!userMap.has(user)) {
                        userMap.set(user, []);
                    }

                    // Avoid duplicates per user
                    const existing = userMap.get(user)!;
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

    // Sort notes within each user group by recency
    for (const notes of userMap.values()) {
        notes.sort((a, b) => b.file.stat.mtime - a.file.stat.mtime);
    }

    return userMap;
}
