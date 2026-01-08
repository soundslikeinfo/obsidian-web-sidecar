import { Notice, setIcon, TFile } from 'obsidian';
import type { IWebSidecarView, AppWithCommands, ObsidianCommand, TrackedWebViewer, VirtualTab } from '../types';
import type { NavigationService } from '../services/NavigationService';
import type { TabStateService } from '../services/TabStateService';
import { RefactoringLogger } from '../utils/RefactoringLogger';

export class ViewEventHandler {
    constructor(
        private view: IWebSidecarView,
        private navigationService: NavigationService,
        private tabStateService: TabStateService
    ) { }

    handleTabDrop(draggedLeafId: string, targetLeafId: string): void {
        RefactoringLogger.log('DragDrop', { type: 'tab', dragged: draggedLeafId, target: targetLeafId });

        // Auto-switch to manual mode if not already
        if (this.view.settings.tabSortOrder !== 'manual') {
            this.view.settings.tabSortOrder = 'manual';
            // Update the nav-header icon to show we're in manual mode
            // This requires calling view.render(true) or exposing updateSortButtonIcon
            // For now, render(true) in view will handle UI update of sort button if it checks settings?
            // Actually view.updateSortButtonIcon is private. 
            // We should rely on state update + render.
        }

        // Initialize order from current visible order if empty
        let currentOrder = [...this.view.settings.manualTabOrder];
        if (currentOrder.length === 0) {
            currentOrder = this.view.trackedTabs.map(t => t.leafId);
        }

        // Remove dragged item
        const draggedIdx = currentOrder.indexOf(draggedLeafId);
        if (draggedIdx > -1) {
            currentOrder.splice(draggedIdx, 1);
        }

        // Insert before target
        const targetIdx = currentOrder.indexOf(targetLeafId);
        if (targetIdx > -1) {
            currentOrder.splice(targetIdx, 0, draggedLeafId);
        } else {
            currentOrder.push(draggedLeafId);
        }

        // All three steps required for immediate visual feedback of manual sort order
        this.view.setManualRefresh(true);
        void this.view.saveManualTabOrder(currentOrder);
        this.view.onRefresh();
        this.view.render(true);
    }

    handleSectionDrop(draggedId: string, targetId: string): void {
        RefactoringLogger.log('DragDrop', { type: 'section', dragged: draggedId, target: targetId });

        const currentOrder = [...this.view.settings.sectionOrder];

        // Remove dragged item
        const draggedIdx = currentOrder.indexOf(draggedId);
        if (draggedIdx > -1) {
            currentOrder.splice(draggedIdx, 1);
        }

        // Insert before target
        const targetIdx = currentOrder.indexOf(targetId);
        if (targetIdx > -1) {
            currentOrder.splice(targetIdx, 0, draggedId);
        } else {
            currentOrder.push(draggedId);
        }

        // Update settings and persist
        this.view.settings.sectionOrder = currentOrder;
        this.view.setManualRefresh(true);
        void this.view.saveSettingsFn();
        this.view.onRefresh();
    }

    openCreateNoteModal(url: string, leafId?: string): void {
        const event = new CustomEvent('web-sidecar:create-note', {
            detail: { url, leafId }
        });
        window.dispatchEvent(event);
    }

    async pinTab(tab: TrackedWebViewer | VirtualTab): Promise<void> {
        await this.tabStateService.addPinnedTab(tab);
        this.view.render(true);
    }

    async unpinTab(pinId: string): Promise<void> {
        await this.tabStateService.removePinnedTab(pinId);
        this.view.render(true);
    }

    async reorderPinnedTabs(movedPinId: string, targetPinId: string): Promise<void> {
        await this.tabStateService.reorderPinnedTabs(movedPinId, targetPinId);
        // service calls refresh, but view render might be needed if not triggered automatically
    }
}
