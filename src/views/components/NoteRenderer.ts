
import { TFile } from 'obsidian';
import { extractDomain } from '../../services/urlUtils';
import { IWebSidecarView } from '../../types';
import { ContextMenus } from './ContextMenus';

export class NoteRenderer {
    private view: IWebSidecarView;
    private contextMenus: ContextMenus;

    constructor(view: IWebSidecarView, contextMenus: ContextMenus) {
        this.view = view;
        this.contextMenus = contextMenus;
    }

    /**
     * Render a single note item in a list
     * @param pairedOpen - If true, clicking note name opens both web viewer AND note (for recent/domain sections)
     */
    renderNoteItem(list: HTMLElement, file: TFile, url: string, pairedOpen: boolean = false): void {
        const li = list.createEl('li', { cls: 'web-sidecar-item' });

        // Context menu on the entire item, not just the link
        li.addEventListener('contextmenu', (e) => this.contextMenus.showNoteContextMenu(e, file, url));

        const link = li.createEl('div', {
            text: file.basename,
            cls: 'web-sidecar-link clickable',
            attr: { tabindex: '0' }
        });

        link.addEventListener('click', async (e) => {
            e.preventDefault();
            if (pairedOpen) {
                await this.view.openPaired(file, url, e);
            } else {
                this.view.openNoteSmartly(file, e);
            }
        });

        // Show URL snippet - always just opens web viewer (not paired)
        const urlSnippet = li.createEl('div', {
            cls: 'web-sidecar-url-snippet clickable',
            attr: { tabindex: '0', title: 'Open in web viewer' }
        });
        const domain = extractDomain(url);
        urlSnippet.setText(domain || url);
        urlSnippet.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.view.openUrlSmartly(url, e);
        });
    }
}
