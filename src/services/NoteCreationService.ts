/*
 * Web Sidecar
 * Copyright (c) 2025 soundslikeinfo
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { App, TFile } from 'obsidian';
import { WebSidecarSettings } from '../types';
import { capturePageAsMarkdown, findWebViewerLeafById } from './contentCapture';

/**
 * Handles creation of linked notes from URLs.
 * Extracted from main.ts to keep plugin lifecycle code minimal.
 */
export class NoteCreationService {
    constructor(
        private app: App,
        private getSettings: () => WebSidecarSettings
    ) { }

    /**
     * Create a linked note directly from URL without modal.
     * Captures page content if setting is enabled and leafId is provided.
     */
    async createLinkedNoteFromUrl(url: string, leafId?: string): Promise<TFile | null> {
        const settings = this.getSettings();

        // Capture content if setting enabled and we have a leafId
        let capturedContent: string | null = null;
        if (settings.capturePageContent && leafId) {
            const leaf = findWebViewerLeafById(this.app, leafId);
            if (leaf) {
                capturedContent = await capturePageAsMarkdown(leaf);
            }
        }

        // Generate title from URL
        const noteTitle = this.generateTitleFromUrl(url);
        const fileName = this.sanitizeFileName(noteTitle) + '.md';
        const folderPath = this.getFolderPath();

        // Construct full path
        let fullPath = folderPath ? `${folderPath}/${fileName}` : fileName;
        fullPath = fullPath.replace(/\/+/g, '/'); // Normalize slashes

        // Create folder if needed
        if (folderPath) {
            const folder = this.app.vault.getAbstractFileByPath(folderPath);
            if (!folder) {
                await this.app.vault.createFolder(folderPath);
            }
        }

        // Handle existing file (append timestamp)
        const existingFile = this.app.vault.getAbstractFileByPath(fullPath);
        if (existingFile) {
            const timestamp = Date.now();
            fullPath = folderPath
                ? `${folderPath}/${this.sanitizeFileName(noteTitle)}-${timestamp}.md`
                : `${this.sanitizeFileName(noteTitle)}-${timestamp}.md`;
        }

        // Generate note content
        const lines = [
            '---',
            `${settings.primaryUrlProperty}: ${url}`,
            '---',
            '',
            `# ${noteTitle}`,
            '',
        ];

        // Add captured content if available
        if (capturedContent) {
            lines.push(capturedContent);
            lines.push('');
        }

        const content = lines.join('\n');

        // Create file
        try {
            const newFile = await this.app.vault.create(fullPath, content);
            await this.app.workspace.openLinkText(fullPath, '', true);
            return newFile;
        } catch (error) {
            console.error('Web Sidecar: Failed to create note:', error);
            return null;
        }
    }

    private generateTitleFromUrl(url: string): string {
        try {
            let urlWithProtocol = url;
            if (!url.match(/^https?:\/\//)) {
                urlWithProtocol = 'https://' + url;
            }
            const parsed = new URL(urlWithProtocol);

            // Try to get a meaningful title from the pathname
            const pathname = parsed.pathname.replace(/\/$/, '');
            if (pathname && pathname !== '/') {
                const lastSegment = pathname.split('/').pop() || '';
                const cleaned = lastSegment
                    .replace(/[-_]/g, ' ')
                    .replace(/\.[^.]+$/, '')
                    .trim();
                if (cleaned) {
                    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
                }
            }

            return parsed.hostname.replace(/^www\./, '');
        } catch {
            return 'New Note';
        }
    }

    private sanitizeFileName(name: string): string {
        return name
            .replace(/[\\/:*?"<>|]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    /**
     * Resolve folder path based on settings - uses vault config or custom path
     */
    private getFolderPath(): string {
        const settings = this.getSettings();

        if (settings.useVaultDefaultLocation) {
            // Define interface for internal API
            interface VaultWithConfig {
                getConfig(key: string): unknown;
            }

            const vault = this.app.vault as unknown as VaultWithConfig;
            const newFileLocation = vault.getConfig('newFileLocation');

            if (newFileLocation === 'folder') {
                return (vault.getConfig('newFileFolderPath') as string) || '';
            } else if (newFileLocation === 'current') {
                // Use folder of currently active file
                const activeFile = this.app.workspace.getActiveFile();
                return activeFile?.parent?.path || '';
            }
            // 'root' or default
            return '';
        }
        return settings.newNoteFolderPath;
    }
}
