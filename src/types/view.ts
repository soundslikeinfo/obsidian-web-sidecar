/*
 * Web Sidecar
 * Copyright (c) 2025 soundslikeinfo
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { App, WorkspaceLeaf, TFile } from 'obsidian';
import type { UrlIndex } from '../services/UrlIndex';
import type { TabStateService } from '../services/TabStateService';
import { WebSidecarSettings } from './settings';
import { TrackedWebViewer, VirtualTab } from './tabs';

/**
 * Interface to decouple View components from the main View class
 */
export interface IWebSidecarView {
    app: App;
    settings: WebSidecarSettings;
    urlIndex: UrlIndex;
    leaf: WorkspaceLeaf;
    lastActiveLeafId: string | null;

    // State
    trackedTabs: TrackedWebViewer[];
    tabStateService: TabStateService;

    // Actions
    closeLeaf(leafId: string): void;
    closeAllLeavesForUrl(url: string): void;
    closeLinkedNoteLeaves(url: string): void;

    // Pinned Tabs Management
    pinTab(tab: TrackedWebViewer | VirtualTab): Promise<void>;
    unpinTab(pinId: string): Promise<void>;
    reorderPinnedTabs(movedPinId: string, targetPinId: string): Promise<void>;
    resetPinnedTab(pinId: string): Promise<void>;
    updatePinnedTabHomeUrl(pinId: string, newUrl: string): Promise<void>;

    // Opening/Focusing
    openPaired(file: TFile, url: string, e: MouseEvent): Promise<void>;
    openNoteSmartly(file: TFile, e: MouseEvent | KeyboardEvent, referenceLeafId?: string): Promise<void>;
    openUrlSmartly(url: string, e: MouseEvent): Promise<void>;
    openCreateNoteModal(url: string, leafId?: string): void;

    openNewWebViewer(): Promise<void>;
    getOrCreateRightLeaf(): WorkspaceLeaf;
    getOrCreateWebViewerLeaf(): WorkspaceLeaf;
    saveManualTabOrder(orderedLeafIds: string[]): Promise<void>;
    handleTabDrop(draggedLeafId: string, targetLeafId: string): void;
    handleSectionDrop(draggedId: string, targetId: string): void;
    focusWebViewer(leafId: string): void;
    focusTab(tab: TrackedWebViewer): void;
    focusNextInstance(url: string, allTabs: TrackedWebViewer[]): void;
    focusNextWebViewerInstance(url: string): void;
    focusNextNoteInstance(filePath: string): void;

    // State updates
    onRefresh(): void;
    render(force?: boolean): void; // To trigger re-render from components (e.g. sort)

    // State Access
    subredditSort: 'alpha' | 'count' | 'recent';
    domainSort: 'alpha' | 'count' | 'recent';
    setSubredditSort(sort: 'alpha' | 'count' | 'recent'): void;
    setDomainSort(sort: 'alpha' | 'count' | 'recent'): void;

    // YouTube Channel grouping
    youtubeChannelSort: 'alpha' | 'count' | 'recent';
    setYouTubeChannelSort(sort: 'alpha' | 'count' | 'recent'): void;

    // Twitter User grouping
    twitterSort: 'alpha' | 'count' | 'recent';
    setTwitterSort(sort: 'alpha' | 'count' | 'recent'): void;

    isSubredditExplorerOpen: boolean;
    setSubredditExplorerOpen(open: boolean): void;

    isYouTubeChannelExplorerOpen: boolean;
    setYouTubeChannelExplorerOpen(open: boolean): void;

    isTwitterExplorerOpen: boolean;
    setTwitterExplorerOpen(open: boolean): void;

    isGithubExplorerOpen: boolean;
    setGithubExplorerOpen(open: boolean): void;

    githubSort: 'alpha' | 'count' | 'recent';
    setGithubSort(sort: 'alpha' | 'count' | 'recent'): void;

    isDomainGroupOpen: boolean;
    setDomainGroupOpen(open: boolean): void;

    isRecentNotesOpen: boolean;
    setRecentNotesOpen(open: boolean): void;

    expandedGroupIds: Set<string>;
    setGroupExpanded(id: string, expanded: boolean): void;

    isManualRefresh: boolean;
    setManualRefresh(manual: boolean): void;

    saveSettingsFn(): Promise<void>;

    // Tag Grouping State
    tagSort: 'alpha' | 'count' | 'recent';
    setTagSort(sort: 'alpha' | 'count' | 'recent'): void;

    selectedTagSort: 'alpha' | 'count' | 'recent';
    setSelectedTagSort(sort: 'alpha' | 'count' | 'recent'): void;

    isTagGroupOpen: boolean;
    setTagGroupOpen(open: boolean): void;

    isSelectedTagGroupOpen: boolean;
    setSelectedTagGroupOpen(open: boolean): void;

    // Redirect detection (for linked note URL updates)
    hasRedirectedUrl(leafId: string): boolean;
    updateTrackedTabNotes(leafId: string): Promise<void>;
    setTabOriginalUrl(leafId: string, url: string): void;
    setPendingOriginalUrl(url: string): void;
}
