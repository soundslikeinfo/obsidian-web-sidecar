import { Menu } from 'obsidian';
import { IWebSidecarView } from '../../../types';
import { openWebViewerAndRefresh } from './ContextMenuHelpers';

/**
 * Show context menu for a domain group (Web domains)
 */
export function showDomainContextMenu(
    view: IWebSidecarView,
    event: MouseEvent,
    domain: string
): void {
    event.preventDefault();
    const menu = new Menu();

    const domainUrl = `https://${domain}`;

    // Open domain homepage
    menu.addItem((item) => {
        item
            .setTitle(`Open ${domain}`)
            .setIcon('globe')
            .onClick(() => {
                void openWebViewerAndRefresh(
                    view,
                    () => view.app.workspace.getLeaf('tab'),
                    domainUrl,
                    true
                );
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
                    domainUrl,
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
                    domainUrl,
                    true
                );
            });
    });

    menu.addSeparator();

    // Copy domain URL
    menu.addItem((item) => {
        item
            .setTitle('Copy URL')
            .setIcon('copy')
            .onClick(() => {
                void navigator.clipboard.writeText(domainUrl);
            });
    });

    menu.showAtMouseEvent(event);
}

/**
 * Show context menu for a subreddit group (Subreddits)
 */
export function showSubredditContextMenu(
    view: IWebSidecarView,
    event: MouseEvent,
    subreddit: string
): void {
    event.preventDefault();
    const menu = new Menu();

    // subreddit is already in format "r/subredditName"
    const subredditUrl = `https://reddit.com/${subreddit}`;

    // Open subreddit
    menu.addItem((item) => {
        item
            .setTitle(`Open ${subreddit}`)
            .setIcon('globe')
            .onClick(() => {
                void openWebViewerAndRefresh(
                    view,
                    () => view.app.workspace.getLeaf('tab'),
                    subredditUrl,
                    true
                );
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
                    subredditUrl,
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
                    subredditUrl,
                    true
                );
            });
    });

    menu.addSeparator();

    // Copy subreddit URL
    menu.addItem((item) => {
        item
            .setTitle('Copy URL')
            .setIcon('copy')
            .onClick(() => {
                void navigator.clipboard.writeText(subredditUrl);
            });
    });

    menu.showAtMouseEvent(event);
}
