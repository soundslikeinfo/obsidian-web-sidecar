import { App, TFile } from 'obsidian';
import type { WebSidecarSettings, MatchResult, MatchedNote, RecentNoteWithUrl } from './types';
import { normalizeUrl, urlsMatch, isSameDomain, isValidUrl } from './urlUtils';

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
    const normalizedSearchUrl = normalizeUrl(url);

    if (!normalizedSearchUrl) {
        return { exactMatches, tldMatches };
    }

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
                const alreadyMatched = tldMatches.some(m => m.file.path === file.path);
                if (!alreadyMatched) {
                    tldMatches.push({
                        file,
                        matchType: 'tld',
                        url: propValue,
                        propertyName: propName,
                    });
                }
            }
        }
    }

    // Remove exact matches from TLD matches (exact takes priority)
    const exactPaths = new Set(exactMatches.map(m => m.file.path));
    const filteredTldMatches = tldMatches.filter(m => !exactPaths.has(m.file.path));

    return {
        exactMatches,
        tldMatches: filteredTldMatches,
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
