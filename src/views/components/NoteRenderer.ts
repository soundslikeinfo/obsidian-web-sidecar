
import { TFile, setIcon } from 'obsidian';
import { extractDomain } from '../../services/urlUtils';
import { getFaviconUrl } from '../../services/faviconUtils';
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
    renderNoteItem(list: HTMLElement, file: TFile, url: string, pairedOpen: boolean = false, showDomain: boolean = true): void {
        const li = list.createEl('li', { cls: 'web-sidecar-item web-sidecar-row-item' });

        // Context menu on the entire item
        li.addEventListener('contextmenu', (e) => this.contextMenus.showNoteContextMenu(e, file, url));

        const domain = extractDomain(url);

        // 1. Note Link (Left side - Title + Subtitle)
        const noteLink = li.createEl('div', {
            cls: 'web-sidecar-row-main clickable',
            attr: { 'aria-label': 'Open note' }
        });

        // Title
        noteLink.createDiv({
            text: file.basename,
            cls: 'web-sidecar-row-title'
        });

        // Subtitle
        if (showDomain) {
            noteLink.createDiv({
                text: domain || url,
                cls: 'web-sidecar-row-subtitle'
            });
        }

        noteLink.addEventListener('click', (e) => {
            e.preventDefault();
            if (pairedOpen) {
                void this.view.openPaired(file, url, e);
            } else {
                void this.view.openNoteSmartly(file, e);
            }
        });

        // 2. Web Link (Right side - Favicon/Icon)

        const webBtn = li.createEl('div', {
            cls: 'web-sidecar-row-action clickable-icon',
            attr: { 'aria-label': `Open ${domain || 'link'}` }
        });

        if (domain) {
            webBtn.createEl('img', {
                cls: 'web-sidecar-row-favicon',
                attr: {
                    src: getFaviconUrl(domain, 16),
                    width: '14',
                    height: '14',
                    alt: ''
                }
            });
            // Fallback handled by CSS or generic icon
            // But we can fallback if domain is missing
        } else {
            setIcon(webBtn, 'external-link');
        }

        webBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            void this.view.openUrlSmartly(url, e);
        });
    }
}
