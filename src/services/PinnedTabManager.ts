/*
 * Web Sidecar
 * Copyright (c) 2025 soundslikeinfo
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { TFile } from 'obsidian';
import type { WebSidecarSettings, TrackedWebViewer, VirtualTab, PinnedTab } from '../types';
import type WebSidecarPlugin from '../main';

export class PinnedTabManager {
    private plugin: WebSidecarPlugin;
    private getSettings: () => WebSidecarSettings;
    private refreshCallback: () => void; // Call parent to refresh state

    constructor(
        plugin: WebSidecarPlugin,
        getSettings: () => WebSidecarSettings,
        refreshCallback: () => void
    ) {
        this.plugin = plugin;
        this.getSettings = getSettings;
        this.refreshCallback = refreshCallback;
    }

    /**
     * Get pinned tabs enriched with active leaf status
     */
    getPinnedTabs(trackedTabs: Map<string, TrackedWebViewer>): PinnedTab[] {
        const settings = this.getSettings();
        // Enrich pinned tabs with active leaf info
        return settings.pinnedTabs.map(pin => {
            // 1. Try to find by stored leafId
            let openTab: TrackedWebViewer | undefined;
            if (pin.leafId) {
                openTab = trackedTabs.get(pin.leafId);
            }

            // If not found by ID, try to find by URL
            if (!openTab) {
                const activeUrl = pin.currentUrl || pin.url;
                openTab = Array.from(trackedTabs.values()).find(t => t.url === activeUrl);
            }

            return {
                ...pin,
                leafId: openTab?.leafId
            };
        });
    }

    async addPinnedTab(tab: TrackedWebViewer | VirtualTab | { url: string; title: string }): Promise<void> {
        if (!this.getSettings().enablePinnedTabs) return;

        const settings = this.getSettings();
        const existing = settings.pinnedTabs.find(p => p.url === tab.url);
        if (existing) return; // Already pinned

        let isNote = false;
        let notePath: string | undefined;

        // Type guard for VirtualTab
        const isVirtualTab = (t: typeof tab): t is VirtualTab => 'file' in t;
        // Type guard for TrackedWebViewer
        const isTrackedWebViewer = (t: typeof tab): t is TrackedWebViewer => 'leafId' in t && 'title' in t;

        if (isVirtualTab(tab)) {
            isNote = true;
            notePath = tab.file.path;
        }

        // Handle inconsistent title properties across types
        let title: string | undefined;
        if (isTrackedWebViewer(tab)) {
            title = tab.title;
        } else if (isVirtualTab(tab)) {
            title = tab.cachedTitle;
        } else {
            title = tab.url;
        }

        const leafId = isTrackedWebViewer(tab) ? tab.leafId : undefined;

        const newPin: PinnedTab = {
            id: crypto.randomUUID(),
            url: tab.url,
            title: title || tab.url,
            isNote,
            notePath,
            leafId
        };

        settings.pinnedTabs.push(newPin);

        if (isNote && notePath) {
            await this.writePinnedProperty(notePath, true);
        }

        await this.plugin.saveSettings();
        this.refreshCallback();
    }

    async removePinnedTab(pinId: string): Promise<void> {
        const settings = this.getSettings();
        const index = settings.pinnedTabs.findIndex(p => p.id === pinId);
        if (index === -1) return;

        const pin = settings.pinnedTabs[index];
        settings.pinnedTabs.splice(index, 1);

        // Remove property from note if applicable
        if (pin && pin.isNote && pin.notePath) {
            await this.writePinnedProperty(pin.notePath, false);
        }

        await this.plugin.saveSettings();
        this.refreshCallback();
    }

    async reorderPinnedTabs(movedPinId: string, targetPinId: string): Promise<void> {
        const settings = this.getSettings();
        const fromIdx = settings.pinnedTabs.findIndex(p => p.id === movedPinId);
        const toIdx = settings.pinnedTabs.findIndex(p => p.id === targetPinId);

        if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return;

        const [moved] = settings.pinnedTabs.splice(fromIdx, 1);
        if (moved) settings.pinnedTabs.splice(toIdx, 0, moved);

        await this.plugin.saveSettings();
        this.refreshCallback();
    }

    async updatePinnedTabCurrentUrl(pinId: string, url: string): Promise<void> {
        const settings = this.getSettings();
        const pin = settings.pinnedTabs.find(p => p.id === pinId);
        if (!pin) return;

        // If back to home url, clear currentUrl
        if (url === pin.url) {
            pin.currentUrl = undefined;
        } else {
            pin.currentUrl = url;
        }

        await this.plugin.saveSettings();
        this.refreshCallback();
    }

    syncPinnedTabCurrentUrl(leafId: string, newUrl: string): void {
        const settings = this.getSettings();
        const pin = settings.pinnedTabs.find(p => p.leafId === leafId);
        if (!pin) return;

        // If back to home url, clear currentUrl
        if (newUrl === pin.url) {
            if (pin.currentUrl !== undefined) {
                pin.currentUrl = undefined;
                this.plugin.saveSettings().then(() => { /* nothing */ }, console.error);
            }
        } else if (pin.currentUrl !== newUrl) {
            // URL changed - update currentUrl
            pin.currentUrl = newUrl;
            this.plugin.saveSettings().then(() => { /* nothing */ }, console.error);
        }
    }

    async resetPinnedTabUrl(pinId: string): Promise<void> {
        await this.updatePinnedTabCurrentUrl(pinId, '');
    }

    async savePinnedTabNewHomeUrl(pinId: string, newUrl: string): Promise<void> {
        const settings = this.getSettings();
        const pin = settings.pinnedTabs.find(p => p.id === pinId);
        if (!pin) return;

        pin.url = newUrl;
        pin.currentUrl = undefined; // Reset session

        await this.plugin.saveSettings();
        this.refreshCallback();
    }

    async setPinnedTabLeaf(pinId: string, leafId: string): Promise<void> {
        const settings = this.getSettings();
        const pin = settings.pinnedTabs.find(p => p.id === pinId);
        if (!pin) return;

        pin.leafId = leafId;
        await this.plugin.saveSettings();
        this.refreshCallback();
    }

    // --- Sync Logic ---

    syncAllPinnedNotes(): void {
        if (!this.getSettings().enablePinnedTabs) return;

        const files = this.plugin.app.vault.getMarkdownFiles();
        for (const file of files) {
            this.syncPinnedStatusForFile(file);
        }
    }

    syncPinnedStatusForFile(file: TFile): void {
        if (!this.getSettings().enablePinnedTabs) return;

        const cache = this.plugin.app.metadataCache.getFileCache(file);
        const frontmatter = cache?.frontmatter;

        const settings = this.getSettings();
        const key = settings.pinnedPropertyKey;
        const value = settings.pinnedPropertyValue;

        let hasPinProp = false;

        if (frontmatter) {
            const propVal = frontmatter[key] as unknown;
            if (propVal) {
                if (Array.isArray(propVal)) {
                    hasPinProp = propVal.includes(value);
                } else {
                    hasPinProp = propVal === value;
                }
            }
        }

        // Check if already pinned
        const existingPin = settings.pinnedTabs.find(p => p.isNote && p.notePath === file.path);

        if (hasPinProp && !existingPin) {
            void this.createPinFromNote(file, frontmatter, settings);
        } else if (!hasPinProp && existingPin) {
            void this.removePinnedTab(existingPin.id);
        }
    }

    async createPinFromNote(file: TFile, frontmatter: unknown, settings: WebSidecarSettings): Promise<void> {
        // Find first valid URL
        let url: string | undefined;
        for (const field of settings.urlPropertyFields) {
            const val = (frontmatter as Record<string, unknown>)[field];
            if (typeof val === 'string' && val.startsWith('http')) {
                url = val;
                break;
            }
        }

        if (url) {
            const newPin: PinnedTab = {
                id: crypto.randomUUID(),
                url: url,
                title: file.basename,
                isNote: true,
                notePath: file.path
            };
            settings.pinnedTabs.push(newPin);
            await this.plugin.saveSettings();
            this.refreshCallback();
        }
    }

    private async writePinnedProperty(filePath: string, add: boolean): Promise<void> {
        const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) return;

        await this.plugin.app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
            const settings = this.getSettings();
            const key = settings.pinnedPropertyKey;
            const value = settings.pinnedPropertyValue;

            let current = frontmatter[key];

            if (add) {
                if (!current) {
                    if (key === 'tags') {
                        frontmatter[key] = [value];
                    } else {
                        frontmatter[key] = value;
                    }
                } else if (Array.isArray(current)) {
                    if (!current.includes(value)) {
                        current.push(value);
                    }
                } else if (current !== value) {
                    if (key === 'tags') {
                        frontmatter[key] = [current, value];
                    } else {
                        frontmatter[key] = value;
                    }
                }
            } else {
                if (Array.isArray(current)) {
                    const idx = current.indexOf(value);
                    if (idx > -1) {
                        current.splice(idx, 1);
                        if (current.length === 0) delete frontmatter[key];
                    }
                } else if (current === value) {
                    delete frontmatter[key];
                }
            }
        });
    }

    async updatePinnedTabNotes(pinId: string): Promise<void> {
        const settings = this.getSettings();
        const pin = settings.pinnedTabs.find(p => p.id === pinId);
        if (!pin || !pin.currentUrl || pin.currentUrl === pin.url) return;

        const oldUrl = pin.url;
        const newUrl = pin.currentUrl;

        const files = this.plugin.app.vault.getMarkdownFiles();

        for (const file of files) {
            await this.plugin.app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
                for (const field of settings.urlPropertyFields) {
                    const val = frontmatter[field];
                    if (!val) continue;

                    if (Array.isArray(val)) {
                        const idx = val.indexOf(oldUrl);
                        if (idx > -1) {
                            val[idx] = newUrl;
                        }
                    } else if (val === oldUrl) {
                        frontmatter[field] = newUrl;
                    }
                }
            });
        }
    }
}
