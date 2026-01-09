/*
 * Web Sidecar
 * Copyright (c) 2025 soundslikeinfo
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { setIcon, TFile } from 'obsidian';
import { IWebSidecarView } from '../../../types';

/**
 * Add a drop zone at the end of the aux container for dropping sections to be last
 */
export function addEndDropZone(view: IWebSidecarView, container: HTMLElement): void {
    // Check if already exists
    if (container.querySelector('.web-sidecar-drop-zone-end')) return;

    const dropZone = container.createDiv({ cls: 'web-sidecar-drop-zone-end' });

    dropZone.ondragover = (e) => {
        // Only accept section drags (check for our custom MIME type)
        if (e.dataTransfer?.types?.includes('text/section-id')) {
            e.preventDefault();
            dropZone.addClass('drag-over');
        }
    };

    dropZone.ondragleave = () => {
        dropZone.removeClass('drag-over');
    };

    dropZone.ondrop = (e) => {
        e.preventDefault();
        dropZone.removeClass('drag-over');
        const draggedId = e.dataTransfer?.getData('text/section-id');
        if (draggedId) {
            // Move dragged item to end
            const currentOrder = [...view.settings.sectionOrder];
            const draggedIdx = currentOrder.indexOf(draggedId);
            if (draggedIdx > -1) {
                currentOrder.splice(draggedIdx, 1);
            }
            currentOrder.push(draggedId);
            view.settings.sectionOrder = currentOrder;
            view.setManualRefresh(true);
            void view.saveSettingsFn(); // Persist changes
            view.onRefresh();
        }
    };
}

/**
 * Add drag-and-drop handlers to a section element
 */
export function addSectionDragHandlers(view: IWebSidecarView, element: HTMLElement, sectionId: string): void {
    element.ondragstart = (e) => {
        // Set both text/plain and custom type for compatibility
        e.dataTransfer?.setData('text/plain', sectionId);
        e.dataTransfer?.setData('text/section-id', sectionId);
        element.addClass('is-dragging');
    };

    element.ondragend = () => {
        element.removeClass('is-dragging');
    };

    element.ondragover = (e) => {
        // Only accept section drags (check for our custom MIME type)
        if (e.dataTransfer?.types?.includes('text/section-id')) {
            e.preventDefault();
            element.addClass('drag-over');
        }
    };

    element.ondragleave = () => {
        element.removeClass('drag-over');
    };

    element.ondrop = (e) => {
        e.preventDefault();
        element.removeClass('drag-over');
        const draggedId = e.dataTransfer?.getData('text/section-id');
        if (draggedId && draggedId !== sectionId) {
            view.handleSectionDrop(draggedId, sectionId);
        }
    };
}

/**
 * Render a small sort button helper
 */
export function renderSortButton(
    container: HTMLElement,
    currentSort: string,
    onSortChange: (sort: 'alpha' | 'count' | 'recent') => void
): void {
    const getSortIcon = (sort: string) => {
        switch (sort) {
            case 'alpha': return 'arrow-down-az';
            case 'count': return 'arrow-down-wide-narrow';
            case 'recent': return 'clock';
            default: return 'arrow-down-az';
        }
    };
    const getSortLabel = (sort: string) => {
        switch (sort) {
            case 'alpha': return 'Sorted by name';
            case 'count': return 'Sorted by count';
            case 'recent': return 'Sorted by recent';
            default: return 'Sorted by name';
        }
    };
    const getNextSort = (sort: string): 'alpha' | 'count' | 'recent' => {
        switch (sort) {
            case 'alpha': return 'count';
            case 'count': return 'recent';
            case 'recent': return 'alpha';
            default: return 'count';
        }
    };

    const sortBtn = container.createEl('button', {
        cls: 'web-sidecar-sort-btn-tiny web-sidecar-align-right clickable-icon',
        attr: { 'aria-label': getSortLabel(currentSort) }
    });
    setIcon(sortBtn, getSortIcon(currentSort));

    sortBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        onSortChange(getNextSort(currentSort));
    };
}

/**
 * Sort groups of matched notes
 */
export function sortGroups<T extends { file: TFile }>(
    map: Map<string, T[]>,
    sortOrder: 'alpha' | 'count' | 'recent'
): [string, T[]][] {
    const getMaxMtime = (notes: { file: TFile }[]) => {
        return Math.max(...notes.map(n => n.file.stat.mtime));
    };

    return Array.from(map.entries()).sort((a, b) => {
        if (sortOrder === 'count') {
            const countDiff = b[1].length - a[1].length;
            if (countDiff !== 0) return countDiff;
        } else if (sortOrder === 'recent') {
            const mtimeDiff = getMaxMtime(b[1]) - getMaxMtime(a[1]);
            if (mtimeDiff !== 0) return mtimeDiff;
        }
        return a[0].localeCompare(b[0]);
    });
}
