
import { App, TFile } from 'obsidian';
import type { WebSidecarSettings, MatchedNote } from '../../types';
import type { UrlIndex } from '../UrlIndex';
import { isValidUrl } from '../urlUtils';

/**
 * Get all web notes grouped by their tags
 * @param allowedTags Optional set of tags to filter by. If provided, only returns these tags.
 */
export function getNotesGroupedByTags(
    app: App,
    settings: WebSidecarSettings,
    urlIndex?: UrlIndex,
    allowedTags?: Set<string>
): Map<string, MatchedNote[]> {
    const tagMap = new Map<string, MatchedNote[]>();

    // Optimization: Use index if available
    let filesToCheck: TFile[] | ReadonlyArray<TFile>;
    if (urlIndex) {
        filesToCheck = urlIndex.getAllFilesWithUrls();
    } else {
        filesToCheck = app.vault.getMarkdownFiles();
    }

    // Helper to add note to tag group
    const addToGroup = (tag: string, note: MatchedNote) => {
        // Tag coming from cache/frontmatter usually preserves case
        // If allowedTags is provided, we check against it
        if (allowedTags && !allowedTags.has(tag)) return;

        if (!tagMap.has(tag)) {
            tagMap.set(tag, []);
        }

        const group = tagMap.get(tag)!;
        if (!group.some(m => m.file.path === note.file.path)) {
            group.push(note);
        }
    };

    for (const file of filesToCheck) {
        const cache = app.metadataCache.getFileCache(file);
        if (!cache) continue;

        const frontmatter = cache.frontmatter;
        if (!frontmatter) continue;

        // -- First, check if it is a "Web Note" (has URL property)
        let foundUrl: string | null = null;
        let foundProp: string | null = null;

        for (const propName of settings.urlPropertyFields) {
            const propValue = frontmatter[propName];
            if (!propValue) continue;
            const values = Array.isArray(propValue) ? propValue : [propValue];
            for (const val of values) {
                if (typeof val === 'string' && isValidUrl(val)) {
                    foundUrl = val;
                    foundProp = propName;
                    break;
                }
            }
            if (foundUrl) break;
        }

        if (!foundUrl || !foundProp) continue;

        const matchedNote: MatchedNote = {
            file,
            matchType: 'tld',
            url: foundUrl,
            propertyName: foundProp
        };

        // -- Extract Tags --
        const tags = new Set<string>();

        // 1. Frontmatter tags
        if (frontmatter.tags) {
            const ftags = Array.isArray(frontmatter.tags) ? frontmatter.tags : [frontmatter.tags];
            ftags.forEach((t: unknown) => {
                if (typeof t === 'string') {
                    // Ensure it starts with #
                    const tag = t.startsWith('#') ? t : '#' + t;
                    tags.add(tag);
                }
            });
        }

        // 2. Inline tags
        if (cache.tags) {
            cache.tags.forEach(t => tags.add(t.tag));
        }

        for (const tag of tags) {
            addToGroup(tag, matchedNote);
        }
    }

    // Sort notes within groups by mtime (recent first)
    for (const notes of tagMap.values()) {
        notes.sort((a, b) => b.file.stat.mtime - a.file.stat.mtime);
    }

    return tagMap;
}
