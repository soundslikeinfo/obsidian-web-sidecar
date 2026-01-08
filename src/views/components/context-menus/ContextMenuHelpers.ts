import { WorkspaceLeaf } from 'obsidian';
import { IWebSidecarView } from '../../../types';

/**
 * Helper: Open a web viewer and trigger triple forced refresh for UI update
 */
export async function openWebViewerAndRefresh(
    view: IWebSidecarView,
    leafGetter: () => WorkspaceLeaf,
    url: string,
    reveal: boolean = false
): Promise<void> {
    const leaf = leafGetter();
    await leaf.setViewState({
        type: 'webviewer',
        state: { url, navigate: true }
    });
    if (reveal) {
        await view.app.workspace.revealLeaf(leaf);
    }

    // Triple forced refresh for immediate UI update
    view.render(true);
    setTimeout(() => view.render(true), 150);
    setTimeout(() => view.render(true), 400);
}

/**
 * Helper to open URL in system default browser mechanism
 */
export function openInDefaultBrowser(url: string): void {
    window.open(url, '_blank');
}
