
import { App, TFile, WorkspaceLeaf } from 'obsidian';
import { CreateNoteModal } from '../modals/createNoteModal';
import { TrackedWebViewer, WebSidecarSettings } from '../types';
import { findMatchingNotes } from './noteMatcher';
import type { UrlIndex } from './UrlIndex';

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
            const newLeaf = this.app.workspace.getLeaf('split', 'vertical');
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
        await this.openUrlInWebViewer(url);
        this.isManualRefreshCallback(true);
        this.onRefreshCallback();
    }

    /**
     * Open a new empty web viewer
     */
    async openNewWebViewer(): Promise<void> {
        this.isManualRefreshCallback(true);
        const leaf = this.app.workspace.getLeaf('tab');
        await leaf.setViewState({
            type: 'webviewer',
            state: { url: 'about:blank', navigate: true }
        });
        this.app.workspace.revealLeaf(leaf);
        // Allow workspace to register the new leaf before refreshing
        await new Promise(resolve => setTimeout(resolve, 50));
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
                const newNoteLeaf = this.app.workspace.createLeafBySplit(webLeaf, 'vertical');
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
            webLeaf = this.app.workspace.getLeaf('tab');
        }

        await webLeaf.setViewState({
            type: 'webviewer',
            state: { url, navigate: true }
        });

        if (noteLeaf) {
            this.app.workspace.revealLeaf(noteLeaf);
        } else if (settings.noteOpenBehavior === 'split') {
            const newNoteLeaf = this.app.workspace.createLeafBySplit(webLeaf, 'vertical');
            await newNoteLeaf.openFile(file);
        } else {
            const newNoteLeaf = this.app.workspace.getLeaf('tab');
            await newNoteLeaf.openFile(file);
        }
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
                return;
            }
        }
        // Fallback: try getLeafById if it works with internal IDs
        const leaf = this.app.workspace.getLeafById(leafId);
        if (leaf) {
            leaf.detach();
        }
        this.isManualRefreshCallback(true);
        this.onRefreshCallback();
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
    }

    /**
     * Open a URL - focus existing tab if already open, otherwise create new
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

        const leaf = this.app.workspace.getLeaf('tab');
        await leaf.setViewState({
            type: 'webviewer',
            state: { url, navigate: true }
        });
        this.app.workspace.revealLeaf(leaf);
    }
}
