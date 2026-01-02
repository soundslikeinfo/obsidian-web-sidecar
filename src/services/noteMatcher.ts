
import { App, TFile } from 'obsidian';
import type { WebSidecarSettings, MatchResult, MatchedNote, RecentNoteWithUrl } from '../types';
import type { UrlIndex } from './UrlIndex';
import { normalizeUrl, urlsMatch, isSameDomain, isValidUrl, extractDomain } from './urlUtils';

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
 * Find notes that match the given URL based on configured property fields
 */
export function findMatchingNotes(
    app: App,
    url: string,
    settings: WebSidecarSettings,
    urlIndex?: UrlIndex
): MatchResult {
    const exactMatches: MatchedNote[] = [];
    const tldMatches: MatchedNote[] = [];
    const subredditMatches = new Map<string, MatchedNote[]>();
    const normalizedSearchUrl = normalizeUrl(url);

    if (!normalizedSearchUrl) {
        return { exactMatches, tldMatches };
    }

    const currentSubreddit = extractSubreddit(url);

    // Optimization: Use index if available to narrow down files
    let filesToCheck: TFile[] | ReadonlyArray<TFile>;

    if (urlIndex) {
        // If we have an index, we only need to check files that match the domain
        // This covers both exact matches (usually same domain) and cross-domain exact matches?
        // Wait, if I have http://bit.ly/xyz redirecting to http://example.com/foo
        // And my note has bit.ly link.
        // My targetUrl is example.com.
        // They won't match domain.
        // But `urlsMatch` usually checks string equivalence or normalization. It doesn't follow redirects.
        // So they must be same domain usually.
        // What if one is raw IP? 
        // We assume domain matching is a safe filter for 99% cases.
        // We also include files matching the exact URL string to be safe (if domain parsing failed or differed).

        const domain = extractDomain(url);
        const domainFiles = domain ? urlIndex.getFilesForDomain(domain) : [];
        const exactFiles = urlIndex.getFilesForUrl(url); // Raw match

        // Merge and deduplicate
        const fileSet = new Set([...domainFiles, ...exactFiles]);
        filesToCheck = Array.from(fileSet);

        // If no domain could be extracted, and no exact match, we might miss "normalized" exact matches that are not in exactFiles.
        // But if `extractDomain` fails, `isValidUrl` probably fails too.
        // If we want to be paranoid, fallback to full scan if `filesToCheck` is empty and url looks valid?
        // No, let's trust the index.
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

            // Handle array of values or single value
            const values = Array.isArray(propValue) ? propValue : [propValue];

            for (const val of values) {
                if (typeof val !== 'string') continue;
                if (!isValidUrl(val)) continue;

                // Check for exact match
                if (urlsMatch(val, url)) {
                    // Check if already added (if we have multiple properties pointing to same URL)
                    if (!exactMatches.some(m => m.file.path === file.path)) {
                        exactMatches.push({
                            file,
                            matchType: 'exact',
                            url: val,
                            propertyName: propName,
                        });
                    }
                    // Continue to next file (don't add as TLD match if it's exact)
                    // But we are inside loop over values. 
                    // Should we break to next file? Yes.
                    break;
                }

                // Check for TLD match (if enabled and not already an exact match)
                if (settings.enableTldSearch && isSameDomain(val, url)) {
                    // Avoid duplicates - check if this file is already in tldMatches
                    const alreadyMatched = tldMatches.some(m => m.file.path === file.path);

                    if (!alreadyMatched) {
                        const match: MatchedNote = {
                            file,
                            matchType: 'tld',
                            url: val,
                            propertyName: propName,
                        };

                        // Check if this note url is also a subreddit
                        const noteSubreddit = extractSubreddit(val);

                        // Logic for Subreddit Explorer (Grouping)
                        if (settings.enableSubredditExplorer && noteSubreddit) {
                            if (!subredditMatches.has(noteSubreddit)) {
                                subredditMatches.set(noteSubreddit, []);
                            }
                            // Avoid duplicates within the group
                            if (!subredditMatches.get(noteSubreddit)?.some(m => m.file.path === file.path)) {
                                subredditMatches.get(noteSubreddit)?.push(match);
                            }
                        }

                        // For the main "Same Domain" list (tldMatches):
                        // If filter is ON, we only add if it matches the current subreddit
                        if (settings.enableSubredditFilter && currentSubreddit) {
                            // If current URL is a subreddit, only show same-subreddit notes in the main list
                            if (noteSubreddit === currentSubreddit) {
                                tldMatches.push(match);
                            }
                        } else {
                            // Regular behavior (add all domain matches)
                            tldMatches.push(match);
                        }
                    }
                }
            }
            // If we found exact match in values loop, break out of prop loop to next file
            if (exactMatches.some(m => m.file.path === file.path)) break;
        }
    }

    // Remove exact matches from TLD matches and Subreddit matches (exact takes priority)
    const exactPaths = new Set(exactMatches.map(m => m.file.path));

    // Filter TLD matches
    const filteredTldMatches = tldMatches.filter(m => !exactPaths.has(m.file.path));

    // Filter Subreddit matches map
    if (settings.enableSubredditExplorer) {
        for (const [key, matches] of subredditMatches.entries()) {
            const filtered = matches.filter(m => !exactPaths.has(m.file.path));
            if (filtered.length > 0) {
                subredditMatches.set(key, filtered);
            } else {
                subredditMatches.delete(key);
            }
        }
    }

    return {
        exactMatches,
        tldMatches: filteredTldMatches,
        subredditMatches: subredditMatches.size > 0 ? subredditMatches : undefined
    };
}

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
        filesToCheck = urlIndex.getAllFilesWithUrls();
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
