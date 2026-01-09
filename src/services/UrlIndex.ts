/*
 * Web Sidecar
 * Copyright (c) 2025 soundslikeinfo
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { App, TFile, EventRef, Events } from 'obsidian';
import type { WebSidecarSettings } from '../types';
import { extractDomain, isValidUrl, normalizeUrl } from './urlUtils';

export class UrlIndex extends Events {
    private app: App;
    private getSettings: () => WebSidecarSettings;
    private urlToFiles: Map<string, Set<TFile>> = new Map();
    private normalizedUrlToFiles: Map<string, Set<TFile>> = new Map();
    private domainToFiles: Map<string, Set<TFile>> = new Map();
    // Reverse index to quickly clear file entries on update
    private fileToUrls: Map<string, Set<string>> = new Map();

    private listeners: EventRef[] = [];

    constructor(app: App, getSettings: () => WebSidecarSettings) {
        super();
        this.app = app;
        this.getSettings = getSettings;
    }

    initialize(): void {
        this.rebuildIndex();

        // Listen for metadata changes (content edit)
        const cacheRef = this.app.metadataCache.on('changed', (file) => {
            this.updateFileIndex(file);
        });
        this.listeners.push(cacheRef);

        // Listen for file deletion
        const deleteRef = this.app.vault.on('delete', (file) => {
            if (file instanceof TFile && file.extension === 'md') {
                this.removeFileFromIndex(file);
                this.trigger('index-updated');
            }
        });
        this.listeners.push(deleteRef);

        // Listen for file creation
        const createRef = this.app.vault.on('create', (file) => {
            if (file instanceof TFile && file.extension === 'md') {
                this.updateFileIndex(file);
            }
        });
        this.listeners.push(createRef);

        // Listen for file rename (path changes, but we track by TFile which might be same obj, 
        // strictly speaking we use path in fileToUrls map key)
        const renameRef = this.app.vault.on('rename', (file, oldPath) => {
            if (file instanceof TFile && file.extension === 'md') {
                // If path changed, we need to move entry in fileToUrls
                const urls = this.fileToUrls.get(oldPath);
                if (urls) {
                    this.fileToUrls.delete(oldPath);
                    this.fileToUrls.set(file.path, urls);
                    this.trigger('index-updated');
                }
            }
        });
        this.listeners.push(renameRef);
    }

    destroy(): void {
        this.listeners.forEach(ref => this.app.metadataCache.offref(ref));
        this.listeners.forEach(ref => this.app.vault.offref(ref));
        this.urlToFiles.clear();
        this.normalizedUrlToFiles.clear();
        this.domainToFiles.clear();
        this.fileToUrls.clear();
    }

    /**
     * Get files referencing this URL exactly
     */
    getFilesForUrl(url: string): TFile[] {
        const files = this.urlToFiles.get(url);
        return files ? Array.from(files) : [];
    }

    /**
     * Get files referencing this URL (normalized)
     */
    getFilesForNormalizedUrl(url: string): TFile[] {
        const normalized = normalizeUrl(url);
        if (!normalized) return [];
        const files = this.normalizedUrlToFiles.get(normalized);
        return files ? Array.from(files) : [];
    }

    /**
     * Get files matching the domain of this URL
     */
    getFilesForDomain(domain: string): TFile[] {
        const files = this.domainToFiles.get(domain);
        return files ? Array.from(files) : [];
    }

    /**
     * Get all files that have indexed URLs
     */
    getAllFilesWithUrls(): TFile[] {
        const files: TFile[] = [];
        for (const path of this.fileToUrls.keys()) {
            const file = this.app.vault.getAbstractFileByPath(path);
            if (file instanceof TFile) {
                files.push(file);
            }
        }
        return files;
    }

    /**
     * Cache -- LIMIT Configurable
     * Safety measure to prevent performance issues in large vaults
     */
    private recentFiles: TFile[] = [];

    /**
     * Get recent files with URLs, limited by the safety cap
     */
    getRecentFiles(limit?: number): TFile[] {
        const maxCache = this.getSettings().recentNotesCacheLimit;
        // Return up to 'limit' or the safety cap
        const max = limit ? Math.min(limit, maxCache) : maxCache;
        return this.recentFiles.slice(0, max);
    }

    /**
     * Full rebuild
     */
    rebuildIndex(): void {
        this.urlToFiles.clear();
        this.normalizedUrlToFiles.clear();
        this.domainToFiles.clear();
        this.fileToUrls.clear();

        const files = this.app.vault.getMarkdownFiles();

        // Populate maps
        for (const file of files) {
            this.updateFileIndex(file, true); // suppress event during loop
        }

        // Build initial recent cache
        const maxCache = this.getSettings().recentNotesCacheLimit;
        // sort all files with URLs by mtime
        const filesWithUrls = this.getAllFilesWithUrls();
        this.recentFiles = filesWithUrls
            .sort((a, b) => b.stat.mtime - a.stat.mtime)
            .slice(0, maxCache);

        this.trigger('index-updated');
    }

    /**
     * Update index for a single file
     */
    updateFileIndex(file: TFile, suppressEvent = false): void {
        // 1. Clear existing entries for this file
        this.removeFileFromIndex(file);

        // 2. Parse new frontmatter
        const cache = this.app.metadataCache.getFileCache(file);
        const frontmatter = cache?.frontmatter;

        let hasChanges = false;
        let hasUrls = false;

        if (frontmatter) {
            const settings = this.getSettings();
            const foundUrls = new Set<string>();

            for (const propName of settings.urlPropertyFields) {
                const propValue = frontmatter[propName] as unknown;
                if (!propValue) continue;

                // Handle string or array of strings
                const urls = Array.isArray(propValue) ? propValue : [propValue];

                for (const rawUrl of urls) {
                    if (typeof rawUrl === 'string' && isValidUrl(rawUrl)) {
                        foundUrls.add(rawUrl);
                    }
                }
            }

            // 3. Add to indices
            if (foundUrls.size > 0) {
                hasUrls = true;
                this.fileToUrls.set(file.path, foundUrls);

                for (const url of foundUrls) {
                    // Index by URL
                    if (!this.urlToFiles.has(url)) {
                        this.urlToFiles.set(url, new Set());
                    }
                    this.urlToFiles.get(url)!.add(file);

                    // Index by Normalized URL
                    const normalized = normalizeUrl(url);
                    if (normalized) {
                        if (!this.normalizedUrlToFiles.has(normalized)) {
                            this.normalizedUrlToFiles.set(normalized, new Set());
                        }
                        this.normalizedUrlToFiles.get(normalized)!.add(file);
                    }

                    // Index by Domain
                    const domain = extractDomain(url);
                    if (domain) {
                        if (!this.domainToFiles.has(domain)) {
                            this.domainToFiles.set(domain, new Set());
                        }
                        this.domainToFiles.get(domain)!.add(file);
                    }
                }
                hasChanges = true;
            }
        }

        // Update Recent Cache
        if (hasUrls) {
            // Remove if exists (it shouldn't because we declared it removed in step 1, 
            // but removeFileFromIndex handles recentFiles removal too)

            // Add to top (most recent)
            this.recentFiles.unshift(file);
            // Cap size
            const maxCache = this.getSettings().recentNotesCacheLimit;
            if (this.recentFiles.length > maxCache) {
                this.recentFiles.pop();
            }
        }

        if (hasChanges && !suppressEvent) {
            this.trigger('index-updated');
        }
    }

    /**
     * Remove file from all indices
     */
    removeFileFromIndex(file: TFile): void {
        // Remove from recent cache
        const idx = this.recentFiles.indexOf(file);
        if (idx !== -1) {
            this.recentFiles.splice(idx, 1);
        }

        const urls = this.fileToUrls.get(file.path);
        if (!urls) return;

        for (const url of urls) {
            // Remove from URL index
            const filesForUrl = this.urlToFiles.get(url);
            if (filesForUrl) {
                filesForUrl.delete(file);
                if (filesForUrl.size === 0) {
                    this.urlToFiles.delete(url);
                }
            }

            // Remove from Normalized URL index
            const normalized = normalizeUrl(url);
            if (normalized) {
                const filesForNormalized = this.normalizedUrlToFiles.get(normalized);
                if (filesForNormalized) {
                    filesForNormalized.delete(file);
                    if (filesForNormalized.size === 0) {
                        this.normalizedUrlToFiles.delete(normalized);
                    }
                }
            }

            // Remove from Domain index
            const domain = extractDomain(url);
            if (domain) {
                const filesForDomain = this.domainToFiles.get(domain);
                if (filesForDomain) {
                    filesForDomain.delete(file);
                    if (filesForDomain.size === 0) {
                        this.domainToFiles.delete(domain);
                    }
                }
            }
        }

        this.fileToUrls.delete(file.path);
    }
}
