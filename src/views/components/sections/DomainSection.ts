/*
 * Web Sidecar
 * Copyright (c) 2025 soundslikeinfo
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { setIcon } from 'obsidian';
import { IWebSidecarView, RecentNoteWithUrl } from '../../../types';
import { NoteRenderer } from '../NoteRenderer';
import { ContextMenus } from '../ContextMenus';
import { getRecentNotesWithUrls } from '../../../services/noteMatcher';
import { extractDomain } from '../../../services/urlUtils';
import { getFaviconUrl } from '../../../services/faviconUtils';
import { addSectionDragHandlers, renderSortButton, sortGroups } from './SectionHelpers';

export class DomainSection {
    constructor(
        private view: IWebSidecarView,
        private noteRenderer: NoteRenderer,
        private contextMenus: ContextMenus
    ) { }

    /**
     * Render "Web domains" collapsible section
     */
    render(container: HTMLElement): void {
        const recentNotes = getRecentNotesWithUrls(
            this.view.app,
            this.view.settings,
            100, // Get more notes for domain grouping
            this.view.urlIndex
        );

        if (recentNotes.length === 0) return;

        // Group notes by domain
        const domainMap = new Map<string, { notes: typeof recentNotes, domain: string }>();
        for (const note of recentNotes) {
            const domain = extractDomain(note.url);
            if (!domain) continue;
            if (!domainMap.has(domain)) {
                domainMap.set(domain, { notes: [], domain });
            }
            domainMap.get(domain)!.notes.push(note);
        }

        // Only show if we have domains
        if (domainMap.size === 0) return;

        // Remove existing domain section before creating new one
        const existingSection = container.querySelector('[data-section-id="domain"]');
        if (existingSection) existingSection.remove();

        const details = container.createEl('details', { cls: 'web-sidecar-domain-section web-sidecar-aux-section' });
        details.setAttribute('data-section-id', 'domain');
        details.setAttribute('draggable', 'true');

        // Drag-and-drop handlers
        addSectionDragHandlers(this.view, details, 'domain');
        // Preserve open state
        if (this.view.isDomainGroupOpen) {
            details.setAttribute('open', '');
        }
        details.addEventListener('toggle', () => {
            this.view.setDomainGroupOpen(details.hasAttribute('open'));
        });

        const summary = details.createEl('summary', { cls: 'web-sidecar-domain-summary' });
        const summaryIcon = summary.createSpan({ cls: 'web-sidecar-domain-icon' });
        setIcon(summaryIcon, 'globe');
        summary.createSpan({ text: `Web domains (${domainMap.size})` });

        // Sort button
        renderSortButton(summary, this.view.domainSort, (sort) => {
            this.view.setDomainSort(sort);
            this.view.setManualRefresh(true);
            this.view.onRefresh();
        });

        const domainList = details.createDiv({ cls: 'web-sidecar-domain-list' });

        // Map adaptation for sortGroups helper
        const simpleMap = new Map<string, RecentNoteWithUrl[]>();
        for (const [key, val] of domainMap.entries()) {
            simpleMap.set(key, val.notes);
        }

        const sortedDomains = sortGroups(simpleMap, this.view.domainSort);

        for (const [domain, notes] of sortedDomains) {
            this.renderDomainGroup(domainList, domain, notes);
        }
    }

    /**
     * Render a single domain group (expandable)
     */
    private renderDomainGroup(container: HTMLElement, domain: string, notes: RecentNoteWithUrl[]): void {
        const domainDetails = container.createEl('details', { cls: 'web-sidecar-domain-group' });

        // State persistence
        const groupId = `domain:${domain}`;
        if (this.view.expandedGroupIds.has(groupId)) {
            domainDetails.setAttribute('open', '');
        }
        domainDetails.addEventListener('toggle', () => {
            this.view.setGroupExpanded(groupId, domainDetails.hasAttribute('open'));
        });

        const domainSummary = domainDetails.createEl('summary', { cls: 'web-sidecar-domain-row' });

        // Context menu on right-click
        domainSummary.addEventListener('contextmenu', (e) => this.contextMenus.showDomainContextMenu(e, domain));

        // Favicon
        const faviconContainer = domainSummary.createDiv({ cls: 'web-sidecar-domain-favicon' });

        // Skip favicon for internal "domains"
        const isInternal = domain === 'about' || domain === 'chrome' || domain === 'obsidian';

        if (!isInternal) {
            const favicon = faviconContainer.createEl('img', {
                attr: {
                    src: getFaviconUrl(domain, 32),
                    alt: '',
                    width: '14',
                    height: '14'
                }
            });
            favicon.onerror = () => {
                faviconContainer.empty();
                setIcon(faviconContainer, 'globe');
            };
        } else {
            setIcon(faviconContainer, 'globe');
        }

        // Domain name
        domainSummary.createSpan({ text: domain, cls: 'web-sidecar-domain-name' });

        // Link icon to open domain homepage (to the left of count)
        const linkBtn = domainSummary.createEl('button', {
            cls: 'web-sidecar-group-link-btn clickable-icon',
            attr: { 'aria-label': `Open ${domain}` }
        });
        setIcon(linkBtn, 'external-link');
        linkBtn.onclick = async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const domainUrl = `https://${domain}`;
            await this.view.openUrlSmartly(domainUrl, e);
        };

        // Note count badge
        domainSummary.createSpan({
            text: notes.length.toString(),
            cls: 'web-sidecar-domain-count',
            attr: {
                'title': notes.length === 1 ? '1 Note' : `${notes.length} Notes`
            }
        });

        // Notes list
        const notesList = domainDetails.createEl('ul', { cls: 'web-sidecar-list web-sidecar-domain-notes' });
        for (const note of notes) {
            this.noteRenderer.renderNoteItem(notesList, note.file, note.url, false, false);
        }
    }
}
