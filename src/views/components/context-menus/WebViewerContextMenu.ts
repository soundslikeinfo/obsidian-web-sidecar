import { Menu } from 'obsidian';
import { IWebSidecarView, TrackedWebViewer } from '../../../types';
import { findMatchingNotes } from '../../../services/noteMatcher';
import { openWebViewerAndRefresh, openInDefaultBrowser } from './ContextMenuHelpers';

/**
 * Show context menu for a web viewer tab
 */
export function showWebViewerContextMenu(
    view: IWebSidecarView,
    event: MouseEvent,
    tab: TrackedWebViewer
): void {
    event.preventDefault();
    const menu = new Menu();

    // Open in new tab
    menu.addItem((item) => {
        item
            .setTitle('Open in new web viewer')
            .setIcon('file-plus')
            .onClick(() => {
                void openWebViewerAndRefresh(
                    view,
                    () => view.app.workspace.getLeaf('tab'),
                    tab.url,
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
                openInDefaultBrowser(tab.url);
            });
    });

    // Open in new window
    menu.addItem((item) => {
        item
            .setTitle('Open in new window')
            .setIcon('picture-in-picture-2')
            .onClick(() => {
                void openWebViewerAndRefresh(
                    view,
                    () => view.app.workspace.openPopoutLeaf(),
                    tab.url,
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
                void openWebViewerAndRefresh(
                    view,
                    () => view.getOrCreateRightLeaf(),
                    tab.url,
                    true
                );
            });
    });

    // Pin web view
    if (view.settings.enablePinnedTabs) {
        menu.addItem((item) => {
            item
                .setTitle('Pin web view')
                .setIcon('pin')
                .onClick(() => {
                    void view.pinTab(tab);
                });
        });
    }

    // New linked note from URL
    menu.addItem((item) => {
        item
            .setTitle('New linked note from URL')
            .setIcon('file-plus')
            .onClick(() => {
                void view.openCreateNoteModal(tab.url, tab.leafId);
            });
    });

    menu.addSeparator();

    // Close web view
    menu.addItem((item) => {
        item
            .setTitle('Close web view')
            .setIcon('x')
            .onClick(() => {
                void view.closeLeaf(tab.leafId);
            });
    });

    // Close all linked web views
    menu.addItem((item) => {
        item
            .setTitle('Close all linked web views')
            .setIcon('x-circle')
            .onClick(() => {
                void view.closeAllLeavesForUrl(tab.url);
            });
    });

    // Close linked notes
    const matches = findMatchingNotes(view.app, tab.url, view.settings);
    const hasLinkedNotes = matches.exactMatches.length > 0;

    if (hasLinkedNotes) {
        menu.addItem((item) => {
            item
                .setTitle('Close all linked notes')
                .setIcon('file-minus')
                .onClick(() => {
                    void view.closeLinkedNoteLeaves(tab.url);
                });
        });

        // Close ALL - web views + linked notes
        menu.addItem((item) => {
            item
                .setTitle('Close all web views + linked notes')
                .setIcon('trash-2')
                .onClick(() => {
                    void view.closeAllLeavesForUrl(tab.url);
                    void view.closeLinkedNoteLeaves(tab.url);
                });
        });
    }

    // Redirect detection: Show option to update linked notes if URL has changed from original
    if (view.hasRedirectedUrl(tab.leafId)) {
        menu.addSeparator();
        menu.addItem((item) => {
            item
                .setTitle('Update linked note(s) url to current view')
                .setIcon('file-symlink')
                .onClick(() => {
                    void view.updateTrackedTabNotes(tab.leafId);
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
                void navigator.clipboard.writeText(tab.url);
            });
    });

    menu.showAtMouseEvent(event);
}
