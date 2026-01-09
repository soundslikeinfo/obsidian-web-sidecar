/*
 * Web Sidecar
 * Copyright (c) 2025 soundslikeinfo
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { TFile } from 'obsidian';

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
    matchedChannel?: string;
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
