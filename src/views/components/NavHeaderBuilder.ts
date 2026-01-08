import { setIcon, Notice } from 'obsidian';
import type { IWebSidecarView, AppWithCommands, ObsidianCommand } from '../../types';

/**
 * Builds and manages the navigation header toolbar for the sidecar view.
 */
export class NavHeaderBuilder {
    private view: IWebSidecarView;
    private containerEl: HTMLElement;
    private sortBtn: HTMLElement | null = null;

    constructor(view: IWebSidecarView, containerEl: HTMLElement) {
        this.view = view;
        this.containerEl = containerEl;
    }

    /**
     * Create navigation header with action buttons as its own row.
     * Structure: nav-header > nav-buttons-container > nav-action-button
     * nav-header is SIBLING of contentEl (view-content), not a child.
     */
    create(contentEl: HTMLElement): void {
        if (!contentEl) return;

        // Check if our nav-header already exists
        let navHeader = this.containerEl.querySelector(':scope > .nav-header.web-sidecar-toolbar') as HTMLElement;

        const settings = this.view.settings;
        const allExpanded = this.view.expandedGroupIds.size > 0; // Approximation

        // Ensure button state is synced even if header exists
        if (navHeader) {
            const expandBtn = navHeader.querySelector('.nav-action-button[aria-label="Expand all"], .nav-action-button[aria-label="Collapse all"]') as HTMLElement;
            if (expandBtn) {
                setIcon(expandBtn, allExpanded ? 'fold-vertical' : 'unfold-vertical');
                expandBtn.setAttribute('aria-label', allExpanded ? 'Collapse all' : 'Expand all');
            }
            return;
        }

        // Create nav-header
        navHeader = this.containerEl.createDiv({ cls: 'nav-header web-sidecar-toolbar', prepend: true });
        const buttonContainer = navHeader.createDiv({ cls: 'nav-buttons-container' });

        // New Web Viewer button (leftmost)
        const newViewerBtn = buttonContainer.createEl('div', {
            cls: 'clickable-icon nav-action-button',
            attr: { 'aria-label': 'New web viewer' }
        });
        setIcon(newViewerBtn, 'plus');
        newViewerBtn.onclick = () => void this.view.openNewWebViewer();

        // Expand/Collapse button
        const expandBtn = buttonContainer.createEl('div', {
            cls: 'clickable-icon nav-action-button',
            attr: { 'aria-label': allExpanded ? 'Collapse all' : 'Expand all' }
        });
        setIcon(expandBtn, allExpanded ? 'fold-vertical' : 'unfold-vertical');
        expandBtn.onclick = () => this.handleExpandToggle(expandBtn);

        // Sort button - cycles through: focus -> title -> manual -> focus
        this.sortBtn = buttonContainer.createEl('div', {
            cls: 'clickable-icon nav-action-button',
            attr: { 'aria-label': this.getNextSortLabel(settings.tabSortOrder) }
        });
        setIcon(this.sortBtn, this.getSortIcon(settings.tabSortOrder));
        this.sortBtn.onclick = async () => {
            this.view.setManualRefresh(true);
            const newOrder = this.getNextSortOrder(settings.tabSortOrder);
            settings.tabSortOrder = newOrder;

            // ALWAYS capture current visual order when entering manual mode
            if (newOrder === 'manual') {
                settings.manualTabOrder = this.view.trackedTabs.map(t => t.leafId);
            }

            this.updateSortButtonIcon();
            await this.view.saveSettingsFn();
        };

        // History button (activates "Web Viewer: Show history")
        const historyBtn = buttonContainer.createEl('div', {
            cls: 'clickable-icon nav-action-button',
            attr: { 'aria-label': 'Show history' }
        });
        setIcon(historyBtn, 'clock');
        historyBtn.onclick = () => this.executeCommand('show history', 'web viewer: show history');

        // Search button (activates "Web Viewer: Search the web")
        const searchBtn = buttonContainer.createEl('div', {
            cls: 'clickable-icon nav-action-button',
            attr: { 'aria-label': 'Search the web' }
        });
        setIcon(searchBtn, 'search');
        searchBtn.onclick = () => this.executeCommand('search the web', 'web viewer: search the web');

        // Refresh button
        const refreshBtn = buttonContainer.createEl('div', {
            cls: 'clickable-icon nav-action-button',
            attr: { 'aria-label': 'Refresh' }
        });
        setIcon(refreshBtn, 'refresh-cw');
        refreshBtn.onclick = () => {
            this.view.setManualRefresh(true);
            this.view.onRefresh();
        };

        // Insert nav-header BEFORE contentEl (sibling position)
        this.containerEl.insertBefore(navHeader, contentEl);
    }

    private handleExpandToggle(btn: HTMLElement): void {
        const settings = this.view.settings;
        const view = this.view;
        const expandedIds = view.expandedGroupIds;
        const wasExpanded = expandedIds.size > 0;
        const newState = !wasExpanded;

        // Update button icon
        setIcon(btn, newState ? 'fold-vertical' : 'unfold-vertical');
        btn.setAttribute('aria-label', newState ? 'Collapse all' : 'Expand all');

        // Update state tracking & settings
        view.isRecentNotesOpen = newState;
        settings.isRecentNotesOpen = newState;

        view.isDomainGroupOpen = newState;
        settings.isDomainGroupOpen = newState;

        view.isSubredditExplorerOpen = newState;
        settings.isSubredditExplorerOpen = newState;

        view.isTagGroupOpen = newState;
        settings.isTagGroupOpen = newState;

        view.isSelectedTagGroupOpen = newState;
        settings.isSelectedTagGroupOpen = newState;

        view.isYouTubeChannelExplorerOpen = newState;
        settings.isYouTubeChannelExplorerOpen = newState;

        view.isGithubExplorerOpen = newState;
        settings.isGithubExplorerOpen = newState;

        // Persist changes
        void view.saveSettingsFn();

        // Expand/Collapse global tab state
        if (newState) {
            // 1. Pinned Tabs
            if (settings.pinnedTabs) {
                settings.pinnedTabs.forEach(pin => expandedIds.add(`pin:${pin.id}`));
            }
            // 2. Linked Tabs (keyed by url for dedupe support)
            if (view.trackedTabs) {
                view.trackedTabs.forEach(tab => expandedIds.add(`tab:${tab.url}`));
            }
        } else {
            expandedIds.clear();
        }

        // Force re-render to populate content with new state
        view.setManualRefresh(true);
        view.onRefresh();
    }

    updateSortButtonIcon(): void {
        if (!this.sortBtn) return;
        const settings = this.view.settings;
        setIcon(this.sortBtn, this.getSortIcon(settings.tabSortOrder));
        this.sortBtn.setAttribute('aria-label', this.getNextSortLabel(settings.tabSortOrder));
    }

    private getSortIcon(order: string): string {
        switch (order) {
            case 'focus': return 'clock';
            case 'title': return 'arrow-down-az';
            case 'manual': return 'grip-vertical';
            default: return 'clock';
        }
    }

    private getNextSortLabel(order: string): string {
        switch (order) {
            case 'focus': return 'Sort by title';
            case 'title': return 'Sort manually';
            case 'manual': return 'Sort by recent';
            default: return 'Sort by title';
        }
    }

    private getNextSortOrder(order: string): 'focus' | 'title' | 'manual' {
        switch (order) {
            case 'focus': return 'title';
            case 'title': return 'manual';
            case 'manual': return 'focus';
            default: return 'title';
        }
    }

    private executeCommand(shortName: string, fullName: string): void {
        const app = this.view.app as AppWithCommands;
        if (app.commands) {
            const commands = app.commands.commands;
            const cmdList = Object.values(commands);

            // Try to find the command by short name or full name
            let cmd = cmdList.find((c: ObsidianCommand) => c.name && c.name.toLowerCase() === shortName);
            if (!cmd) {
                cmd = cmdList.find((c: ObsidianCommand) => c.name && c.name.toLowerCase() === fullName);
            }

            // Heuristic fallback for search
            if (!cmd && shortName.includes('search')) {
                cmd = cmdList.find((c: ObsidianCommand) =>
                    c.name && c.name.toLowerCase().includes('search the web') &&
                    (c.id.includes('web-viewer') || c.id.includes('web-browser') || c.id.includes('surfing'))
                );
            }

            if (cmd) {
                app.commands.executeCommandById(cmd.id);
            } else {
                new Notice(`Web Sidecar: Command "${shortName}" not found.`);
            }
        }
    }
}
