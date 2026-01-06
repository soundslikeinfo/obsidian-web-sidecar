import { App, Modal, Setting, TFolder, normalizePath } from 'obsidian';
import type { WebSidecarSettings } from '../types';

/**
 * Modal for creating a new note with URL pre-filled and optional captured content
 */
export class CreateNoteModal extends Modal {
    private url: string;
    private settings: WebSidecarSettings;
    private noteTitle: string = '';
    private onNoteCreated: (path: string) => void;
    private capturedContent: string | null;
    private includeContent: boolean;

    constructor(
        app: App,
        url: string,
        settings: WebSidecarSettings,
        onNoteCreated: (path: string) => void,
        capturedContent?: string | null
    ) {
        super(app);
        this.url = url;
        this.settings = settings;
        this.onNoteCreated = onNoteCreated;
        this.capturedContent = capturedContent ?? null;
        // Default to include content if we have it
        this.includeContent = !!this.capturedContent;

        // Generate default title from URL
        this.noteTitle = this.generateTitleFromUrl(url);
    }

    /**
     * Resolve folder path based on settings - uses vault config or custom path
     */
    private getFolderPath(): string {
        if (this.settings.useVaultDefaultLocation) {
            // @ts-expect-error - Internal API: vault.getConfig is not typed
            const newFileLocation: 'root' | 'current' | 'folder' = this.app.vault.getConfig?.('newFileLocation') ?? 'root';

            if (newFileLocation === 'folder') {
                // @ts-expect-error - Internal API: vault.getConfig is not typed
                return this.app.vault.getConfig?.('newFileFolderPath') || '';
            } else if (newFileLocation === 'current') {
                // Use folder of currently active file
                const activeFile = this.app.workspace.getActiveFile();
                return activeFile?.parent?.path || '';
            }
            // 'root' or default
            return '';
        }
        return this.settings.newNoteFolderPath;
    }

    private generateTitleFromUrl(url: string): string {
        try {
            let urlWithProtocol = url;
            if (!url.match(/^https?:\/\//)) {
                urlWithProtocol = 'https://' + url;
            }
            const parsed = new URL(urlWithProtocol);

            // Try to get a meaningful title from the pathname
            const pathname = parsed.pathname.replace(/\/$/, '');
            if (pathname && pathname !== '/') {
                const lastSegment = pathname.split('/').pop() || '';
                // Clean up the segment
                const cleaned = lastSegment
                    .replace(/[-_]/g, ' ')
                    .replace(/\.[^.]+$/, '') // Remove file extension
                    .trim();
                if (cleaned) {
                    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
                }
            }

            // Fall back to hostname
            return parsed.hostname.replace(/^www\./, '');
        } catch {
            return 'New Note';
        }
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', { text: 'Create note for URL' });

        // Show the URL
        const urlDisplay = contentEl.createEl('div', { cls: 'web-sidecar-url-display' });
        urlDisplay.createEl('code', { text: this.url });

        // Note title input
        new Setting(contentEl)
            .setName('Note title')
            .addText(text => text
                .setValue(this.noteTitle)
                .setPlaceholder('Enter note title')
                .onChange(value => {
                    this.noteTitle = value;
                }));

        // Folder display (read-only info)
        const folderPath = this.getFolderPath();
        const folderDisplay = folderPath || '(vault root)';
        new Setting(contentEl)
            .setName('Folder')
            .setDesc(`Note will be created in: ${folderDisplay}`);

        // Property display
        new Setting(contentEl)
            .setName('URL property')
            .setDesc(`Will be saved as: ${this.settings.primaryUrlProperty}`);

        // Content capture toggle (only show if content was captured)
        if (this.capturedContent) {
            new Setting(contentEl)
                .setName('Include page content')
                .setDesc('Add the web page content as markdown to the note')
                .addToggle(toggle => toggle
                    .setValue(this.includeContent)
                    .onChange(value => {
                        this.includeContent = value;
                    }));
        }

        // Buttons
        const buttonContainer = contentEl.createDiv({ cls: 'web-sidecar-modal-buttons' });

        const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel' });
        cancelBtn.addEventListener('click', () => this.close());

        const createBtn = buttonContainer.createEl('button', {
            text: 'Create note',
            cls: 'mod-cta'
        });
        createBtn.addEventListener('click', () => this.createNote());
    }

    private async createNote(): Promise<void> {
        if (!this.noteTitle.trim()) {
            // Show error
            return;
        }

        const fileName = this.sanitizeFileName(this.noteTitle) + '.md';
        const folderPath = this.getFolderPath();
        const fullPath = folderPath ? normalizePath(`${folderPath}/${fileName}`) : fileName;

        // Create folder if it doesn't exist
        if (folderPath) {
            const folder = this.app.vault.getAbstractFileByPath(folderPath);
            if (!folder) {
                await this.app.vault.createFolder(folderPath);
            }
        }

        // Check if file already exists
        const existingFile = this.app.vault.getAbstractFileByPath(fullPath);
        if (existingFile) {
            // Could show error or append number
            const timestamp = Date.now();
            const newPath = folderPath
                ? normalizePath(`${folderPath}/${this.sanitizeFileName(this.noteTitle)}-${timestamp}.md`)
                : `${this.sanitizeFileName(this.noteTitle)}-${timestamp}.md`;
            await this.createNoteAtPath(newPath);
        } else {
            await this.createNoteAtPath(fullPath);
        }
    }

    private async createNoteAtPath(path: string): Promise<void> {
        const content = this.generateNoteContent();

        try {
            await this.app.vault.create(path, content);
            this.onNoteCreated(path);
            this.close();
        } catch (error) {
            console.error('Failed to create note:', error);
        }
    }

    private generateNoteContent(): string {
        const lines = [
            '---',
            `${this.settings.primaryUrlProperty}: ${this.url}`,
            '---',
            '',
            `# ${this.noteTitle}`,
            '',
        ];

        // Add captured content if enabled
        if (this.includeContent && this.capturedContent) {
            lines.push(this.capturedContent);
            lines.push('');
        }

        return lines.join('\n');
    }

    private sanitizeFileName(name: string): string {
        // Remove characters that are invalid in file names
        return name
            .replace(/[\\/:*?"<>|]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    onClose(): void {
        const { contentEl } = this;
        contentEl.empty();
    }
}

