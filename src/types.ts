
import { App, EventRef, TFile, WorkspaceLeaf } from 'obsidian';
import type { UrlIndex } from './services/UrlIndex';

/**
 * Interface to decouple View components from the main View class
 */
export interface IWebSidecarView {
    app: App;
    settings: WebSidecarSettings;
    urlIndex: UrlIndex;
    leaf: WorkspaceLeaf;
    lastActiveLeaf: WorkspaceLeaf | null;

    // Actions
    closeLeaf(leafId: string): void;
    closeAllLeavesForUrl(url: string): void;
    closeLinkedNoteLeaves(url: string): void;

    // Opening/Focusing
    openPaired(file: TFile, url: string, e: MouseEvent): Promise<void>;
    openNoteSmartly(file: TFile, e: MouseEvent): Promise<void>;
    openUrlSmartly(url: string, e: MouseEvent): Promise<void>;
    openCreateNoteModal(url: string): void;

    openNewWebViewer(): Promise<void>;
    saveManualTabOrder(orderedLeafIds: string[]): Promise<void>;
    handleTabDrop(draggedLeafId: string, targetLeafId: string): void;
    handleSectionDrop(draggedId: string, targetId: string): void;
    focusWebViewer(leafId: string): void;
    focusTab(tab: TrackedWebViewer): void;
    focusNextInstance(url: string, allTabs: TrackedWebViewer[]): void;
    focusNextNoteInstance(filePath: string): void;

    // State updates
    onRefresh(): void;
    render(): void; // To trigger re-render from components (e.g. sort)

    // State Access
    subredditSort: 'alpha' | 'count' | 'recent';
    domainSort: 'alpha' | 'count' | 'recent';
    setSubredditSort(sort: 'alpha' | 'count' | 'recent'): void;
    setDomainSort(sort: 'alpha' | 'count' | 'recent'): void;

    isSubredditExplorerOpen: boolean;
    setSubredditExplorerOpen(open: boolean): void;

    isDomainGroupOpen: boolean;
    setDomainGroupOpen(open: boolean): void;

    isRecentNotesOpen: boolean;
    setRecentNotesOpen(open: boolean): void;

    expandedGroupIds: Set<string>;
    setGroupExpanded(id: string, expanded: boolean): void;

    isManualRefresh: boolean;
    setManualRefresh(manual: boolean): void;

    // Tag Grouping State
    tagSort: 'alpha' | 'count' | 'recent';
    setTagSort(sort: 'alpha' | 'count' | 'recent'): void;

    selectedTagSort: 'alpha' | 'count' | 'recent';
    setSelectedTagSort(sort: 'alpha' | 'count' | 'recent'): void;

    isTagGroupOpen: boolean;
    setTagGroupOpen(open: boolean): void;

    isSelectedTagGroupOpen: boolean;
    setSelectedTagGroupOpen(open: boolean): void;
}

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
    /** Manual ordering of tabs by leafId (only used when tabSortOrder = 'manual') */
    manualTabOrder: string[];
    /** Sidebar tab appearance mode */
    tabAppearance: TabAppearance;
    /** Enable experimental web viewer header actions (may break with Obsidian updates) */
    enableWebViewerActions: boolean;
    /** Show new web viewer button in web viewer header (requires enableWebViewerActions) */
    showWebViewerHeaderButton: boolean;
    /** Show new note button in web viewer header (requires enableWebViewerActions) */
    showWebViewerNewNoteButton: boolean;
    /** Show new web viewer option in web viewer More Options menu (requires enableWebViewerActions) */
    showWebViewerMenuOption: boolean;
    /** Show "Open note to the right" option in web viewer menu */
    showWebViewerOpenNoteOption: boolean;
    /** Show "Open note to the right" button in web viewer header */
    showWebViewerOpenNoteButton: boolean;
    /** Collapse duplicate URLs into single entry with click-to-cycle */
    collapseDuplicateUrls: boolean;
    /** How to open notes when clicked from sidebar */
    noteOpenBehavior: NoteOpenBehavior;
    /** Enable subreddit filtering for 'same domain' notes */
    enableSubredditFilter: boolean;
    /** Enable grouping matches by subreddit */
    enableSubredditExplorer: boolean;
    /** Order of auxiliary sections (drag-to-reorder) */
    sectionOrder: string[];
    /** Sort order for domain grouping section */
    domainSortOrder: 'alpha' | 'count' | 'recent';
    /** Sort order for subreddit explorer section */
    subredditSortOrder: 'alpha' | 'count' | 'recent';
    /** Enable grouping all web notes by tags */
    enableTagGrouping: boolean;
    /** Enable grouping web notes by selected tags */
    enableSelectedTagGrouping: boolean;
    /** Comma-separated list of tags to include in the selected tag group */
    selectedTagsAllowlist: string;
    /** Sort order for tag grouping section */
    tagSortOrder: 'alpha' | 'count' | 'recent';
    /** Sort order for selected tag grouping section */
    selectedTagSortOrder: 'alpha' | 'count' | 'recent';

    // UI Persistence
    isRecentNotesOpen: boolean;
    isDomainGroupOpen: boolean;
    isSubredditExplorerOpen: boolean;
    isTagGroupOpen: boolean;
    isSelectedTagGroupOpen: boolean;
    /** JSON string of Set<string> for expanded groups */
    expandedGroupIds: string[];
}

/**
 * Sort order options for web viewer tabs
 */
export type TabSortOrder = 'focus' | 'title' | 'manual';

/**
 * Tab appearance mode for sidebar
 */
export type TabAppearance = 'notes' | 'browser';

/**
 * Note opening behavior from sidebar
 */
export type NoteOpenBehavior = 'split' | 'tab';

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
    manualTabOrder: [],
    tabAppearance: 'browser',
    enableWebViewerActions: false,
    showWebViewerHeaderButton: true,
    showWebViewerNewNoteButton: true,
    showWebViewerMenuOption: true,
    showWebViewerOpenNoteOption: false,
    showWebViewerOpenNoteButton: false,
    collapseDuplicateUrls: true,
    noteOpenBehavior: 'split',
    enableSubredditFilter: false,
    enableSubredditExplorer: false,
    sectionOrder: ['recent', 'domain', 'subreddit', 'tag', 'selected-tag'],
    domainSortOrder: 'alpha',
    subredditSortOrder: 'alpha',
    enableTagGrouping: false,
    enableSelectedTagGrouping: false,
    selectedTagsAllowlist: '',
    tagSortOrder: 'alpha',
    selectedTagSortOrder: 'alpha',

    // UI Persistence Defaults
    isRecentNotesOpen: false,
    isDomainGroupOpen: false,
    isSubredditExplorerOpen: false,
    isTagGroupOpen: false,
    isSelectedTagGroupOpen: false,
    expandedGroupIds: [],
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
    subredditMatches?: Map<string, MatchedNote[]>;
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
    /** Whether this tab is in a popout window */
    isPopout: boolean;
    /** Direct reference to the leaf (more robust than ID) */
    leaf?: WorkspaceLeaf;
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
