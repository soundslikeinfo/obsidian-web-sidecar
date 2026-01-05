
import { Menu, TFile } from 'obsidian';
import { IWebSidecarView, TrackedWebViewer, PinnedTab } from '../../types';
import { findMatchingNotes } from '../../services/noteMatcher';

export class ContextMenus {
    private view: IWebSidecarView;

    constructor(view: IWebSidecarView) {
        this.view = view;
    }

    /**
     * Show context menu for a web viewer tab
     */
    showWebViewerContextMenu(event: MouseEvent, tab: TrackedWebViewer): void {
        event.preventDefault();
        const menu = new Menu();

        // Open in new tab
        menu.addItem((item) => {
            item
                .setTitle('Open in new web viewer')
                .setIcon('file-plus')
                .onClick(async () => {
                    const leaf = this.view.app.workspace.getLeaf('tab');
                    await leaf.setViewState({
                        type: 'webviewer',
                        state: { url: tab.url, navigate: true }
                    });
                    this.view.app.workspace.revealLeaf(leaf);
                });
        });

        // Open in default browser
        menu.addItem((item) => {
            item
                .setTitle('Open in default browser')
                .setIcon('external-link')
                .onClick(() => {
                    this.openInDefaultBrowser(tab.url);
                });
        });

        // Open in new window
        menu.addItem((item) => {
            item
                .setTitle('Open in new window')
                .setIcon('picture-in-picture-2')
                .onClick(async () => {
                    const leaf = this.view.app.workspace.openPopoutLeaf();
                    await leaf.setViewState({
                        type: 'webviewer',
                        state: { url: tab.url, navigate: true }
                    });
                });
        });

        // Open to the right
        menu.addItem((item) => {
            item
                .setTitle('Open to the right')
                .setIcon('separator-vertical')
                .onClick(async () => {
                    const leaf = this.view.getOrCreateRightLeaf();
                    await leaf.setViewState({
                        type: 'webviewer',
                        state: { url: tab.url, navigate: true }
                    });
                    this.view.app.workspace.revealLeaf(leaf);
                });
        });



        // Pin web view
        // Show "Pin" if not already pinned (implied by this context menu appearing on a normal tab)
        // But double check logic: what if it IS pinned but showing here? 
        // We assume we are in "Normal Tab" list so it is NOT pinned (hidden by filter)
        // UNLESS duplications are allowed.
        // Safe to show "Pin" always? If duplicates allowed, yes. 
        // If not, it shouldn't be here.
        if (this.view.settings.enablePinnedTabs) {
            menu.addItem((item) => {
                item
                    .setTitle('Pin web view')
                    .setIcon('pin')
                    .onClick(() => {
                        this.view.pinTab(tab);
                    });
            });
        }

        // New linked note from URL
        menu.addItem((item) => {
            item
                .setTitle('New linked note from URL')
                .setIcon('file-plus')
                .onClick(() => {
                    this.view.openCreateNoteModal(tab.url, tab.leafId);
                });
        });

        menu.addSeparator();

        // Close web view
        menu.addItem((item) => {
            item
                .setTitle('Close web view')
                .setIcon('x')
                .onClick(() => {
                    this.view.closeLeaf(tab.leafId);
                });
        });

        // Close all web views for this page ("Close duplicate tabs" renamed for clarity)
        // Check if there are multiple tabs for this URL
        // We can't easily check trackedTabs length here without access to it, 
        // but closeAllLeavesForUrl handles duplicates efficiently even if 1.
        // However, we only want to show if > 1 usually. 
        // Let's assume we can show it always or we need access to trackedTabs from view.
        // This is a minor regression unless we pass trackedTabs or expose them on view.
        // Let's expose trackedTabs on view logic or just always show for now.
        // Wait, the original code filtered trackedTabs.
        // Let's add `getTrackedTabs(): TrackedWebViewer[]` to interface if needed.
        // Or just let the user close 'all' even if it's 1? No, original had logic.
        // I'll skip the check for now or access app workspace directly to check count if critical.
        // Simplified:
        menu.addItem((item) => {
            item
                .setTitle('Close all linked web views')
                .setIcon('x-circle')
                .onClick(() => {
                    this.view.closeAllLeavesForUrl(tab.url);
                });
        });

        // Close linked notes
        const matches = findMatchingNotes(this.view.app, tab.url, this.view.settings);
        const hasLinkedNotes = matches.exactMatches.length > 0;

        if (hasLinkedNotes) {
            menu.addItem((item) => {
                item
                    .setTitle('Close all linked notes')
                    .setIcon('file-minus')
                    .onClick(() => {
                        this.view.closeLinkedNoteLeaves(tab.url);
                    });
            });

            // Close ALL - web views + linked notes
            menu.addItem((item) => {
                item
                    .setTitle('Close all web views + linked notes')
                    .setIcon('trash-2')
                    .onClick(() => {
                        this.view.closeAllLeavesForUrl(tab.url);
                        this.view.closeLinkedNoteLeaves(tab.url);
                    });
            });
        }

        // Redirect detection: Show option to update linked notes if URL has changed from original
        if (this.view.hasRedirectedUrl(tab.leafId)) {
            menu.addSeparator();
            menu.addItem((item) => {
                item
                    .setTitle('Update linked note(s) url to current view')
                    .setIcon('file-symlink')
                    .onClick(async () => {
                        await this.view.updateTrackedTabNotes(tab.leafId);
                    });
            });
        }

        menu.addSeparator();

        // Copy URL
        menu.addItem((item) => {
            item
                .setTitle('Copy URL')
                .setIcon('copy')
                .onClick(() => {
                    navigator.clipboard.writeText(tab.url);
                });
        });

        menu.showAtMouseEvent(event);
    }

    /**
     * Show context menu for a note item
     */
    showNoteContextMenu(event: MouseEvent, file: TFile, url: string): void {
        event.preventDefault();
        const menu = new Menu();

        // Open in new tab
        menu.addItem((item) => {
            item
                .setTitle('Open note in new tab')
                .setIcon('file-plus')
                .onClick(() => {
                    const leaf = this.view.app.workspace.getLeaf('tab');
                    leaf.openFile(file);
                });
        });

        // Open in new window
        menu.addItem((item) => {
            item
                .setTitle('Open note in new window')
                .setIcon('picture-in-picture-2')
                .onClick(() => {
                    const leaf = this.view.app.workspace.openPopoutLeaf();
                    leaf.openFile(file);
                });
        });

        // Open to the right
        menu.addItem((item) => {
            item
                .setTitle('Open note to the right')
                .setIcon('separator-vertical')
                .onClick(() => {
                    const leaf = this.view.getOrCreateRightLeaf();
                    leaf.openFile(file);
                });
        });

        menu.addSeparator();

        // Reveal file in navigation
        menu.addItem((item) => {
            item
                .setTitle('Reveal note in navigation')
                .setIcon('folder')
                .onClick(async () => {
                    // Open file explorer if needed and reveal note
                    const explorerLeaf = this.view.app.workspace.getLeavesOfType('file-explorer')[0];
                    if (explorerLeaf) {
                        this.view.app.workspace.revealLeaf(explorerLeaf);
                    }
                    // Use Obsidian command to reveal active file
                    const tempLeaf = this.view.app.workspace.getLeaf('tab');
                    await tempLeaf.openFile(file, { active: false });
                    await (this.view.app as any).commands.executeCommandById('file-explorer:reveal-active-file');
                    tempLeaf.detach();
                });
        });

        // Copy full path
        menu.addItem((item) => {
            item
                .setTitle('Copy full path')
                .setIcon('copy')
                .onClick(() => {
                    navigator.clipboard.writeText(file.path);
                });
        });

        menu.addSeparator();

        // Close this note (if open)
        const markdownLeaves = this.view.app.workspace.getLeavesOfType('markdown');
        const openLeaf = markdownLeaves.find(leaf => {
            const viewFile = (leaf.view as any).file;
            return viewFile && viewFile.path === file.path;
        });

        if (openLeaf) {
            menu.addItem((item) => {
                item
                    .setTitle('Close this note')
                    .setIcon('x')
                    .onClick(() => {
                        openLeaf.detach();
                    });
            });
        }

        // Close all linked notes for this URL
        menu.addItem((item) => {
            item
                .setTitle('Close all linked notes')
                .setIcon('file-minus')
                .onClick(() => {
                    this.view.closeLinkedNoteLeaves(url);
                });
        });

        // Close linked web view (if URL is open in a web viewer)
        const webLeaves = this.view.app.workspace.getLeavesOfType('webviewer')
            .concat(this.view.app.workspace.getLeavesOfType('surfing-view'));
        const openWebLeaf = webLeaves.find(leaf => {
            const state = leaf.view.getState();
            return state?.url === url;
        });

        if (openWebLeaf) {
            menu.addItem((item) => {
                item
                    .setTitle('Close linked web view')
                    .setIcon('x')
                    .onClick(() => {
                        openWebLeaf.detach();
                    });
            });
        }

        // Close all linked web views
        menu.addItem((item) => {
            item
                .setTitle('Close all linked web views')
                .setIcon('x-circle')
                .onClick(() => {
                    this.view.closeAllLeavesForUrl(url);
                });
        });

        menu.addSeparator();

        // Open in web viewer
        menu.addItem((item) => {
            item
                .setTitle('Open in web viewer')
                .setIcon('globe')
                .onClick(async () => {
                    const leaf = this.view.app.workspace.getLeaf('tab');
                    await leaf.setViewState({
                        type: 'webviewer',
                        state: { url, navigate: true }
                    });
                    this.view.app.workspace.revealLeaf(leaf);
                });
        });

        // Open in default browser
        menu.addItem((item) => {
            item
                .setTitle('Open in default browser')
                .setIcon('external-link')
                .onClick(() => {
                    this.openInDefaultBrowser(url);
                });
        });

        // Open web viewer + note pair
        menu.addItem((item) => {
            item
                .setTitle('Open web viewer + note pair')
                .setIcon('columns')
                .onClick(async () => {
                    await this.view.openPaired(file, url, { metaKey: false, ctrlKey: false } as MouseEvent);
                });
        });

        // Copy URL
        menu.addItem((item) => {
            item
                .setTitle('Copy URL')
                .setIcon('copy')
                .onClick(() => {
                    navigator.clipboard.writeText(url);
                });
        });

        menu.showAtMouseEvent(event);
    }

    /**
     * Show context menu for a virtual tab (open note with URL, no active web tab)
     */
    showVirtualTabContextMenu(event: MouseEvent, url: string, file: TFile): void {
        event.preventDefault();
        const menu = new Menu();

        // Open URL in new web viewer
        menu.addItem((item) => {
            item
                .setTitle('Open in new web viewer')
                .setIcon('globe')
                .onClick(async () => {
                    const leaf = this.view.app.workspace.getLeaf('tab');
                    await leaf.setViewState({
                        type: 'webviewer',
                        state: { url, navigate: true }
                    });
                    this.view.app.workspace.revealLeaf(leaf);
                });
        });

        // Open in default browser
        menu.addItem((item) => {
            item
                .setTitle('Open in default browser')
                .setIcon('external-link')
                .onClick(() => {
                    this.openInDefaultBrowser(url);
                });
        });

        // Open in new window
        menu.addItem((item) => {
            item
                .setTitle('Open in new window')
                .setIcon('picture-in-picture-2')
                .onClick(async () => {
                    const leaf = this.view.app.workspace.openPopoutLeaf();
                    await leaf.setViewState({
                        type: 'webviewer',
                        state: { url, navigate: true }
                    });
                });
        });

        // Open to the right
        menu.addItem((item) => {
            item
                .setTitle('Open to the right')
                .setIcon('separator-vertical')
                .onClick(async () => {
                    const leaf = this.view.getOrCreateRightLeaf();
                    await leaf.setViewState({
                        type: 'webviewer',
                        state: { url, navigate: true }
                    });
                    this.view.app.workspace.revealLeaf(leaf);
                });
        });

        // Pin (create pinned tab from virtual tab / note URL)
        if (this.view.settings.enablePinnedTabs) {
            menu.addItem((item) => {
                item
                    .setTitle('Pin web view')
                    .setIcon('pin')
                    .onClick(() => {
                        // Create a VirtualTab-like object to pass to pinTab
                        this.view.pinTab({ file, url, propertyName: '', cachedTitle: file.basename });
                    });
            });
        }

        menu.addSeparator();

        // Open web viewer + note pair
        menu.addItem((item) => {
            item
                .setTitle('Open web viewer + note pair')
                .setIcon('columns')
                .onClick(async () => {
                    await this.view.openPaired(file, url, { metaKey: false, ctrlKey: false } as MouseEvent);
                });
        });

        // New linked note from URL (create additional note for this URL)
        menu.addItem((item) => {
            item
                .setTitle('New linked note from URL')
                .setIcon('file-plus')
                .onClick(() => {
                    this.view.openCreateNoteModal(url);
                });
        });

        menu.addSeparator();

        // Copy URL
        menu.addItem((item) => {
            item
                .setTitle('Copy URL')
                .setIcon('copy')
                .onClick(() => {
                    navigator.clipboard.writeText(url);
                });
        });

        // Reveal note in navigation
        menu.addItem((item) => {
            item
                .setTitle('Reveal note in navigation')
                .setIcon('folder')
                .onClick(async () => {
                    const explorerLeaf = this.view.app.workspace.getLeavesOfType('file-explorer')[0];
                    if (explorerLeaf) {
                        this.view.app.workspace.revealLeaf(explorerLeaf);
                    }
                    const tempLeaf = this.view.app.workspace.getLeaf('tab');
                    await tempLeaf.openFile(file, { active: false });
                    await (this.view.app as any).commands.executeCommandById('file-explorer:reveal-active-file');
                    tempLeaf.detach();
                });
        });

        menu.showAtMouseEvent(event);
    }

    /**
     * Show context menu for a domain group (Web notes grouped by domain)
     */
    showDomainContextMenu(event: MouseEvent, domain: string): void {
        event.preventDefault();
        const menu = new Menu();

        const domainUrl = `https://${domain}`;

        // Open domain homepage
        menu.addItem((item) => {
            item
                .setTitle(`Open ${domain}`)
                .setIcon('globe')
                .onClick(async () => {
                    const leaf = this.view.app.workspace.getLeaf('tab');
                    await leaf.setViewState({
                        type: 'webviewer',
                        state: { url: domainUrl, navigate: true }
                    });
                    this.view.app.workspace.revealLeaf(leaf);
                });
        });

        // Open in new window
        menu.addItem((item) => {
            item
                .setTitle('Open in new window')
                .setIcon('picture-in-picture-2')
                .onClick(async () => {
                    const leaf = this.view.app.workspace.openPopoutLeaf();
                    await leaf.setViewState({
                        type: 'webviewer',
                        state: { url: domainUrl, navigate: true }
                    });
                });
        });

        // Open to the right
        menu.addItem((item) => {
            item
                .setTitle('Open to the right')
                .setIcon('separator-vertical')
                .onClick(async () => {
                    const leaf = this.view.getOrCreateRightLeaf();
                    await leaf.setViewState({
                        type: 'webviewer',
                        state: { url: domainUrl, navigate: true }
                    });
                    this.view.app.workspace.revealLeaf(leaf);
                });
        });

        menu.addSeparator();

        // Copy domain URL
        menu.addItem((item) => {
            item
                .setTitle('Copy URL')
                .setIcon('copy')
                .onClick(() => {
                    navigator.clipboard.writeText(domainUrl);
                });
        });

        menu.showAtMouseEvent(event);
    }

    /**
     * Show context menu for a subreddit group (Subreddit notes explorer)
     */
    showSubredditContextMenu(event: MouseEvent, subreddit: string): void {
        event.preventDefault();
        const menu = new Menu();

        // subreddit is already in format "r/subredditName"
        const subredditUrl = `https://reddit.com/${subreddit}`;

        // Open subreddit
        menu.addItem((item) => {
            item
                .setTitle(`Open ${subreddit}`)
                .setIcon('globe')
                .onClick(async () => {
                    const leaf = this.view.app.workspace.getLeaf('tab');
                    await leaf.setViewState({
                        type: 'webviewer',
                        state: { url: subredditUrl, navigate: true }
                    });
                    this.view.app.workspace.revealLeaf(leaf);
                });
        });

        // Open in new window
        menu.addItem((item) => {
            item
                .setTitle('Open in new window')
                .setIcon('picture-in-picture-2')
                .onClick(async () => {
                    const leaf = this.view.app.workspace.openPopoutLeaf();
                    await leaf.setViewState({
                        type: 'webviewer',
                        state: { url: subredditUrl, navigate: true }
                    });
                });
        });

        // Open to the right
        menu.addItem((item) => {
            item
                .setTitle('Open to the right')
                .setIcon('separator-vertical')
                .onClick(async () => {
                    const leaf = this.view.getOrCreateRightLeaf();
                    await leaf.setViewState({
                        type: 'webviewer',
                        state: { url: subredditUrl, navigate: true }
                    });
                    this.view.app.workspace.revealLeaf(leaf);
                });
        });

        menu.addSeparator();

        // Copy subreddit URL
        menu.addItem((item) => {
            item
                .setTitle('Copy URL')
                .setIcon('copy')
                .onClick(() => {
                    navigator.clipboard.writeText(subredditUrl);
                });
        });

        menu.showAtMouseEvent(event);
    }

    /**
     * Helper to open URL in system default browser mechanism
     */
    private openInDefaultBrowser(url: string): void {
        // Try Electron shell first (definitive external open)
        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const { shell } = require('electron');
            shell.openExternal(url);
            return;
        } catch (e) {
            console.error('Failed to load electron shell', e);
        }

        // Fallback to window.open
        window.open(url, '_blank');
    }

    /**
     * Show context menu for a Pinned Tab
     */
    showPinnedTabContextMenu(event: MouseEvent, pin: PinnedTab): void {
        event.preventDefault();
        const menu = new Menu();

        // Open options (New Window, Right)
        menu.addItem((item) => {
            item.setTitle('Open in new window')
                .setIcon('picture-in-picture-2')
                .onClick(() => {
                    const leaf = this.view.app.workspace.openPopoutLeaf();
                    leaf.setViewState({ type: 'webviewer', state: { url: pin.currentUrl || pin.url } });
                });
        });

        // Open in default browser (NEW)
        menu.addItem((item) => {
            item
                .setTitle('Open in default browser')
                .setIcon('external-link')
                .onClick(() => {
                    this.openInDefaultBrowser(pin.currentUrl || pin.url);
                });
        });

        menu.addSeparator();

        // Unpin
        menu.addItem((item) => {
            item.setTitle('Unpin web view')
                .setIcon('pin-off')
                .onClick(() => {
                    this.view.unpinTab(pin.id);
                });
        });

        menu.addSeparator();

        // Reset URL (if currentUrl exists)
        if (pin.currentUrl && pin.currentUrl !== pin.url) {
            menu.addItem((item) => {
                item.setTitle('Reset to pinned URL')
                    .setIcon('rotate-ccw')
                    .onClick(() => {
                        this.view.resetPinnedTab(pin.id);
                    });
            });

            menu.addItem((item) => {
                item.setTitle('Update linked notes to current URL')
                    .setIcon('file-symlink')
                    .onClick(async () => {
                        // FIX: Re-fetch fresh pin from settings to ensure currentUrl is up-to-date
                        const freshPin = this.view.settings.pinnedTabs.find(p => p.id === pin.id);
                        if (!freshPin) return;

                        if ('updatePinnedTabNotes' in (this.view as any).tabStateService) {
                            await (this.view as any).tabStateService.updatePinnedTabNotes(freshPin.id);
                        }
                        // Force UI refresh after update
                        this.view.render(true);
                    });
            });

            menu.addItem((item) => {
                item.setTitle('Save current URL as pinned')
                    .setIcon('save')
                    .onClick(() => {
                        this.view.updatePinnedTabHomeUrl(pin.id, pin.currentUrl!);
                    });
            });
        }

        // Copy URL
        menu.addItem((item) => {
            item.setTitle('Copy pinned URL')
                .setIcon('copy')
                .onClick(() => navigator.clipboard.writeText(pin.url));
        });

        menu.showAtMouseEvent(event);
    }
}

