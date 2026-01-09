/*
 * Web Sidecar
 * Copyright (c) 2025 soundslikeinfo
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { extractDomain } from '../../../services/urlUtils';
import { getFaviconUrl } from '../../../services/faviconUtils';
import { getLeafId } from '../../../services/obsidianHelpers';
import { findMatchingNotes } from '../../../services/noteMatcher';
import { setIcon, View } from 'obsidian';
import { IWebSidecarView, PinnedTab } from '../../../types';
import { ContextMenus } from '../ContextMenus';
import {
    createNoteLink,
    createNewNoteButton,
    renderTldSection,
    applyStyleModeClass,
    type NoteRowContext
} from './NoteRowBuilder';

export class PinnedTabRenderer {
    private view: IWebSidecarView;
    private contextMenus: ContextMenus;


    constructor(view: IWebSidecarView, contextMenus: ContextMenus) {
        this.view = view;
        this.contextMenus = contextMenus;
    }

    render(container: HTMLElement, pinnedTabs: PinnedTab[], isBasicMode: boolean = false): void {
        // Clean up pinned section if feature is disabled
        if (!this.view.settings.enablePinnedTabs) {
            const existingSection = container.querySelector('.web-sidecar-pinned-section');
            if (existingSection) existingSection.remove();
            return;
        }

        // Pinned tabs container
        let pinnedSection = container.querySelector('.web-sidecar-pinned-section') as HTMLElement;
        if (!pinnedSection) {
            pinnedSection = container.createDiv({ cls: 'web-sidecar-pinned-section' });
            container.prepend(pinnedSection);
        } else if (container.firstChild !== pinnedSection) {
            // Ensure matches top position if existing
            container.prepend(pinnedSection);
        }

        // Empty state: show drop zone for pinning new tabs
        if (pinnedTabs.length === 0) {
            pinnedSection.empty();
            pinnedSection.addClass('is-empty-state');
            pinnedSection.removeClass('web-sidecar-hidden');
        } else {
            pinnedSection.removeClass('is-empty-state');
            pinnedSection.removeClass('web-sidecar-hidden');
        }

        // Drop zone for pinning new tabs
        pinnedSection.ondragover = (e) => {
            if (e.dataTransfer?.types.includes('text/tab-id')) { // Normal tab
                e.preventDefault();
                pinnedSection.addClass('drag-over-area');
            } else if (e.dataTransfer?.types.includes('text/pin-id')) { // Reorder
                e.preventDefault();
            }
        };

        pinnedSection.ondragleave = () => {
            pinnedSection.removeClass('drag-over-area');
        };

        pinnedSection.ondrop = (e) => {
            e.preventDefault();
            pinnedSection.removeClass('drag-over-area');

            // Handle pinning: Normal Tab -> Pinned
            const leafId = e.dataTransfer?.getData('text/tab-id');
            if (leafId) {

                const tabs = this.view.trackedTabs;
                const tab = tabs.find(t => t.leafId === leafId);
                if (tab) {
                    void this.view.pinTab(tab).then(() => {
                        // Force UI update
                        this.view.render(true);
                    });
                }
                return;
            }
        };

        // Reconcile items
        // We use a similar reconciliation strategy to avoid flickering
        const currentElements = new Map<string, HTMLElement>();
        Array.from(pinnedSection.children).forEach((el) => {
            const htmlEl = el as HTMLElement;
            const key = htmlEl.getAttribute('data-pin-id');
            if (key) currentElements.set(key, htmlEl);
        });

        const newKeys = new Set<string>();

        pinnedTabs.forEach((pin, index) => {
            const key = pin.id;
            newKeys.add(key);

            let tabEl = currentElements.get(key);

            if (tabEl) {
                // Update existing
                this.updatePinnedTab(tabEl, pin, isBasicMode);
                pinnedSection.appendChild(tabEl); // Ensure order
            } else {
                // Create new
                this.renderPinnedTab(pinnedSection, pin, isBasicMode);
                // Last element is the new one
                const newEl = pinnedSection.lastElementChild as HTMLElement;
                if (newEl) newEl.setAttribute('data-pin-id', key);
            }
        });

        // Remove old
        for (const [key, el] of currentElements) {
            if (!newKeys.has(key)) {
                el.remove();
            }
        }

        // Divider between pinned and normal tabs
        if (pinnedTabs.length > 0) {
            pinnedSection.addClass('has-divider');
        } else {
            pinnedSection.removeClass('has-divider');
        }
    }

    private renderPinnedTab(container: HTMLElement, pin: PinnedTab, isBasicMode: boolean): void {
        const pinEl = container.createDiv({ cls: 'web-sidecar-pinned-tab clickable' });
        // pinEl.setAttribute('draggable', 'true'); // Handle Dragging


        this.updatePinnedTab(pinEl, pin, isBasicMode);

        // Events persist on wrapper since updatePinnedTab only clears content
        pinEl.addEventListener('click', (e) => {
            void this.handlePinClick(pin, e);
        });

        pinEl.addEventListener('contextmenu', (e) => {
            this.contextMenus.showPinnedTabContextMenu(e, pin);
        });

        this.setupDragEvents(pinEl, pin);
    }

    private updatePinnedTab(el: HTMLElement, pin: PinnedTab, isBasicMode: boolean): void {
        el.empty();

        // Preserve expansion state?
        // We can check if we have a state tracker, or just default closed.
        // Default closed, but could persist in a Set<string> in view
        const isExpanded = this.view.expandedGroupIds.has(`pin:${pin.id}`);

        // Inner Row
        const row = el.createDiv({ cls: 'web-sidecar-pinned-tab-row' });

        // Favicon
        const faviconContainer = row.createDiv({ cls: 'web-sidecar-pinned-favicon' });
        const domain = extractDomain(pin.url);
        if (domain) {
            const favicon = faviconContainer.createEl('img', {
                attr: {
                    src: getFaviconUrl(domain, 32),
                    alt: '',
                    width: '16',
                    height: '16'
                }
            });
            favicon.onerror = () => {
                faviconContainer.empty();
                setIcon(faviconContainer, 'pin');
            };
        } else {
            setIcon(faviconContainer, 'pin');
        }

        // Title
        row.createSpan({ cls: 'web-sidecar-pinned-title', text: pin.title });

        // Tab count badge - query workspace directly since trackedTabs is filtered
        const effectiveUrl = pin.currentUrl || pin.url;
        const allWebLeaves = this.view.app.workspace.getLeavesOfType('webviewer')
            .concat(this.view.app.workspace.getLeavesOfType('surfing-view'));
        const matchingTabCount = allWebLeaves.filter(leaf => {
            const state = leaf.view.getState();
            return state?.url === effectiveUrl;
        }).length;

        if (matchingTabCount > 1) {
            row.createSpan({
                text: `${matchingTabCount}`,
                cls: 'web-sidecar-tab-count-badge',
                attr: {
                    'aria-label': `${matchingTabCount} tabs`
                }
            });
        }

        // Linked Notes Checks
        const matches = findMatchingNotes(this.view.app, pin.url, this.view.settings, this.view.urlIndex);
        const exactCount = matches.exactMatches.length;
        const hasSameDomain = this.view.settings.enableTldSearch && matches.tldMatches.length > 0;
        const hasExpandableContent = exactCount > 0 || hasSameDomain;

        // Note Count Badge (Skip in Basic Mode)
        if (!isBasicMode && exactCount > 0) {
            row.createSpan({
                text: exactCount.toString(),
                cls: 'web-sidecar-note-count-badge',
                attr: {
                    'aria-label': exactCount === 1 ? '1 Note' : `${exactCount} Notes`
                }
            });
        }

        // Inline New Note Button (if no notes) (Skip in Basic Mode)
        if (!isBasicMode && exactCount === 0) {
            const newNoteBtn = row.createDiv({ cls: 'web-sidecar-inline-new-note clickable-icon' });
            setIcon(newNoteBtn, 'file-plus');
            newNoteBtn.setAttribute('aria-label', 'New linked note');
            newNoteBtn.onclick = (e) => {
                e.stopPropagation();
                this.view.openCreateNoteModal(pin.url, pin.leafId);
            };
        }

        // Return to Pinned URL Icon (when navigated away from home URL)
        const isAwayFromHome = !!(pin.currentUrl && pin.currentUrl !== pin.url);
        if (isAwayFromHome && pin.leafId) {
            const returnIcon = row.createSpan({ cls: 'web-sidecar-return-icon clickable-icon' });
            setIcon(returnIcon, 'undo-2');
            returnIcon.setAttribute('aria-label', 'Return to pinned URL');
            returnIcon.onclick = async (e) => {
                e.stopPropagation();
                // Navigate back to the pinned home URL
                const leaf = this.view.app.workspace.getLeafById(pin.leafId!);
                if (leaf) {
                    await leaf.setViewState({
                        type: 'webviewer',
                        state: { url: pin.url, navigate: true }
                    });
                    // Trigger refresh to update UI
                    setTimeout(() => this.view.onRefresh(), 200);
                }
            };
        }

        // Expansion Toggle (Skip in Basic Mode)
        let notesContainer: HTMLElement | null = null;
        if (!isBasicMode && hasExpandableContent) {
            const expandBtn = row.createDiv({ cls: 'web-sidecar-expand-btn clickable-icon' });
            setIcon(expandBtn, isExpanded ? 'chevron-down' : 'chevron-right');

            notesContainer = el.createDiv({ cls: 'web-sidecar-pinned-notes' });
            if (!isExpanded) notesContainer.addClass('hidden');
            else {
                // Render content
                this.renderPinnedNotes(notesContainer, pin.url, matches, pin.leafId);
            }

            expandBtn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                // Toggle state in view
                const wasExpanded = this.view.expandedGroupIds.has(`pin:${pin.id}`);
                const newExpanded = !wasExpanded;
                this.view.setGroupExpanded(`pin:${pin.id}`, newExpanded);

                // Force full UI refresh to ensure state is reflected correctly
                this.view.render(true);
            };
        }

        // Status checks
        // 1. Is it open? (leafId present)
        if (pin.leafId && this.view.app.workspace.getLeafById(pin.leafId)) {
            el.addClass('is-open');
            el.removeClass('is-closed');
        } else {
            el.addClass('is-closed'); // "pinned tabs should look... with italicized titles when closed" CSS
            el.removeClass('is-open');
        }

        // 2. Is it active?
        let activeLeaf = this.view.app.workspace.getActiveViewOfType(View)?.leaf;

        if (activeLeaf === this.view.leaf && this.view.lastActiveLeafId) {
            const fallback = this.view.app.workspace.getLeafById(this.view.lastActiveLeafId);
            if (fallback) activeLeaf = fallback;
        }

        if (pin.leafId && activeLeaf) {
            const activeLeafId = getLeafId(activeLeaf);
            if (activeLeafId && activeLeafId === pin.leafId) {
                el.addClass('is-active');
            }
        }
    }

    private renderPinnedNotes(container: HTMLElement, url: string, matches: import('../../../types').MatchResult, leafId?: string): void {
        const ctx: NoteRowContext = {
            view: this.view,
            contextMenus: this.contextMenus,
            settings: this.view.settings
        };

        // Apply style mode class
        applyStyleModeClass(container, this.view.settings);

        // Check if the associated web viewer is actually open
        const isWebViewerOpen = !!(leafId && this.view.app.workspace.getLeafById(leafId));

        // 1. Exact matches first
        if (matches.exactMatches.length > 0) {
            const exactList = container.createEl('ul', { cls: 'web-sidecar-linked-notes-note-list' });
            for (const match of matches.exactMatches) {
                createNoteLink(exactList, {
                    file: match.file,
                    url: match.url,
                    stopPropagation: true,
                    webViewerOpen: isWebViewerOpen,
                    leafId: leafId // Use leafId from renderer context
                }, ctx);
            }
        }

        // 2. New linked note button
        createNewNoteButton(container, url, leafId, ctx);

        // 3. Same domain notes
        if (this.view.settings.enableTldSearch && matches.tldMatches.length > 0) {
            renderTldSection(container, url, matches, ctx, true, leafId);
        }
    }

    private async handlePinClick(startPin: PinnedTab, e: MouseEvent) {
        // Skip if clicking on expand button or new note button
        if ((e.target as HTMLElement).closest('.web-sidecar-expand-btn')) return;
        if ((e.target as HTMLElement).closest('.web-sidecar-inline-new-note')) return;

        // Re-fetch pin from settings to ensure we have the LATEST leafId
        const freshPin = this.view.settings.pinnedTabs.find((p: PinnedTab) => p.id === startPin.id) || startPin;

        // Check if potential open leaf exists
        const openLeaf = freshPin.leafId ? this.view.app.workspace.getLeafById(freshPin.leafId) : null;

        // Check if this pinned tab is already focused
        let checkLeaf = this.view.app.workspace.getActiveViewOfType(View)?.leaf;
        if (checkLeaf === this.view.leaf && this.view.lastActiveLeafId) {
            const fallback = this.view.app.workspace.getLeafById(this.view.lastActiveLeafId);
            if (fallback) checkLeaf = fallback;
        }
        const isAlreadyFocused = openLeaf && checkLeaf && getLeafId(checkLeaf) === freshPin.leafId;

        // Check if has expandable content (for expand/collapse toggle)
        const matches = findMatchingNotes(this.view.app, freshPin.url, this.view.settings, this.view.urlIndex);
        const exactCount = matches.exactMatches.length;
        const hasSameDomain = this.view.settings.enableTldSearch && matches.tldMatches.length > 0;
        const hasExpandableContent = exactCount > 0 || hasSameDomain;

        // Click behavior for pinned tabs (mirrors open web viewer tabs):
        // - Single tab: first click = focus, subsequent clicks = toggle expand/collapse
        // - Grouped tabs: cycle through instances (expand button handles expand/collapse)

        const effectiveUrl = freshPin.currentUrl || freshPin.url;
        const allWebLeaves = this.view.app.workspace.getLeavesOfType('webviewer')
            .concat(this.view.app.workspace.getLeavesOfType('surfing-view'));

        const matchingLeaves = allWebLeaves.filter(leaf => {
            const state = leaf.view.getState();
            return state?.url === effectiveUrl;
        });

        const matchingCount = matchingLeaves.length;

        if (matchingCount > 1) {
            // Grouped tabs behavior: Cycle
            this.view.focusNextWebViewerInstance(effectiveUrl);
            return;
        }

        if (isAlreadyFocused && hasExpandableContent) {
            // Already focused - toggle expand/collapse
            const key = `pin:${freshPin.id}`;
            const newState = !this.view.expandedGroupIds.has(key);
            this.view.setGroupExpanded(key, newState);
            this.view.render(true);
            return;
        }

        if (openLeaf) {
            // Open but not focused - focus it
            setTimeout(() => {
                this.view.app.workspace.setActiveLeaf(openLeaf, { focus: true });
            }, 50);
        } else {
            // Closed - open new web viewer, respecting preferWebViewerLeft setting
            const leaf = this.view.settings.preferWebViewerLeft
                ? this.view.getOrCreateWebViewerLeaf()
                : this.view.app.workspace.getLeaf('tab');
            const urlToOpen = freshPin.currentUrl || freshPin.url;

            await leaf.setViewState({
                type: 'webviewer',
                state: { url: urlToOpen, navigate: true }
            });
            await this.view.app.workspace.revealLeaf(leaf);

            // Explicitly link the new Leaf ID to this Pin immediately
            const leafId = getLeafId(leaf);
            if (leafId && this.view.tabStateService) {
                await this.view.tabStateService.setPinnedTabLeaf(freshPin.id, leafId);
            }

            // Force UI refresh to show the pin is now open
            this.view.render(true);
            setTimeout(() => this.view.render(true), 150);
            setTimeout(() => this.view.render(true), 400);
        }
    }

    private setupDragEvents(el: HTMLElement, pin: PinnedTab) {
        el.setAttribute('draggable', 'true');

        el.addEventListener('dragstart', (e) => {
            e.dataTransfer?.setData('text/pin-id', pin.id);
            e.dataTransfer?.setData('text/plain', pin.url);
            el.addClass('is-dragging');
        });

        el.addEventListener('dragend', () => {
            el.removeClass('is-dragging');
        });

        // Drop target for reordering
        el.addEventListener('dragover', (e) => {
            if (e.dataTransfer?.types.includes('text/pin-id')) {
                e.preventDefault();
                el.addClass('drag-over');
            }
        });

        el.addEventListener('dragleave', () => {
            el.removeClass('drag-over');
        });

        el.addEventListener('drop', (e) => {
            e.preventDefault();
            el.removeClass('drag-over');
            const droppedPinId = e.dataTransfer?.getData('text/pin-id');

            if (droppedPinId && droppedPinId !== pin.id) {
                // Reorder
                void this.view.reorderPinnedTabs(droppedPinId, pin.id);
            }
        });
    }
}
