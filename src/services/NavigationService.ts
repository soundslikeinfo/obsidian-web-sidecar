
import { App, TFile, WorkspaceLeaf } from 'obsidian';
import { CreateNoteModal } from '../modals/createNoteModal';
import { TrackedWebViewer, WebSidecarSettings } from '../types';
import { findMatchingNotes } from './noteMatcher';
import type { UrlIndex } from './UrlIndex';
import { getWebViewerHomepage } from './webViewerUtils';

export class NavigationService {
    private app: App;
    private getSettings: () => WebSidecarSettings;
    private urlIndex: UrlIndex;
    private urlCycleIndex: Map<string, number> = new Map();
    private isManualRefreshCallback: (val: boolean) => void;
    private onRefreshCallback: () => void; // needed for openCreateNoteModal callback

    constructor(
        app: App,
        getSettings: () => WebSidecarSettings,
        urlIndex: UrlIndex,
        setManualRefresh: (val: boolean) => void,
        onRefresh: () => void
    ) {
        this.app = app;
        this.getSettings = getSettings;
        this.urlIndex = urlIndex;
        this.isManualRefreshCallback = setManualRefresh;
        this.onRefreshCallback = onRefresh;
    }

    /**
     * Focus a specific web viewer leaf
     */
    async focusWebViewer(leafId: string): Promise<void> {
        const leaves = this.app.workspace.getLeavesOfType('webviewer')
            .concat(this.app.workspace.getLeavesOfType('surfing-view'));

        for (const leaf of leaves) {
            // Replicate original ID generation logic for matching
            const id = (leaf as any).id || leaf.view.getViewType() + '-' + leaves.indexOf(leaf);
            if (id === leafId) {
                this.app.workspace.revealLeaf(leaf);
                this.app.workspace.setActiveLeaf(leaf, { focus: true });
                return;
            }
        }
    }

    /**
     * Robustly focus a tracked tab using its leaf reference if available
     */
    focusTab(tab: TrackedWebViewer): void {
        if (tab.leaf) {
            // Verify leaf is still valid/attached
            if (tab.leaf.view && tab.leaf.parent) {
                this.app.workspace.revealLeaf(tab.leaf);
                this.app.workspace.setActiveLeaf(tab.leaf, { focus: true });
                return;
            }
        }
        // Fallback to ID matching
        this.focusWebViewer(tab.leafId);
    }

    /**
     * Focus the next instance of a URL (cycle through duplicates)
     */
    focusNextInstance(url: string, allTabs: TrackedWebViewer[]): void {
        if (allTabs.length === 0) return;

        const currentIndex = this.urlCycleIndex.get(url) || 0;
        const nextIndex = (currentIndex + 1) % allTabs.length;
        this.urlCycleIndex.set(url, nextIndex);

        const targetTab = allTabs[nextIndex];
        if (targetTab) {
            this.focusTab(targetTab);
        }
    }

    /** Cycle index for note instances */
    private noteCycleIndex: Map<string, number> = new Map();

    /**
     * Focus the next instance of a note file (cycle through multiple open tabs)
     */
    focusNextNoteInstance(filePath: string): void {
        const leaves = this.app.workspace.getLeavesOfType('markdown')
            .filter(leaf => (leaf.view as any).file?.path === filePath);

        if (leaves.length === 0) return;

        if (leaves.length === 1) {
            // Single instance - just focus it
            this.app.workspace.revealLeaf(leaves[0]!);
            this.app.workspace.setActiveLeaf(leaves[0]!, { focus: true });
            return;
        }

        // Cycle through multiple instances
        const currentIndex = this.noteCycleIndex.get(filePath) || 0;
        const nextIndex = (currentIndex + 1) % leaves.length;
        this.noteCycleIndex.set(filePath, nextIndex);

        this.app.workspace.revealLeaf(leaves[nextIndex]!);
        this.app.workspace.setActiveLeaf(leaves[nextIndex]!, { focus: true });
    }

    /**
     * Smart note opening: focus existing, shift=new tab, command=popout
     */
    async openNoteSmartly(file: TFile, e: MouseEvent | KeyboardEvent): Promise<void> {
        // CMD/Ctrl + click = open in new popout window
        if (e.metaKey || e.ctrlKey) {
            const newWindow = this.app.workspace.openPopoutLeaf();
            await newWindow.openFile(file);
            return;
        }

        // Shift + click = force new tab
        if (e.shiftKey) {
            await this.app.workspace.openLinkText(file.path, '', 'tab');
            return;
        }

        // Check if note is already open anywhere
        const leaves = this.app.workspace.getLeavesOfType('markdown');
        for (const leaf of leaves) {
            const viewFile = (leaf.view as any).file;
            if (viewFile && viewFile.path === file.path) {
                // Already open, just focus it
                this.app.workspace.revealLeaf(leaf);
                this.app.workspace.setActiveLeaf(leaf, { focus: true });
                return;
            }
        }

        // Not open - use noteOpenBehavior setting
        const settings = this.getSettings();
        if (settings.noteOpenBehavior === 'split') {
            const newLeaf = this.getOrCreateRightLeaf();
            await newLeaf.openFile(file);
        } else {
            const newLeaf = this.app.workspace.getLeaf('tab');
            await newLeaf.openFile(file);
        }
        this.isManualRefreshCallback(true);
        this.onRefreshCallback();
    }

    /**
     * Smart URL opening: focus existing, shift=new tab, cmd=popout
     */
    async openUrlSmartly(url: string, e: MouseEvent): Promise<void> {
        // CMD/Ctrl + click = open in new popout window
        if (e.metaKey || e.ctrlKey) {
            const newWindow = this.app.workspace.openPopoutLeaf();
            await newWindow.setViewState({
                type: 'webviewer',
                state: { url, navigate: true }
            });
            this.isManualRefreshCallback(true);
            this.onRefreshCallback();
            return;
        }

        // Shift + click = force new tab (bypass existing check)
        if (e.shiftKey) {
            const leaf = this.app.workspace.getLeaf('tab');
            await leaf.setViewState({
                type: 'webviewer',
                state: { url, navigate: true }
            });

            this.isManualRefreshCallback(true);
            this.onRefreshCallback();
            return;
        }

        // Default: focus existing or open new
        // Default: focus existing or open new
        await this.openUrlInWebViewer(url);

        // CRITICAL: Immediate refresh THEN delayed refresh
        this.isManualRefreshCallback(true);
        this.onRefreshCallback();

        // Second refresh after Obsidian fully registers the leaf
        await new Promise(resolve => setTimeout(resolve, 100));
        this.isManualRefreshCallback(true);
        this.onRefreshCallback();
    }

    /**
     * Open a new empty web viewer
     * CRITICAL: Must trigger immediate UI refresh showing the new tab
     */
    async openNewWebViewer(): Promise<void> {
        this.isManualRefreshCallback(true);
        const homepage = getWebViewerHomepage(this.app);
        const leaf = this.app.workspace.getLeaf('tab');
        await leaf.setViewState({
            type: 'webviewer',
            state: { url: homepage, navigate: true }
        });
        this.app.workspace.revealLeaf(leaf);
        this.app.workspace.setActiveLeaf(leaf, { focus: true });

        // CRITICAL: Immediate refresh first, then delayed refresh to catch any late registration
        this.isManualRefreshCallback(true);
        this.onRefreshCallback();

        // Second refresh after Obsidian fully registers the leaf
        await new Promise(resolve => setTimeout(resolve, 100));
        this.isManualRefreshCallback(true);
        this.onRefreshCallback();
    }

    /**
     * Open create note modal
     */
    openCreateNoteModal(url: string): void {
        new CreateNoteModal(
            this.app,
            url,
            this.getSettings(),
            async (path) => {
                // Open the newly created note
                const file = this.app.vault.getAbstractFileByPath(path);
                if (file instanceof TFile) {
                    await this.app.workspace.openLinkText(path, '', true);
                }
                // Refresh the view
                this.onRefreshCallback();
            }
        ).open();
    }

    /**
     * Open both web viewer AND note together (paired opening)
     */
    async openPaired(file: TFile, url: string, e: MouseEvent): Promise<void> {
        if (e.metaKey || e.ctrlKey) {
            const newWindow = this.app.workspace.openPopoutLeaf();
            await newWindow.openFile(file);
            return;
        }

        // Check if URL is already open in a web viewer
        const webLeaves = this.app.workspace.getLeavesOfType('webviewer')
            .concat(this.app.workspace.getLeavesOfType('surfing-view'));

        let webLeaf: WorkspaceLeaf | null = null;
        let blankWebLeaf: WorkspaceLeaf | null = null;

        for (const leaf of webLeaves) {
            const state = leaf.view.getState();
            if (state?.url === url) {
                webLeaf = leaf;
                break;
            }
            if (!blankWebLeaf && (!state?.url || state.url === 'about:blank' || state.url === '')) {
                blankWebLeaf = leaf;
            }
        }

        // Check if note is already open
        const markdownLeaves = this.app.workspace.getLeavesOfType('markdown');
        let noteLeaf: WorkspaceLeaf | null = null;
        for (const leaf of markdownLeaves) {
            const viewFile = (leaf.view as any).file;
            if (viewFile && viewFile.path === file.path) {
                noteLeaf = leaf;
                break;
            }
        }

        if (webLeaf && noteLeaf) {
            this.app.workspace.revealLeaf(noteLeaf);
            return;
        }

        const settings = this.getSettings();

        if (webLeaf) {
            if (noteLeaf) {
                this.app.workspace.revealLeaf(noteLeaf);
            } else if (settings.noteOpenBehavior === 'split') {
                const newNoteLeaf = this.getOrCreateRightLeaf(webLeaf);
                await newNoteLeaf.openFile(file);
            } else {
                const newNoteLeaf = this.app.workspace.getLeaf('tab');
                await newNoteLeaf.openFile(file);
            }
            return;
        }

        if (blankWebLeaf) {
            webLeaf = blankWebLeaf;
        } else {
            // Find a suitable "Main" leaf to create the web viewer in
            // Should be the LEFTMOST or MAIN leaf, not necessarily the active one
            let parentLeaf = this.app.workspace.getLeaf(); // Default to active
            const mainLeaves = this.getMainAreaLeaves();

            // If we have main leaves, try to find a web viewer group first, or just use the first leaf (Left)
            // This prevents creating the web viewer in the "Right" (Note) group if focus is there
            if (mainLeaves.length > 0) {
                const webGroupLeaf = mainLeaves.find(l => l.view.getViewType() === 'webviewer');
                if (webGroupLeaf) {
                    parentLeaf = webGroupLeaf;
                } else {
                    // Fallback to first leaf (usually Left-most in 2-pane setup)
                    parentLeaf = mainLeaves[0]!;
                }
            }

            // Create new tab in that specific parent group
            webLeaf = this.app.workspace.createLeafInParent(parentLeaf.parent, -1);
        }

        await webLeaf.setViewState({
            type: 'webviewer',
            state: { url, navigate: true }
        });

        if (noteLeaf) {
            this.app.workspace.revealLeaf(noteLeaf);
        } else if (settings.noteOpenBehavior === 'split') {
            const newNoteLeaf = this.getOrCreateRightLeaf(webLeaf);
            await newNoteLeaf.openFile(file);
        } else {
            const newNoteLeaf = this.app.workspace.getLeaf('tab');
            await newNoteLeaf.openFile(file);
        }
        // Remove these redundant lines
        // const newNoteLeaf = this.app.workspace.getLeaf('tab');
        // await newNoteLeaf.openFile(file);

        // CRITICAL: Immediate refresh THEN delayed refresh
        this.isManualRefreshCallback(true);
        this.onRefreshCallback();

        // Second refresh after Obsidian fully registers the leaf
        await new Promise(resolve => setTimeout(resolve, 100));
        this.isManualRefreshCallback(true);
        this.onRefreshCallback();
    }

    /**
     * Close a specific leaf by ID
     */
    closeLeaf(leafId: string): void {
        // We need to find it again using the loose matching or stored ID
        const leaves = this.app.workspace.getLeavesOfType('webviewer')
            .concat(this.app.workspace.getLeavesOfType('surfing-view'));

        for (const leaf of leaves) {
            const id = (leaf as any).id || leaf.view.getViewType() + '-' + leaves.indexOf(leaf);
            if (id === leafId) {
                leaf.detach();
                // break; // Don't return, we need to refresh
            }
        }

        // Fallback: try getLeafById if it works with internal IDs
        const leaf = this.app.workspace.getLeafById(leafId);
        if (leaf) {
            leaf.detach();
        }

        this.isManualRefreshCallback(true);
        this.onRefreshCallback();

        // Delayed refresh to ensure UI catches up
        setTimeout(() => {
            this.isManualRefreshCallback(true);
            this.onRefreshCallback();
        }, 100);
    }

    /**
     * Close all web viewer leaves for a specific URL
     */
    closeAllLeavesForUrl(url: string): void {
        const leaves = this.app.workspace.getLeavesOfType('webviewer')
            .concat(this.app.workspace.getLeavesOfType('surfing-view'));

        for (const leaf of leaves) {
            const state = leaf.view.getState();
            if (state?.url === url) {
                leaf.detach();
            }
        }
        this.isManualRefreshCallback(true);
        this.onRefreshCallback();

        // Delayed refresh to ensure UI catches up
        setTimeout(() => {
            this.isManualRefreshCallback(true);
            this.onRefreshCallback();
        }, 100);
    }

    /**
     * Close all linked note leaves for a URL
     */
    closeLinkedNoteLeaves(url: string): void {
        const matches = findMatchingNotes(this.app, url, this.getSettings(), this.urlIndex);
        const allMatches = [...matches.exactMatches, ...matches.tldMatches];

        if (matches.subredditMatches) {
            matches.subredditMatches.forEach(notes => allMatches.push(...notes));
        }

        if (allMatches.length === 0) return;

        const filePaths = new Set(allMatches.map(m => m.file.path));
        const leaves = this.app.workspace.getLeavesOfType('markdown');

        for (const leaf of leaves) {
            const file = (leaf.view as any).file;
            if (file && filePaths.has(file.path)) {
                leaf.detach();
            }
        }
        this.isManualRefreshCallback(true);
        this.onRefreshCallback();

        // Delayed refresh to ensure UI catches up
        setTimeout(() => {
            this.isManualRefreshCallback(true);
            this.onRefreshCallback();
        }, 100);
    }

    /**
     * Check if a leaf is in a popout window (not the main window)
     */
    private isPopout(leaf: WorkspaceLeaf): boolean {
        return leaf.getRoot() !== this.app.workspace.rootSplit;
    }

    /**
     * Get an existing right-side leaf in the same window, or create a new split.
     * Reuses existing splits instead of creating infinite right splits.
     * 
     * Logic:
     * 1. Identify which tab group the source leaf belongs to
     * 2. Find a DIFFERENT tab group that contains web viewers (preferred) or any other content
     * 3. If found, create a new tab in that group
     * 4. If not found, create a new vertical split
     * 
     * @param referenceLeaf Optional leaf to use as reference for determining "source" group
     */
    getOrCreateRightLeaf(referenceLeaf?: WorkspaceLeaf): WorkspaceLeaf {
        const workspace = this.app.workspace;

        // Get all leaves in the main content area (not sidebars)
        const mainLeaves = this.getMainAreaLeaves();
        if (mainLeaves.length === 0) {
            return workspace.getLeaf('split', 'vertical');
        }

        // Determine which group we're "coming from"
        // Priority: referenceLeaf > last focused non-sidecar leaf > first main leaf
        // Determine which group we're "coming from"
        // Priority: referenceLeaf > first web viewer > first main leaf
        let sourceLeaf = referenceLeaf;
        if (!sourceLeaf || !this.isInMainArea(sourceLeaf)) {
            // Priority: Web Viewer > Surfing View > First Main Leaf (likely markdown)
            // We want to be "to the right of the web viewer"
            const webViewerLeaf = mainLeaves.find(l =>
                l.view.getViewType() === 'webviewer' ||
                l.view.getViewType() === 'surfing-view'
            );
            sourceLeaf = webViewerLeaf || mainLeaves[0]!;
        }

        const sourceParent = sourceLeaf.parent;

        // Collect all unique tab groups (parents) in the main area
        const tabGroups = new Map<any, WorkspaceLeaf[]>();
        for (const leaf of mainLeaves) {
            if (!leaf.parent) continue;
            if (!tabGroups.has(leaf.parent)) {
                tabGroups.set(leaf.parent, []);
            }
            tabGroups.get(leaf.parent)!.push(leaf);
        }

        // Find the "target" group - a different group from the source
        // Prefer groups that contain markdown notes (those are likely the "notes" pane on the right)
        // Web viewers are typically on the LEFT, notes on the RIGHT
        let targetParent: any = null;
        let fallbackParent: any = null;

        for (const [parent, leaves] of tabGroups.entries()) {
            if (parent === sourceParent) continue; // Skip source group

            // Check if this group has markdown notes (the right pane)
            const hasMarkdown = leaves.some(l =>
                l.view?.getViewType() === 'markdown'
            );

            if (hasMarkdown) {
                targetParent = parent;
                break; // Prefer markdown groups (right pane)
            } else if (!fallbackParent) {
                fallbackParent = parent;
            }
        }

        // Use markdown group if found, otherwise any other group
        const chosenParent = targetParent || fallbackParent;

        if (chosenParent) {
            return workspace.createLeafInParent(chosenParent, -1);
        }

        // No other tab group exists - create a new split
        // Explicitly split the source leaf to ensure correct direction (Right)
        // defaulting to 'vertical' places it to the right of the source
        return workspace.createLeafBySplit(sourceLeaf, 'vertical');
    }

    /**
     * Check if a leaf is in the main content area (not a sidebar)
     */
    private isInMainArea(leaf: WorkspaceLeaf): boolean {
        // Traverse up to check if this leaf is under rootSplit
        let current: any = leaf.parent;
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
    private getMainAreaLeaves(): WorkspaceLeaf[] {
        const workspace = this.app.workspace;
        const allLeaves = workspace.getLeavesOfType('markdown')
            .concat(workspace.getLeavesOfType('webviewer'))
            .concat(workspace.getLeavesOfType('surfing-view'))
            .concat(workspace.getLeavesOfType('empty'));

        return allLeaves.filter(leaf => this.isInMainArea(leaf));
    }

    /**
     * Get or create a leaf in the web viewer group (LEFT side in paired layout).
     * This ensures new web viewers are created alongside existing web viewers,
     * even when focus is on right-side notes.
     */
    getOrCreateWebViewerLeaf(): WorkspaceLeaf {
        const workspace = this.app.workspace;
        const mainLeaves = this.getMainAreaLeaves();

        if (mainLeaves.length === 0) {
            return workspace.getLeaf('tab');
        }

        // Find an existing web viewer to determine the "left" group
        const webViewerLeaf = mainLeaves.find(l =>
            l.view.getViewType() === 'webviewer' ||
            l.view.getViewType() === 'surfing-view'
        );

        if (webViewerLeaf && webViewerLeaf.parent) {
            // Create new tab in the same group as existing web viewers
            return workspace.createLeafInParent(webViewerLeaf.parent, -1);
        }

        // No web viewers exist - check if we have multiple groups (paired layout)
        const tabGroups = new Map<any, WorkspaceLeaf[]>();
        for (const leaf of mainLeaves) {
            if (!leaf.parent) continue;
            if (!tabGroups.has(leaf.parent)) {
                tabGroups.set(leaf.parent, []);
            }
            tabGroups.get(leaf.parent)!.push(leaf);
        }

        // If single group, just use getLeaf
        if (tabGroups.size <= 1) {
            return workspace.getLeaf('tab');
        }

        // Multiple groups exist - find the one WITHOUT markdown (likely the left/web group)
        // Or if all have markdown, use the first one (typically left)
        for (const [parent, leaves] of tabGroups.entries()) {
            const hasMarkdown = leaves.some(l => l.view?.getViewType() === 'markdown');
            if (!hasMarkdown) {
                // This group has no markdown - it's likely the web viewer group
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

    /**
     * Open a URL - focus existing tab if already open, otherwise create new
     * Creates new web viewers in the LEFT (web viewer) group for paired layouts
     */
    private async openUrlInWebViewer(url: string): Promise<void> {
        const leaves = this.app.workspace.getLeavesOfType('webviewer')
            .concat(this.app.workspace.getLeavesOfType('surfing-view'));

        for (const leaf of leaves) {
            const state = leaf.view.getState();
            if (state?.url === url) {
                this.app.workspace.revealLeaf(leaf);
                return;
            }
        }

        // Create new web viewer - respect preferWebViewerLeft setting
        const settings = this.getSettings();
        const leaf = settings.preferWebViewerLeft
            ? this.getOrCreateWebViewerLeaf()
            : this.app.workspace.getLeaf('tab');
        await leaf.setViewState({
            type: 'webviewer',
            state: { url, navigate: true }
        });
        this.app.workspace.revealLeaf(leaf);
    }
}
