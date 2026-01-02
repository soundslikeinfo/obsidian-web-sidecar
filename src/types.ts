import { TFile } from 'obsidian';

/**
 * Plugin settings interface
 */
export interface WebSidecarSettings {
    /** Property names to search for URLs (e.g., ["source", "url", "URL"]) */
    urlPropertyFields: string[];
    /** Primary property name used when creating new notes (default: "source") */
    primaryUrlProperty: string;
    /** Enable expanded search for notes with same top-level domain */
    enableTldSearch: boolean;
    /** Default folder path for new notes (empty = vault root) */
    newNoteFolderPath: string;
    /** Number of recent notes to show when no web viewer is active */
    recentNotesCount: number;
    /** Sort order for web viewer tabs */
    tabSortOrder: TabSortOrder;
}

/**
 * Sort order options for web viewer tabs
 */
export type TabSortOrder = 'focus' | 'title';

/**
 * Default settings values
 */
export const DEFAULT_SETTINGS: WebSidecarSettings = {
    urlPropertyFields: ['source', 'url', 'URL'],
    primaryUrlProperty: 'source',
    enableTldSearch: true,
    newNoteFolderPath: '',
    recentNotesCount: 10,
    tabSortOrder: 'focus',
};

/**
 * Match type for a found note
 */
export type MatchType = 'exact' | 'tld';

/**
 * A note matched by URL search
 */
export interface MatchedNote {
    file: TFile;
    matchType: MatchType;
    url: string;
    propertyName: string;
}

/**
 * Result of URL matching operation
 */
export interface MatchResult {
    exactMatches: MatchedNote[];
    tldMatches: MatchedNote[];
}

/**
 * Recent note with URL info
 */
export interface RecentNoteWithUrl {
    file: TFile;
    url: string;
    propertyName: string;
    modifiedTime: number;
}

/**
 * Info extracted from a web viewer
 */
export interface WebViewerInfo {
    url: string;
    title?: string;
}

/**
 * Tracked web viewer tab with focus timestamp
 */
export interface TrackedWebViewer {
    /** Unique leaf ID */
    leafId: string;
    /** Current URL */
    url: string;
    /** Page title */
    title: string;
    /** When this tab was last focused */
    lastFocused: number;
}
