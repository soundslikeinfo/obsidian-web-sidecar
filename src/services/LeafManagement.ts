import { App, WorkspaceLeaf, WorkspaceSplit } from 'obsidian';

/**
 * Utilities for managing workspace leaves (panes)
 */
export class LeafManagement {
    constructor(private app: App) { }

    /**
     * Check if a leaf is in a popout window (not the main window)
     */
    isPopout(leaf: WorkspaceLeaf): boolean {
        return leaf.getRoot() !== this.app.workspace.rootSplit;
    }

    /**
     * Check if a leaf is in the main content area (not a sidebar)
     */
    isInMainArea(leaf: WorkspaceLeaf): boolean {
        let current: WorkspaceSplit | null = leaf.parent;
        const rootSplit = this.app.workspace.rootSplit;

        while (current) {
            if (current === rootSplit) {
                return true;
            }
            current = current.parent;
        }
        return false;
    }

    /**
     * Get all leaves in the main content area (excluding sidebars)
     */
    getMainAreaLeaves(): WorkspaceLeaf[] {
        const workspace = this.app.workspace;
        const allLeaves = workspace.getLeavesOfType('markdown')
            .concat(workspace.getLeavesOfType('webviewer'))
            .concat(workspace.getLeavesOfType('surfing-view'))
            .concat(workspace.getLeavesOfType('empty'));

        return allLeaves.filter(leaf => this.isInMainArea(leaf));
    }

    /**
     * Get an existing right-side leaf in the same window, or create a new split.
     * Reuses existing splits instead of creating infinite right splits.
     * 
     * @param referenceLeaf Optional leaf to use as reference for determining "source" group
     */
    getOrCreateRightLeaf(referenceLeaf?: WorkspaceLeaf): WorkspaceLeaf {
        const workspace = this.app.workspace;
        const mainLeaves = this.getMainAreaLeaves();

        if (mainLeaves.length === 0) {
            return workspace.getLeaf('split', 'vertical');
        }

        let sourceLeaf = referenceLeaf;
        if (!sourceLeaf || !this.isInMainArea(sourceLeaf)) {
            const webViewerLeaf = mainLeaves.find(l =>
                l.view.getViewType() === 'webviewer' ||
                l.view.getViewType() === 'surfing-view'
            );
            sourceLeaf = webViewerLeaf || mainLeaves[0]!;
        }

        const sourceParent = sourceLeaf.parent;

        // Collect all unique tab groups (parents) in the main area
        const tabGroups = new Map<WorkspaceSplit, WorkspaceLeaf[]>();
        for (const leaf of mainLeaves) {
            if (!leaf.parent) continue;
            if (!tabGroups.has(leaf.parent)) {
                tabGroups.set(leaf.parent, []);
            }
            tabGroups.get(leaf.parent)!.push(leaf);
        }

        // Find a different group from the source, preferring markdown notes (right pane)
        let targetParent: WorkspaceSplit | null = null;
        let fallbackParent: WorkspaceSplit | null = null;

        for (const [parent, leaves] of tabGroups.entries()) {
            if (parent === sourceParent) continue;

            const hasMarkdown = leaves.some(l => l.view?.getViewType() === 'markdown');

            if (hasMarkdown) {
                targetParent = parent;
                break;
            } else if (!fallbackParent) {
                fallbackParent = parent;
            }
        }

        const chosenParent = targetParent || fallbackParent;

        if (chosenParent) {
            return workspace.createLeafInParent(chosenParent, -1);
        }

        return workspace.createLeafBySplit(sourceLeaf, 'vertical');
    }

    /**
     * Get or create a leaf in the web viewer group (LEFT side in paired layout).
     * Ensures new web viewers are created alongside existing web viewers.
     */
    getOrCreateWebViewerLeaf(): WorkspaceLeaf {
        const workspace = this.app.workspace;
        const mainLeaves = this.getMainAreaLeaves();

        if (mainLeaves.length === 0) {
            return workspace.getLeaf('tab');
        }

        const webViewerLeaf = mainLeaves.find(l =>
            l.view.getViewType() === 'webviewer' ||
            l.view.getViewType() === 'surfing-view'
        );

        if (webViewerLeaf && webViewerLeaf.parent) {
            return workspace.createLeafInParent(webViewerLeaf.parent, -1);
        }

        // No web viewers exist - check if we have multiple groups (paired layout)
        const tabGroups = new Map<WorkspaceSplit, WorkspaceLeaf[]>();
        for (const leaf of mainLeaves) {
            if (!leaf.parent) continue;
            if (!tabGroups.has(leaf.parent)) {
                tabGroups.set(leaf.parent, []);
            }
            tabGroups.get(leaf.parent)!.push(leaf);
        }

        if (tabGroups.size <= 1) {
            return workspace.getLeaf('tab');
        }

        // Multiple groups - find one WITHOUT markdown (likely web viewer group)
        for (const [parent, leaves] of tabGroups.entries()) {
            const hasMarkdown = leaves.some(l => l.view?.getViewType() === 'markdown');
            if (!hasMarkdown) {
                return workspace.createLeafInParent(parent, -1);
            }
        }

        // Fallback: use first group (typically left)
        const firstParent = tabGroups.keys().next().value;
        if (firstParent) {
            return workspace.createLeafInParent(firstParent, -1);
        }

        return workspace.getLeaf('tab');
    }
}
