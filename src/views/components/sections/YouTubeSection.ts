/*
 * Web Sidecar
 * Copyright (c) 2025 soundslikeinfo
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { setIcon } from 'obsidian';
import { IWebSidecarView, MatchedNote } from '../../../types';
import { NoteRenderer } from '../NoteRenderer';
import { getAllYouTubeNotes } from '../../../services/noteMatcher';
import { getFaviconUrl } from '../../../services/faviconUtils';
import { addSectionDragHandlers, renderSortButton, sortGroups } from './SectionHelpers';

export class YouTubeSection {
    constructor(
        private view: IWebSidecarView,
        private noteRenderer: NoteRenderer
    ) { }

    /**
     * Render "YouTube channel notes explorer" collapsible section
     */
    render(container: HTMLElement): void {
        if (!this.view.settings.enableYouTubeChannelExplorer) return;

        const channelMap = getAllYouTubeNotes(
            this.view.app, this.view.settings, this.view.urlIndex
        );
        if (channelMap.size === 0) return;

        // Remove existing section before creating new one
        const existingSection = container.querySelector('[data-section-id="youtube"]');
        if (existingSection) existingSection.remove();

        const details = container.createEl('details', {
            cls: 'web-sidecar-domain-section web-sidecar-aux-section'
        });
        details.setAttribute('data-section-id', 'youtube');
        details.setAttribute('draggable', 'true');

        addSectionDragHandlers(this.view, details, 'youtube');

        // Preserve open state
        if (this.view.isYouTubeChannelExplorerOpen) {
            details.setAttribute('open', '');
        }
        details.addEventListener('toggle', () => {
            this.view.setYouTubeChannelExplorerOpen(details.hasAttribute('open'));
        });

        const summary = details.createEl('summary', { cls: 'web-sidecar-domain-summary' });
        const summaryIcon = summary.createSpan({ cls: 'web-sidecar-domain-icon' });

        // YouTube favicon
        summaryIcon.createEl('img', {
            cls: 'web-sidecar-favicon-small',
            attr: {
                src: getFaviconUrl('youtube.com', 16),
                alt: 'YouTube',
                width: '14',
                height: '14'
            }
        });

        summary.createSpan({ text: `YouTube channels (${channelMap.size})` });

        // Sort button
        renderSortButton(summary, this.view.youtubeChannelSort, (sort) => {
            this.view.setYouTubeChannelSort(sort);
            this.view.setManualRefresh(true);
            this.view.onRefresh();
        });

        const groupList = details.createDiv({ cls: 'web-sidecar-domain-list' });
        const sortedChannels = sortGroups(channelMap, this.view.youtubeChannelSort);

        for (const [channel, notes] of sortedChannels) {
            this.renderYouTubeChannelGroup(groupList, channel, notes);
        }
    }

    /**
     * Render a single YouTube channel group
     */
    private renderYouTubeChannelGroup(
        container: HTMLElement,
        channel: string,
        notes: MatchedNote[]
    ): void {
        const details = container.createEl('details', { cls: 'web-sidecar-domain-group' });

        // State persistence
        const groupId = `youtube:${channel}`;
        if (this.view.expandedGroupIds.has(groupId)) {
            details.setAttribute('open', '');
        }
        details.addEventListener('toggle', () => {
            this.view.setGroupExpanded(groupId, details.hasAttribute('open'));
        });

        const summary = details.createEl('summary', { cls: 'web-sidecar-domain-row' });

        // YouTube favicon
        const faviconContainer = summary.createDiv({ cls: 'web-sidecar-domain-favicon' });
        faviconContainer.createEl('img', {
            attr: {
                src: getFaviconUrl('youtube.com', 16),
                alt: '',
                width: '14',
                height: '14'
            }
        });

        // Channel name
        summary.createSpan({ text: channel, cls: 'web-sidecar-domain-name' });

        // Link buttons if channel matches a note in the vault
        const channelNoteFile = this.view.app.metadataCache.getFirstLinkpathDest(channel, '');
        if (channelNoteFile) {
            // Check if the note has a URL property
            const noteCache = this.view.app.metadataCache.getFileCache(channelNoteFile);
            const noteFrontmatter = noteCache?.frontmatter;
            let channelUrl: string | null = null;

            if (noteFrontmatter) {
                for (const propName of this.view.settings.urlPropertyFields) {
                    const val: unknown = noteFrontmatter[propName];
                    if (typeof val === 'string' && val.startsWith('http')) {
                        channelUrl = val;
                        break;
                    }
                    if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'string' && val[0].startsWith('http')) {
                        channelUrl = val[0];
                        break;
                    }
                }
            }

            // Note link button
            const noteLinkBtn = summary.createEl('button', {
                cls: 'web-sidecar-group-link-btn clickable-icon',
                attr: { 'aria-label': `Open ${channel} note` }
            });
            setIcon(noteLinkBtn, 'file-text');
            noteLinkBtn.onclick = async (e) => {
                e.preventDefault();
                e.stopPropagation();
                await this.view.app.workspace.getLeaf(false).openFile(channelNoteFile);
            };

            // Web link button (if URL exists)
            if (channelUrl) {
                const webLinkBtn = summary.createEl('button', {
                    cls: 'web-sidecar-group-link-btn clickable-icon',
                    attr: { 'aria-label': `Open ${channel} in web viewer` }
                });
                setIcon(webLinkBtn, 'external-link');
                webLinkBtn.onclick = async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    await this.view.openUrlSmartly(channelUrl, e);
                };
            }
        }

        // YouTube handle shortcut (@ChannelName -> https://www.youtube.com/@ChannelName)
        // Show external link if channel starts with @ (even if no note exists)
        if (channel.startsWith('@')) {
            const youtubeChannelUrl = `https://www.youtube.com/${channel}`;
            const ytLinkBtn = summary.createEl('button', {
                cls: 'web-sidecar-group-link-btn clickable-icon',
                attr: { 'aria-label': `Open YouTube channel ${channel}` }
            });
            setIcon(ytLinkBtn, 'external-link');
            ytLinkBtn.onclick = async (e) => {
                e.preventDefault();
                e.stopPropagation();
                await this.view.openUrlSmartly(youtubeChannelUrl, e);
            };
        }

        // Count badge
        summary.createSpan({
            text: notes.length.toString(),
            cls: 'web-sidecar-domain-count',
            attr: { 'title': notes.length === 1 ? '1 Note' : `${notes.length} Notes` }
        });

        // Notes list
        const notesList = details.createEl('ul', {
            cls: 'web-sidecar-list web-sidecar-domain-notes'
        });
        for (const note of notes) {
            this.noteRenderer.renderNoteItem(notesList, note.file, note.url, false, false);
        }
    }
}
