
import { setIcon } from 'obsidian';
import { IWebSidecarView, TrackedWebViewer, VirtualTab } from '../../../types';
import { findMatchingNotes } from '../../../services/noteMatcher';
import { ContextMenus } from '../ContextMenus';
import { NoteRenderer } from '../NoteRenderer';
import { SectionRenderer } from '../SectionRenderer';
import { BrowserTabItemRenderer } from './BrowserTabItemRenderer';

export class BrowserTabRenderer {
    private view: IWebSidecarView;
    private sectionRenderer: SectionRenderer;
    private itemRenderer: BrowserTabItemRenderer;

    constructor(
        view: IWebSidecarView,
        contextMenus: ContextMenus,
        noteRenderer: NoteRenderer,
        sectionRenderer: SectionRenderer
    ) {
        this.view = view;
        this.sectionRenderer = sectionRenderer;
        this.itemRenderer = new BrowserTabItemRenderer(view, contextMenus);
    }

    /**
     * Render browser-style tab list with favicon + title (compact mode)
     */
    renderBrowserModeTabList(container: HTMLElement, trackedTabs: TrackedWebViewer[], virtualTabs: VirtualTab[]): void {
        // Remove any legacy inline header if it exists (nav-header is now in WebSidecarView)
        const legacyHeader = container.querySelector('.web-sidecar-browser-header');
        if (legacyHeader) {
            legacyHeader.remove();
        }

        // Tab list container - reuse if exists
        let tabListContainer = container.querySelector('.web-sidecar-browser-tabs') as HTMLElement;
        if (!tabListContainer) {
            tabListContainer = container.createDiv({ cls: 'web-sidecar-browser-tabs' });
        }

        // --- RECONCILIATION LOGIC ---
        // Normalize groups to { primary: TrackedWebViewer, all?: TrackedWebViewer[] }
        let groups: { primary: TrackedWebViewer; all?: TrackedWebViewer[] }[];

        if (this.view.settings.collapseDuplicateUrls) {
            groups = this.getGroupedTabs(trackedTabs);
        } else {
            groups = trackedTabs.map(t => ({ primary: t }));
        }

        // Reconciliation: Map existing grouped or single tab elements
        // Groups key: "group:<url>", Single key: "leaf:<leafId>"
        const currentElements = new Map<string, HTMLElement>();
        Array.from(tabListContainer.children).forEach((el) => {
            const htmlEl = el as HTMLElement;
            const key = htmlEl.getAttribute('data-tab-key');
            if (key) currentElements.set(key, htmlEl);
        });

        const newKeys = new Set<string>();

        // Render each group
        for (const group of groups) {
            const firstTab = group.primary;
            // Determine key
            const key = this.view.settings.collapseDuplicateUrls
                ? `group:${firstTab.url}`
                : `leaf:${firstTab.leafId}`;

            newKeys.add(key);

            let tabEl = currentElements.get(key);

            if (tabEl) {
                // UPDATE existing element in place
                this.itemRenderer.updateBrowserTab(tabEl, firstTab, group.all);
                // Ensure correct order in DOM
                tabListContainer.appendChild(tabEl);
            } else {
                // CREATE new element
                this.itemRenderer.renderBrowserTab(tabListContainer, firstTab, group.all);
                // The render function appends it, but we need to set the key
                const newEl = tabListContainer.lastElementChild as HTMLElement;
                if (newEl) newEl.setAttribute('data-tab-key', key);
            }
        }

        // Remove old elements not in new set
        for (const [key, el] of currentElements) {
            if (!newKeys.has(key)) {
                el.remove();
            }
        }

        // Add end-of-list drop zone for tabs (allows dragging tabs to last position)
        this.addTabEndDropZone(tabListContainer);

        // --- CRITICAL DOM ORDER ---
        // Order MUST be: 1) Tab list, 2) New web viewer button, 3) Virtual tabs section, 4) Recent section
        // This order is enforced by explicit insertBefore calls below.

        // "+ New web viewer" button - MUST appear immediately AFTER web viewer tabs, BEFORE virtual section
        let newTabBtn = container.querySelector('.web-sidecar-new-tab-btn') as HTMLElement;
        if (!newTabBtn) {
            newTabBtn = document.createElement('div');
            newTabBtn.className = 'web-sidecar-new-tab-btn';
            const plusIcon = newTabBtn.createSpan({ cls: 'web-sidecar-new-tab-icon' });
            setIcon(plusIcon, 'plus');
            newTabBtn.createSpan({ text: 'New web viewer', cls: 'web-sidecar-new-tab-text' });
            newTabBtn.addEventListener('click', () => this.view.openNewWebViewer());
        }
        // Insert button right after tabListContainer
        if (tabListContainer.nextSibling !== newTabBtn) {
            tabListContainer.after(newTabBtn);
        }

        // Render virtual tabs (from open notes with URLs) in browser style
        // Virtual section MUST come AFTER the New web viewer button
        // Uses DOM reconciliation to preserve expanded state
        let virtualSection = container.querySelector('.web-sidecar-virtual-section') as HTMLElement;
        if (virtualTabs.length > 0) {
            if (!virtualSection) {
                virtualSection = document.createElement('div');
                virtualSection.className = 'web-sidecar-virtual-section';
            }

            // Ensure header exists
            let header = virtualSection.querySelector('.web-sidecar-section-title');
            if (!header) {
                header = virtualSection.createEl('h5', { text: 'Opened web notes', cls: 'web-sidecar-section-title' });
                virtualSection.prepend(header);
            }

            // DOM reconciliation for virtual tabs - preserve expanded state
            const currentElements = new Map<string, HTMLElement>();
            virtualSection.querySelectorAll(':scope > .web-sidecar-browser-tab').forEach((el) => {
                const htmlEl = el as HTMLElement;
                const key = htmlEl.getAttribute('data-virtual-key');
                if (key) currentElements.set(key, htmlEl);
            });

            const newKeys = new Set<string>();

            // Get current focus state for updating existing tabs
            let activeLeaf = this.view.app.workspace.activeLeaf;
            if (activeLeaf === this.view.leaf && this.view.lastActiveLeaf) {
                activeLeaf = this.view.lastActiveLeaf;
            }
            let focusedNotePath: string | null = null;
            if (activeLeaf?.view?.getViewType() === 'markdown') {
                const view = activeLeaf.view as any;
                if (view.file) {
                    focusedNotePath = view.file.path;
                }
            }

            for (const virtualTab of virtualTabs) {
                const key = `virtual:${virtualTab.url}`;
                newKeys.add(key);

                let tabEl = currentElements.get(key);
                if (tabEl) {
                    // UPDATE existing - preserve expanded state
                    virtualSection.appendChild(tabEl); // Maintain order

                    // Get notes container and expand button
                    const notesContainer = tabEl.querySelector('.web-sidecar-browser-notes') as HTMLElement;
                    const expandBtn = tabEl.querySelector('.web-sidecar-expand-btn') as HTMLElement;

                    // Check if focused note is linked to this virtual tab
                    const matches = findMatchingNotes(this.view.app, virtualTab.url, this.view.settings, this.view.urlIndex);
                    const isLinkedNoteFocused = focusedNotePath &&
                        matches.exactMatches.some(m => m.file.path === focusedNotePath);

                    // Apply muted active state to virtual tab
                    if (isLinkedNoteFocused) {
                        tabEl.addClass('is-active');
                    } else {
                        tabEl.removeClass('is-active');
                    }

                    if (notesContainer && expandBtn) {
                        // Auto-expand if linked note is focused
                        if (isLinkedNoteFocused && notesContainer.hasClass('hidden')) {
                            notesContainer.removeClass('hidden');
                            expandBtn.empty();
                            setIcon(expandBtn, 'chevron-down');

                            // Populate notes if empty
                            if (notesContainer.children.length === 0) {
                                this.itemRenderer.renderBrowserTabNotes(notesContainer, virtualTab.url, matches);
                            }
                        }

                        // Update focus state on notes
                        if (!notesContainer.hasClass('hidden')) {
                            this.itemRenderer.updateNoteFocusState(notesContainer, focusedNotePath);
                        }
                    }
                } else {
                    // CREATE new virtual tab
                    this.itemRenderer.renderVirtualTab(virtualSection, virtualTab);
                    const newEl = virtualSection.lastElementChild as HTMLElement;
                    if (newEl) newEl.setAttribute('data-virtual-key', key);
                }
            }

            // Remove stale virtual tabs
            for (const [key, el] of currentElements) {
                if (!newKeys.has(key)) {
                    el.remove();
                }
            }

            // Insert virtual section right after newTabBtn
            if (newTabBtn.nextSibling !== virtualSection) {
                newTabBtn.after(virtualSection);
            }
        } else if (virtualSection) {
            virtualSection.remove(); // Remove section if no virtual tabs
        }

        // Auxiliary sections (Recent, Domain, Subreddit) - rendered in user-configured order
        this.sectionRenderer.renderAuxiliarySections(container);
    }

    private getGroupedTabs(tabs: TrackedWebViewer[]): Array<{ primary: TrackedWebViewer; all: TrackedWebViewer[]; hasPopout: boolean }> {
        const groups = new Map<string, TrackedWebViewer[]>();

        for (const tab of tabs) {
            const existing = groups.get(tab.url) || [];
            existing.push(tab);
            groups.set(tab.url, existing);
        }

        return Array.from(groups.values())
            .filter(tabs => tabs.length > 0)
            .map(tabs => ({
                primary: tabs[0]!,
                all: tabs,
                hasPopout: tabs.some(t => t.isPopout),
            }));
    }

    /**
     * Add an end-of-list drop zone for tabs (allows dragging tabs to last position)
     */
    private addTabEndDropZone(container: HTMLElement): void {
        // Check if already exists
        let dropZone = container.querySelector('.web-sidecar-tab-drop-zone-end') as HTMLElement;
        if (!dropZone) {
            dropZone = container.createDiv({ cls: 'web-sidecar-tab-drop-zone-end' });
        }

        // Ensure drop zone is at the end of the container
        container.appendChild(dropZone);

        dropZone.ondragover = (e) => {
            // Only accept tab drags (check for our custom MIME type)
            if (e.dataTransfer?.types?.includes('text/tab-id')) {
                e.preventDefault();
                dropZone!.addClass('drag-over');
            }
        };

        dropZone.ondragleave = () => {
            dropZone!.removeClass('drag-over');
        };

        dropZone.ondrop = (e) => {
            e.preventDefault();
            dropZone!.removeClass('drag-over');
            const draggedLeafId = e.dataTransfer?.getData('text/tab-id');

            if (draggedLeafId) {
                // Move tab to end by getting current order
                let currentOrder = [...this.view.settings.manualTabOrder];
                if (currentOrder.length === 0) {
                    // Get all current tab leaf IDs
                    const allTabs = container.querySelectorAll('[data-leaf-id]');
                    currentOrder = Array.from(allTabs).map(el => el.getAttribute('data-leaf-id')!).filter(Boolean);
                }

                // Remove dragged item and add to end
                const draggedIdx = currentOrder.indexOf(draggedLeafId);
                if (draggedIdx > -1) {
                    currentOrder.splice(draggedIdx, 1);
                }
                currentOrder.push(draggedLeafId);

                // Switch to manual mode if needed
                if (this.view.settings.tabSortOrder !== 'manual') {
                    this.view.settings.tabSortOrder = 'manual';
                }

                this.view.settings.manualTabOrder = currentOrder;
                this.view.setManualRefresh(true);
                this.view.saveSettingsFn(); // Persist changes
                this.view.onRefresh();
            }
        };
    }
}
