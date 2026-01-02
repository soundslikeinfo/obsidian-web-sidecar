import { App, TFile } from 'obsidian';
import type { WebSidecarSettings, MatchResult, MatchedNote, RecentNoteWithUrl } from '../types';
import { normalizeUrl, urlsMatch, isSameDomain, isValidUrl } from './urlUtils';

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
    settings: WebSidecarSettings
): MatchResult {
    const exactMatches: MatchedNote[] = [];
    const tldMatches: MatchedNote[] = [];
    const subredditMatches = new Map<string, MatchedNote[]>();
    const normalizedSearchUrl = normalizeUrl(url);

    if (!normalizedSearchUrl) {
        return { exactMatches, tldMatches };
    }

    const currentSubreddit = extractSubreddit(url);
    const files = app.vault.getMarkdownFiles();

    for (const file of files) {
        const cache = app.metadataCache.getFileCache(file);
        const frontmatter = cache?.frontmatter;

        if (!frontmatter) continue;

        // Check each configured property field
        for (const propName of settings.urlPropertyFields) {
            const propValue = frontmatter[propName];

            if (!propValue || typeof propValue !== 'string') continue;
            if (!isValidUrl(propValue)) continue;

            // Check for exact match
            if (urlsMatch(propValue, url)) {
                exactMatches.push({
                    file,
                    matchType: 'exact',
                    url: propValue,
                    propertyName: propName,
                });
                break; // Don't add same file multiple times for exact match
            }

            // Check for TLD match (if enabled and not already an exact match)
            if (settings.enableTldSearch && isSameDomain(propValue, url)) {
                // Avoid duplicates - check if this file is already in tldMatches
                // Note: We check if it's already in tldMatches, but we might move it later based on logic
                const alreadyMatched = tldMatches.some(m => m.file.path === file.path);

                if (!alreadyMatched) {
                    const match: MatchedNote = {
                        file,
                        matchType: 'tld',
                        url: propValue,
                        propertyName: propName,
                    };

                    // Check if this note url is also a subreddit
                    const noteSubreddit = extractSubreddit(propValue);

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
                        // If not same subreddit, we effectively filter it out of the main list
                    } else {
                        // Regular behavior (add all domain matches)
                        tldMatches.push(match);
                    }
                }
            }
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
    limit: number = 10
): RecentNoteWithUrl[] {
    const notesWithUrls: RecentNoteWithUrl[] = [];
    const files = app.vault.getMarkdownFiles();

    for (const file of files) {
        const cache = app.metadataCache.getFileCache(file);
        const frontmatter = cache?.frontmatter;

        if (!frontmatter) continue;

        // Check each configured property field
        for (const propName of settings.urlPropertyFields) {
            const propValue = frontmatter[propName];

            if (!propValue || typeof propValue !== 'string') continue;
            if (!isValidUrl(propValue)) continue;

            notesWithUrls.push({
                file,
                url: propValue,
                propertyName: propName,
                modifiedTime: file.stat.mtime,
            });
            break; // Only add each file once
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
    settings: WebSidecarSettings
): Map<string, MatchedNote[]> {
    const subredditMap = new Map<string, MatchedNote[]>();
    const files = app.vault.getMarkdownFiles();

    for (const file of files) {
        const cache = app.metadataCache.getFileCache(file);
        const frontmatter = cache?.frontmatter;

        if (!frontmatter) continue;

        // Check each configured property field
        for (const propName of settings.urlPropertyFields) {
            const propValue = frontmatter[propName];

            if (!propValue || typeof propValue !== 'string') continue;

            // Fast check for reddit
            if (!propValue.includes('reddit.com')) continue;

            const subreddit = extractSubreddit(propValue);
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
                        url: propValue,
                        propertyName: propName
                    });
                }
            }
        }
    }

    // Sort notes within each subreddit by recency (if possible, but we don't have stat here without looking up)
    // Actually we have file.stat
    for (const notes of subredditMap.values()) {
        notes.sort((a, b) => b.file.stat.mtime - a.file.stat.mtime);
    }

    return subredditMap;
}
