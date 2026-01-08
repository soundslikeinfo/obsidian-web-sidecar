
import { WorkspaceLeaf, TFile } from 'obsidian';

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
    /** Whether this tab is in a popout window */
    isPopout: boolean;
    /** Direct reference to the leaf (more robust than ID) */
    leaf?: WorkspaceLeaf;
    /** Original URL when tab was opened from a linked note (before any redirects) */
    originalUrl?: string;
}

/**
 * Virtual tab from an open note with URL property
 */
export interface VirtualTab {
    /** The note file this virtual tab is from */
    file: TFile;
    /** URL from the note's property */
    url: string;
    /** Property name where URL was found */
    propertyName: string;
    /** Cached title from previous web viewer load */
    cachedTitle?: string;
}

/**
 * Pinned web viewer tab
 */
export interface PinnedTab {
    /** Unique ID for the pin (for drag/drop) */
    id: string;
    /** The URL that is pinned (home URL) */
    url: string;
    /** Current URL if the user has navigated away (session state) */
    currentUrl?: string;
    /** Display title */
    title: string;
    /** Whether this pin originated from a Note property */
    isNote: boolean;
    /** Path to the note if it is a note-based pin */
    notePath?: string;
    /** ID of the active web viewer leaf if one is currently open for this pin */
    leafId?: string;
}
