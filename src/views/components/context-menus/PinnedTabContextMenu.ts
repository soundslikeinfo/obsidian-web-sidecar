import { Menu } from 'obsidian';
import { IWebSidecarView, PinnedTab } from '../../../types';
import { findMatchingNotes } from '../../../services/noteMatcher';
import { openWebViewerAndRefresh, openInDefaultBrowser } from './ContextMenuHelpers';

/**
 * Show context menu for a Pinned Tab
 */
export function showPinnedTabContextMenu(
    view: IWebSidecarView,
    event: MouseEvent,
    pin: PinnedTab
): void {
    event.preventDefault();
    const menu = new Menu();

    const effectiveUrl = pin.currentUrl || pin.url;

    // --- Standard Open Options ---

    // Open in new web viewer
    menu.addItem((item) => {
        item
            .setTitle('Open in new web viewer')
            .setIcon('file-plus')
            .onClick(() => {
                openWebViewerAndRefresh(
                    view,
                    () => view.app.workspace.getLeaf('tab'),
                    effectiveUrl,
                    true
                );
            });
    });

    // Open in default browser
    menu.addItem((item) => {
        item
            .setTitle('Open in default browser')
            .setIcon('external-link')
            .onClick(() => {
                openInDefaultBrowser(effectiveUrl);
            });
    });

    // Open in new window
    menu.addItem((item) => {
        item
            .setTitle('Open in new window')
            .setIcon('picture-in-picture-2')
            .onClick(() => {
                openWebViewerAndRefresh(
                    view,
                    () => view.app.workspace.openPopoutLeaf(),
                    effectiveUrl,
                    false
                );
            });
    });

    // Open to the right
    menu.addItem((item) => {
        item
            .setTitle('Open to the right')
            .setIcon('separator-vertical')
            .onClick(() => {
                openWebViewerAndRefresh(
                    view,
                    () => view.getOrCreateRightLeaf(),
                    effectiveUrl,
                    true
                );
            });
    });

    // New linked note from URL
    menu.addItem((item) => {
        item
            .setTitle('New linked note from URL')
            .setIcon('file-plus')
            .onClick(() => {
                view.openCreateNoteModal(effectiveUrl, pin.leafId);
            });
    });

    menu.addSeparator();

    // --- Close Options ---

    // Close web view (without unpinning) - only if leaf is open
    if (pin.leafId) {
        menu.addItem((item) => {
            item
                .setTitle('Close web view')
                .setIcon('x')
                .onClick(() => {
                    view.closeLeaf(pin.leafId!);
                });
        });
    }

    // Close all linked web views
    menu.addItem((item) => {
        item
            .setTitle('Close all linked web views')
            .setIcon('x-circle')
            .onClick(() => {
                view.closeAllLeavesForUrl(effectiveUrl);
            });
    });

    // Close linked notes
    const matches = findMatchingNotes(view.app, effectiveUrl, view.settings);
    const hasLinkedNotes = matches.exactMatches.length > 0;

    if (hasLinkedNotes) {
        menu.addItem((item) => {
            item
                .setTitle('Close all linked notes')
                .setIcon('file-minus')
                .onClick(() => {
                    view.closeLinkedNoteLeaves(effectiveUrl);
                });
        });

        // Close ALL - web views + linked notes
        menu.addItem((item) => {
            item
                .setTitle('Close all web views + linked notes')
                .setIcon('trash-2')
                .onClick(() => {
                    view.closeAllLeavesForUrl(effectiveUrl);
                    view.closeLinkedNoteLeaves(effectiveUrl);
                });
        });
    }

    menu.addSeparator();

    // --- Pin-specific Options ---

    // Unpin
    menu.addItem((item) => {
        item.setTitle('Unpin web view')
            .setIcon('pin-off')
            .onClick(() => {
                view.unpinTab(pin.id);
            });
    });

    // Reset URL (if currentUrl exists and differs from home)
    if (pin.currentUrl && pin.currentUrl !== pin.url) {
        menu.addSeparator();

        menu.addItem((item) => {
            item.setTitle('Reset to pinned URL')
                .setIcon('rotate-ccw')
                .onClick(() => {
                    view.resetPinnedTab(pin.id);
                });
        });

        menu.addItem((item) => {
            item.setTitle('Update linked notes to current URL')
                .setIcon('file-symlink')
                .onClick(async () => {
                    // FIX: Re-fetch fresh pin from settings to ensure currentUrl is up-to-date
                    const freshPin = view.settings.pinnedTabs.find(p => p.id === pin.id);
                    if (!freshPin) return;

                    if ('updatePinnedTabNotes' in view.tabStateService) {
                        await (view.tabStateService as any).updatePinnedTabNotes(freshPin.id);
                    }
                    // Force UI refresh after update
                    view.render(true);
                });
        });

        menu.addItem((item) => {
            item.setTitle('Save current URL as pinned')
                .setIcon('save')
                .onClick(() => {
                    view.updatePinnedTabHomeUrl(pin.id, pin.currentUrl!);
                });
        });
    }

    menu.addSeparator();

    // Copy URL
    menu.addItem((item) => {
        item.setTitle('Copy URL')
            .setIcon('copy')
            .onClick(() => navigator.clipboard.writeText(effectiveUrl));
    });

    // Copy pinned (home) URL if different
    if (pin.currentUrl && pin.currentUrl !== pin.url) {
        menu.addItem((item) => {
            item.setTitle('Copy pinned URL')
                .setIcon('copy')
                .onClick(() => navigator.clipboard.writeText(pin.url));
        });
    }

    menu.showAtMouseEvent(event);
}
