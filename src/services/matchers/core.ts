
import { App, TFile } from 'obsidian';
import type { WebSidecarSettings, MatchResult, MatchedNote } from '../../types';
import type { UrlIndex } from '../UrlIndex';
import { normalizeUrl, urlsMatch, isSameDomain, isValidUrl, extractDomain } from '../urlUtils';
import { extractSubreddit, isSameRedditPost } from './reddit';
import { isYouTubeDomain, extractYouTubeChannel } from './youtube';
export { extractGithubRepo } from './github';

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
        const domain = extractDomain(url);
        const domainFiles = domain ? urlIndex.getFilesForDomain(domain) : [];
        const exactFiles = urlIndex.getFilesForNormalizedUrl(url); // Normalized match covers exact & variations

        // Merge and deduplicate
        const fileSet = new Set([...domainFiles, ...exactFiles]);
        filesToCheck = Array.from(fileSet);
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

                // Check for exact match OR domain-specific equivalency (e.g. Reddit post ID match)
                if (urlsMatch(val, url) || isSameRedditPost(val, url)) {
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
                    break;
                }

                // Check for TLD match (if enabled and not already an exact match)
                // Treat all YouTube domains as the same domain
                const bothYouTube = isYouTubeDomain(val) && isYouTubeDomain(url);
                if (settings.enableTldSearch && (isSameDomain(val, url) || bothYouTube)) {
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
    let filteredTldMatches = tldMatches.filter(m => !exactPaths.has(m.file.path));

    // YouTube Channel Filter Logic
    let matchedChannel: string | undefined;

    if (settings.enableYouTubeChannelFilter && isYouTubeDomain(url) && exactMatches.length > 0) {
        // Try to get channel from the first exact match
        const exactMatch = exactMatches[0];
        if (exactMatch) {
            const exactMatchFile = exactMatch.file;
            const cache = app.metadataCache.getFileCache(exactMatchFile);
            const frontmatter = cache?.frontmatter;

            if (frontmatter) {
                const currentChannel = extractYouTubeChannel(frontmatter, settings.youtubeChannelPropertyFields);

                if (currentChannel) {
                    matchedChannel = currentChannel;
                    // Filter TLD matches to only those with the same channel
                    filteredTldMatches = filteredTldMatches.filter(m => {
                        const mCache = app.metadataCache.getFileCache(m.file);
                        const mFrontmatter = mCache?.frontmatter;
                        if (!mFrontmatter) return false;

                        const mChannel = extractYouTubeChannel(mFrontmatter, settings.youtubeChannelPropertyFields);
                        return mChannel === currentChannel;
                    });
                }
            }
        }
    }

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
        subredditMatches: subredditMatches.size > 0 ? subredditMatches : undefined,
        matchedChannel
    };
}
