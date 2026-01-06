
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
            const propValue = frontmatter[propName];

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
