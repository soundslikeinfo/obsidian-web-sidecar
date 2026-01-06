
import { extractDomain } from '../../../services/urlUtils';
import { findMatchingNotes, extractSubreddit } from '../../../services/noteMatcher';
import { NoteRenderer } from '../NoteRenderer';
import { setIcon, Menu } from 'obsidian';
import { IWebSidecarView, PinnedTab } from '../../../types';
import { ContextMenus } from '../ContextMenus';

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

        // Hide if no pins and we don't want to show an empty drop zone (User said default empty is fine, but dragged item should allow pin)
        // Actually, "if there are no pins established yet, don't allow a pin to drag." -> so we hide it completely if empty.
        if (pinnedTabs.length === 0) {
            pinnedSection.empty();
            // We must keep it visible (but perhaps zero height with padding?) to allow dropping
            // But if it has 0 height, we can't drop.
            // Let's give it a specialized class for empty state
            pinnedSection.addClass('is-empty-state');
            pinnedSection.style.display = 'block';
            // We don't return here, we let it setup drag events.
        } else {
            pinnedSection.removeClass('is-empty-state');
            pinnedSection.style.display = 'block';
        }

        // Render Drop Zone for Reordering at the top? No, individual items act as drop targets usually.



        // Drop Zone on Main Section (for pinning new tabs by dropping onto the Pinned Area)
        // Requirement: "drag a normal web tab to the pinned tab area should make it a pinned tab"
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

            // Check for Pinning (Normal Tab -> Pinned)
            const leafId = e.dataTransfer?.getData('text/tab-id');
            if (leafId) {
                // Find the tab in view.trackedTabs (since we don't hold state here)
                // Or better, let view handle lookup.
                // We don't have direct access to trackedTabs array here unless we add it to constructor or view interface exposes it.
                // But wait, TrackedWebViewer has leafId.
                // Let's assume view has a method `getTrackedTabById` or we can just access the public method if we add one.
                // Actually IWebSidecarView doesn't expose trackedTabs getter.
                // I'll cast view to any or add method.
                // Better: add `view.pinTabById(leafId)`? 
                // But `pinTab` takes full object.
                // I'll grab it from app workspace leaves? No, trackedTabs has cached title etc.
                // I'll use `app.workspace.getLeafById(leafId)` and convert to shim?

                // Simplest: Iterate `view.tabStateService.getTrackedTabs()` !
                // But view.tabStateService is private? No, generic `IWebSidecarView` interface doesn't have it.
                // But I'm in the class that imports `WebSidecarView` effectively or types.
                // Hack: access `(this.view as any).trackedTabs`.

                const tabs = (this.view as any).trackedTabs as any[]; // quick fix
                const tab = tabs.find(t => t.leafId === leafId);
                if (tab) {
                    this.view.pinTab(tab).then(() => {
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

        // Render Divider ONLY if pins exist
        if (pinnedTabs.length > 0) {
            // Check if divider exists in the PARENT container, right after this section?
            // Actually, best to put it INSIDE this section at the bottom, or handle it in parent.
            // Requirement: "see a line divider between the pinned web view tabs and the normal web view tabs"
            // Let's add it as a class style border-bottom on the section, simpler.
            pinnedSection.addClass('has-divider');
        } else {
            pinnedSection.removeClass('has-divider');
        }
    }

    private renderPinnedTab(container: HTMLElement, pin: PinnedTab, isBasicMode: boolean): void {
        const pinEl = container.createDiv({ cls: 'web-sidecar-pinned-tab clickable' });
        // pinEl.setAttribute('draggable', 'true'); // Handle Dragging


        this.updatePinnedTab(pinEl, pin, isBasicMode);

        // Re-apply events (updatePinnedTab clears content but not element)
        // Actually updatePinnedTab empties the element! So we need to re-bind events?
        // No, 'updatePinnedTab' empties 'el', which is 'pinEl'.
        // So we MUST re-bind events or move event binding inside updatePinnedTab or prevent emptying.
        // Let's modify updatePinnedTab to NOT empty, but update via reconciliation?
        // Or just let updatePinnedTab handle content and we handle events on wrapper once?
        // Drag events on wrapper persist. Click events on wrapper persist. Correct.

        pinEl.addEventListener('click', (e) => {
            // Check if user clicked on context menu trigger or something else if we add buttons
            this.handlePinClick(pin, e);
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
        // For now default closed, but ideally we persists it in a Set<string> in view.
        const isExpanded = this.view.expandedGroupIds.has(`pin:${pin.id}`);

        // Inner Row
        const row = el.createDiv({ cls: 'web-sidecar-pinned-tab-row' });

        // Favicon
        const faviconContainer = row.createDiv({ cls: 'web-sidecar-pinned-favicon' });
        const domain = extractDomain(pin.url);
        if (domain) {
            const favicon = faviconContainer.createEl('img', {
                attr: {
                    src: `https://www.google.com/s2/favicons?domain=${domain}&sz=32`,
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
        const titleEl = row.createSpan({ cls: 'web-sidecar-pinned-title', text: pin.title });

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
        const activeLeaf = this.view.app.workspace.activeLeaf;
        if (pin.leafId && activeLeaf && (activeLeaf as any).id === pin.leafId) {
            el.addClass('is-active');
        }
    }

    private renderPinnedNotes(container: HTMLElement, url: string, matches: import('../../../types').MatchResult, leafId?: string): void {
        // Add style-mode class if using 'style' option (for italic closed notes)
        if (this.view.settings.linkedNoteDisplayStyle === 'style') {
            container.addClass('style-mode');
        } else {
            container.removeClass('style-mode');
        }

        // 1. Exact matches first
        if (matches.exactMatches.length > 0) {
            const exactList = container.createEl('ul', { cls: 'web-sidecar-browser-note-list' });
            for (const match of matches.exactMatches) {
                const li = exactList.createEl('li');
                // Store path for focus tracking
                li.setAttribute('data-note-path', match.file.path);

                // Check if this note is the currently focused leaf
                let activeLeaf = this.view.app.workspace.activeLeaf;
                if (activeLeaf === this.view.leaf && this.view.lastActiveLeaf) {
                    activeLeaf = this.view.lastActiveLeaf;
                }
                const isNoteFocused = activeLeaf?.view?.getViewType() === 'markdown'
                    && (activeLeaf.view as any)?.file?.path === match.file.path;

                if (isNoteFocused) {
                    li.addClass('is-focused');
                }

                // Check if note is open anywhere in workspace (for open/closed styling)
                if (this.view.settings.linkedNoteDisplayStyle !== 'none') {
                    let isOpen = false;
                    this.view.app.workspace.iterateAllLeaves((leaf) => {
                        if ((leaf.view as any).file?.path === match.file.path) {
                            isOpen = true;
                        }
                    });
                    li.addClass(isOpen ? 'is-open' : 'is-closed');
                }

                const link = li.createEl('a', {
                    text: match.file.basename,
                    cls: 'web-sidecar-browser-note-link',
                    attr: { href: '#' }
                });

                link.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation(); // Prevent bubbling to pinned tab wrapper
                    this.view.openNoteSmartly(match.file, e);
                });

                link.addEventListener('contextmenu', (e) => {
                    e.stopPropagation(); // FIX: Prevent bubbling to pinned tab container (double menu)
                    this.contextMenus.showNoteContextMenu(e, match.file, match.url);
                });
            }
        }

        // 2. New linked note button
        const newNoteBtn = container.createDiv({ cls: 'web-sidecar-new-note-btn' });
        const noteIcon = newNoteBtn.createSpan({ cls: 'web-sidecar-new-note-icon' });
        setIcon(noteIcon, 'file-plus');
        newNoteBtn.createSpan({ text: 'New linked note', cls: 'web-sidecar-new-note-text' });
        newNoteBtn.onclick = (e) => {
            e.stopPropagation();
            this.view.openCreateNoteModal(url, leafId);
        };

        // 3. Same domain notes
        if (this.view.settings.enableTldSearch && matches.tldMatches.length > 0) {
            const domain = extractDomain(url);
            let headerText = `More web notes (${domain || 'this domain'})`;
            if (this.view.settings.enableSubredditFilter) {
                const subreddit = extractSubreddit(url);
                if (subreddit) {
                    headerText = `More web notes (${subreddit})`;
                }
            }

            const details = container.createEl('details', { cls: 'web-sidecar-tld-section' });
            const summary = details.createEl('summary', { cls: 'web-sidecar-browser-subtitle' });
            summary.createSpan({ text: headerText });
            summary.onclick = (e) => e.stopPropagation(); // prevent collapsing parent? No, summary usually handles itself.

            const domainList = details.createEl('ul', { cls: 'web-sidecar-browser-note-list' });
            for (const match of matches.tldMatches) {
                const li = domainList.createEl('li');

                // Check if note is open anywhere in workspace (for open/closed styling)
                if (this.view.settings.linkedNoteDisplayStyle !== 'none') {
                    let isOpen = false;
                    this.view.app.workspace.iterateAllLeaves((leaf) => {
                        if ((leaf.view as any).file?.path === match.file.path) {
                            isOpen = true;
                        }
                    });
                    li.addClass(isOpen ? 'is-open' : 'is-closed');
                }

                const link = li.createEl('a', {
                    text: match.file.basename,
                    cls: 'web-sidecar-browser-note-link web-sidecar-muted',
                    attr: { href: '#' }
                });
                link.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation(); // Prevent bubbling to pinned tab wrapper
                    this.view.openNoteSmartly(match.file, e);
                });
                link.addEventListener('contextmenu', (e) => {
                    e.stopPropagation();
                    this.contextMenus.showNoteContextMenu(e, match.file, match.url);
                });
            }
        }
    }

    private async handlePinClick(startPin: PinnedTab, e: MouseEvent) {
        // FIX: Re-fetch pin from settings to ensure we have the LATEST leafId.
        // The 'startPin' passed in closure might be stale if a leaf was just created but render loop hasn't fully cycled/updated this specific element's closure yet.
        const freshPin = this.view.settings.pinnedTabs.find(p => p.id === startPin.id) || startPin;

        // 1. Check if potential open leaf exists
        const openLeaf = freshPin.leafId ? this.view.app.workspace.getLeafById(freshPin.leafId) : null;

        if (openLeaf) {
            // Focus it
            this.view.app.workspace.revealLeaf(openLeaf);
        } else {
            // Check if we are already in the process of opening? (Prevent rapid clicks)
            // Ideally we'd have a lock or 'isOpening' state.
            // relying on freshPin.leafId should be enough IF setPinnedTabLeaf is fast enough or synchronous-ish in memory.

            // Open new
            // Open in main tab area
            const leaf = this.view.app.workspace.getLeaf('tab');
            const urlToOpen = freshPin.currentUrl || freshPin.url;

            await leaf.setViewState({
                type: 'webviewer',
                state: { url: urlToOpen, navigate: true }
            });
            this.view.app.workspace.revealLeaf(leaf);

            // The StateService will detect this new leaf and link it to the pin via URL matching
            // We might need to manually link it if URL is same but we want explicit ownership?
            // But existing logic relies on URL matching.

            // FIX: Explicitly link the new Leaf ID to this Pin immediately.
            // This ensures that even if the page redirects immediately (changing URL),
            // the service knows this leaf belongs to this pin.
            const leafId = (leaf as any).id;
            if (leafId && 'setPinnedTabLeaf' in (this.view as any).tabStateService) {
                await (this.view as any).tabStateService.setPinnedTabLeaf(freshPin.id, leafId);
            }
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
                this.view.reorderPinnedTabs(droppedPinId, pin.id);
            }
        });
    }
}
