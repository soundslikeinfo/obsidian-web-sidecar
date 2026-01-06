import { Menu, TFile } from 'obsidian';
import { IWebSidecarView, AppWithCommands } from '../../../types';
import { openWebViewerAndRefresh, openInDefaultBrowser } from './ContextMenuHelpers';

/**
 * Show context menu for a virtual tab (open note with URL, no active web tab)
 */
export function showVirtualTabContextMenu(
    view: IWebSidecarView,
    event: MouseEvent,
    url: string,
    file: TFile
): void {
    event.preventDefault();
    const menu = new Menu();

    // Open URL in new web viewer
    menu.addItem((item) => {
        item
            .setTitle('Open in new web viewer')
            .setIcon('globe')
            .onClick(() => {
                void openWebViewerAndRefresh(
                    view,
                    () => view.app.workspace.getLeaf('tab'),
                    url,
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
                openInDefaultBrowser(url);
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
                    url,
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
                    url,
                    true
                );
            });
    });

    // Pin (create pinned tab from virtual tab / note URL)
    if (view.settings.enablePinnedTabs) {
        menu.addItem((item) => {
            item
                .setTitle('Pin web view')
                .setIcon('pin')
                .onClick(() => {
                    // Create a VirtualTab-like object to pass to pinTab
                    void view.pinTab({ file, url, propertyName: '', cachedTitle: file.basename });
                });
        });
    }

    menu.addSeparator();

    // Open web viewer + note pair
    menu.addItem((item) => {
        item
            .setTitle('Open web viewer + note pair')
            .setIcon('columns')
            .onClick(() => {
                void view.openPaired(file, url, { metaKey: false, ctrlKey: false } as MouseEvent);
            });
    });

    // New linked note from URL (create additional note for this URL)
    menu.addItem((item) => {
        item
            .setTitle('New linked note from URL')
            .setIcon('file-plus')
            .onClick(() => {
                void view.openCreateNoteModal(url);
            });
    });

    menu.addSeparator();

    // Copy URL
    menu.addItem((item) => {
        item
            .setTitle('Copy URL')
            .setIcon('copy')
            .onClick(() => {
                void navigator.clipboard.writeText(url);
            });
    });

    // Reveal note in navigation
    menu.addItem((item) => {
        item
            .setTitle('Reveal note in navigation')
            .setIcon('folder')
            .onClick(() => {
                const explorerLeaf = view.app.workspace.getLeavesOfType('file-explorer')[0];
                if (explorerLeaf) {
                    void view.app.workspace.revealLeaf(explorerLeaf);
                }
                const tempLeaf = view.app.workspace.getLeaf('tab');
                void tempLeaf.openFile(file, { active: false }).then(async () => {
                    (view.app as AppWithCommands).commands.executeCommandById('file-explorer:reveal-active-file');
                    tempLeaf.detach();
                });
            });
    });

    menu.showAtMouseEvent(event);
}
