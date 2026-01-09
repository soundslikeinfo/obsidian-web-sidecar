/*
 * Web Sidecar
 * Copyright (c) 2025 soundslikeinfo
 * SPDX-License-Identifier: GPL-3.0-only
 */

import type { IWebSidecarView, TrackedWebViewer, VirtualTab } from '../types';
import type { NavigationService } from '../services/NavigationService';
import type { TabStateService } from '../services/TabStateService';


export class ViewEventHandler {
    constructor(
        private view: IWebSidecarView,
        private navigationService: NavigationService,
        private tabStateService: TabStateService
    ) { }

    handleTabDrop(draggedLeafId: string, targetLeafId: string): void {


        // Auto-switch to manual mode if not already
        if (this.view.settings.tabSortOrder !== 'manual') {
            this.view.settings.tabSortOrder = 'manual';
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

        // Required for immediate visual feedback of manual sort order
        this.view.setManualRefresh(true);
        void this.view.saveManualTabOrder(currentOrder);
        this.view.onRefresh();
        this.view.render(true);
    }

    handleSectionDrop(draggedId: string, targetId: string): void {


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
    }
}
