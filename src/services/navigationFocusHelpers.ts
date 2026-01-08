import { App } from 'obsidian';
import { TrackedWebViewer } from '../types';
import { getLeafId, leafHasFile } from './obsidianHelpers';
import { getWebViewerLeaves, getMarkdownLeaves } from './navigationLeafHelpers';

/**
 * Focus a specific web viewer leaf by its ID
 */
export async function focusWebViewerById(app: App, leafId: string): Promise<void> {
    const leaves = getWebViewerLeaves(app);

    for (const leaf of leaves) {
        const id = getLeafId(leaf) || leaf.view.getViewType() + '-' + leaves.indexOf(leaf);
        if (id === leafId) {
            await app.workspace.revealLeaf(leaf);
            app.workspace.setActiveLeaf(leaf, { focus: true });
            return;
        }
    }
}

/**
 * Focus a tracked tab using its leaf reference if available
 */
export function focusTrackedTab(app: App, tab: TrackedWebViewer): void {
    if (tab.leaf) {
        // Verify leaf is still valid/attached
        if (tab.leaf.view && tab.leaf.parent) {
            void app.workspace.revealLeaf(tab.leaf);
            app.workspace.setActiveLeaf(tab.leaf, { focus: true });
            return;
        }
    }
    // Fallback to ID matching
    void focusWebViewerById(app, tab.leafId);
}

/**
 * Cycle through multiple instances of web viewers with the same URL
 * Returns the next index in the cycle
 */
export function focusNextWebViewerByUrl(
    app: App,
    url: string,
    cycleIndex: Map<string, number>
): void {
    const leaves = getWebViewerLeaves(app);
    const matchingLeaves = leaves.filter(leaf => {
        const state = leaf.view.getState();
        return state?.url === url;
    });

    if (matchingLeaves.length === 0) return;

    if (matchingLeaves.length === 1) {
        void app.workspace.revealLeaf(matchingLeaves[0]!);
        app.workspace.setActiveLeaf(matchingLeaves[0]!, { focus: true });
        return;
    }

    // Cycle through multiple instances
    const currentIndex = cycleIndex.get(url) || 0;
    const nextIndex = (currentIndex + 1) % matchingLeaves.length;
    cycleIndex.set(url, nextIndex);

    void app.workspace.revealLeaf(matchingLeaves[nextIndex]!);
    app.workspace.setActiveLeaf(matchingLeaves[nextIndex]!, { focus: true });
}

/**
 * Cycle through multiple instances of tabs from TrackedWebViewer array
 */
export function focusNextTrackedTab(
    app: App,
    url: string,
    allTabs: TrackedWebViewer[],
    cycleIndex: Map<string, number>
): void {
    if (allTabs.length === 0) return;

    const currentIndex = cycleIndex.get(url) || 0;
    const nextIndex = (currentIndex + 1) % allTabs.length;
    cycleIndex.set(url, nextIndex);

    const targetTab = allTabs[nextIndex];
    if (targetTab) {
        focusTrackedTab(app, targetTab);
    }
}

/**
 * Cycle through multiple instances of a note file
 */
export function focusNextNoteByPath(
    app: App,
    filePath: string,
    cycleIndex: Map<string, number>
): void {
    const leaves = getMarkdownLeaves(app)
        .filter(leaf => leafHasFile(leaf, filePath));

    if (leaves.length === 0) return;

    if (leaves.length === 1) {
        void app.workspace.revealLeaf(leaves[0]!);
        app.workspace.setActiveLeaf(leaves[0]!, { focus: true });
        return;
    }

    // Cycle through multiple instances
    const currentIndex = cycleIndex.get(filePath) || 0;
    const nextIndex = (currentIndex + 1) % leaves.length;
    cycleIndex.set(filePath, nextIndex);

    void app.workspace.revealLeaf(leaves[nextIndex]!);
    app.workspace.setActiveLeaf(leaves[nextIndex]!, { focus: true });
}
