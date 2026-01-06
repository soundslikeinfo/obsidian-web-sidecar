import { Menu, TFile } from 'obsidian';
import { IWebSidecarView, AppWithCommands } from '../../../types';
import { leafHasFile } from '../../../services/obsidianHelpers';
import { openWebViewerAndRefresh, openInDefaultBrowser } from './ContextMenuHelpers';

/**
 * Show context menu for a note item
 */
export function showNoteContextMenu(
    view: IWebSidecarView,
    event: MouseEvent,
    file: TFile,
    url: string
): void {
    event.preventDefault();
    const menu = new Menu();

    // Open in new tab
    menu.addItem((item) => {
        item
            .setTitle('Open note in new tab')
            .setIcon('file-plus')
            .onClick(() => {
                const leaf = view.app.workspace.getLeaf('tab');
                void leaf.openFile(file);
            });
    });

    // Open in new window
    menu.addItem((item) => {
        item
            .setTitle('Open note in new window')
            .setIcon('picture-in-picture-2')
            .onClick(() => {
                const leaf = view.app.workspace.openPopoutLeaf();
                void leaf.openFile(file);
            });
    });

    // Open to the right
    menu.addItem((item) => {
        item
            .setTitle('Open note to the right')
            .setIcon('separator-vertical')
            .onClick(() => {
                const leaf = view.getOrCreateRightLeaf();
                void leaf.openFile(file);
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
                const explorerLeaf = view.app.workspace.getLeavesOfType('file-explorer')[0];
                if (explorerLeaf) {
                    void view.app.workspace.revealLeaf(explorerLeaf);
                }
                // Use Obsidian command to reveal active file
                const tempLeaf = view.app.workspace.getLeaf('tab');
                await tempLeaf.openFile(file, { active: false });
                void (view.app as AppWithCommands).commands.executeCommandById('file-explorer:reveal-active-file');
                tempLeaf.detach();
            });
    });

    // Copy full path
    menu.addItem((item) => {
        item
            .setTitle('Copy full path')
            .setIcon('copy')
            .onClick(() => {
                void navigator.clipboard.writeText(file.path);
            });
    });

    menu.addSeparator();

    // Close this note (if open)
    const markdownLeaves = view.app.workspace.getLeavesOfType('markdown');
    const openLeaf = markdownLeaves.find(leaf => leafHasFile(leaf, file.path));

    if (openLeaf) {
        menu.addItem((item) => {
            item
                .setTitle('Close this note')
                .setIcon('x')
                .onClick(() => {
                    openLeaf.detach();
                    // Delay render slightly to allow workspace focus to settle on the next leaf
                    setTimeout(() => view.render(true), 100);
                });
        });
    }

    // Close all linked notes for this URL
    menu.addItem((item) => {
        item
            .setTitle('Close all linked notes')
            .setIcon('file-minus')
            .onClick(() => {
                view.closeLinkedNoteLeaves(url);
            });
    });

    // Close linked web view (if URL is open in a web viewer)
    const webLeaves = view.app.workspace.getLeavesOfType('webviewer')
        .concat(view.app.workspace.getLeavesOfType('surfing-view'));
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
                view.closeAllLeavesForUrl(url);
            });
    });

    // Close all web views + linked notes
    menu.addItem((item) => {
        item
            .setTitle('Close all web views + linked notes')
            .setIcon('trash-2')
            .onClick(() => {
                view.closeAllLeavesForUrl(url);
                view.closeLinkedNoteLeaves(url);
                // Force refresh after bulk close
                setTimeout(() => view.render(true), 150);
            });
    });

    menu.addSeparator();

    // Open in web viewer
    menu.addItem((item) => {
        item
            .setTitle('Open in web viewer')
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

    // Open web viewer + note pair
    menu.addItem((item) => {
        item
            .setTitle('Open web viewer + note pair')
            .setIcon('columns')
            .onClick(async () => {
                await view.openPaired(file, url, { metaKey: false, ctrlKey: false } as MouseEvent);
            });
    });

    // Copy URL
    menu.addItem((item) => {
        item
            .setTitle('Copy URL')
            .setIcon('copy')
            .onClick(() => {
                void navigator.clipboard.writeText(url);
            });
    });

    menu.showAtMouseEvent(event);
}
