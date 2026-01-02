import { App, PluginSettingTab, Setting } from 'obsidian';
import type WebSidecarPlugin from '../main';
import { DEFAULT_SETTINGS } from '../types';

/**
 * Settings tab for Web Sidecar plugin
 */
export class WebSidecarSettingTab extends PluginSettingTab {
	plugin: WebSidecarPlugin;

	constructor(app: App, plugin: WebSidecarPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: 'Web Sidecar Settings' });

		// URL Property Fields
		new Setting(containerEl)
			.setName('URL property fields')
			.setDesc('Comma-separated list of frontmatter property names to search for URLs (e.g., source, url, URL)')
			.addText(text => text
				.setPlaceholder('source, url, URL')
				.setValue(this.plugin.settings.urlPropertyFields.join(', '))
				.onChange(async (value) => {
					this.plugin.settings.urlPropertyFields = value
						.split(',')
						.map(s => s.trim())
						.filter(s => s.length > 0);
					await this.plugin.saveSettings();
				}));

		// Primary URL Property
		new Setting(containerEl)
			.setName('Primary URL property')
			.setDesc('Property name used when creating new notes with URL')
			.addText(text => text
				.setPlaceholder('source')
				.setValue(this.plugin.settings.primaryUrlProperty)
				.onChange(async (value) => {
					this.plugin.settings.primaryUrlProperty = value.trim() || DEFAULT_SETTINGS.primaryUrlProperty;
					await this.plugin.saveSettings();
				}));

		// Enable TLD Search
		new Setting(containerEl)
			.setName('Enable domain search')
			.setDesc('Show expanded section with notes from the same domain')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableTldSearch)
				.onChange(async (value) => {
					this.plugin.settings.enableTldSearch = value;
					await this.plugin.saveSettings();
				}));

		// New Note Folder Path
		new Setting(containerEl)
			.setName('New note folder')
			.setDesc('Default folder for new notes created from this plugin (leave empty for vault root)')
			.addText(text => text
				.setPlaceholder('Folder/Subfolder')
				.setValue(this.plugin.settings.newNoteFolderPath)
				.onChange(async (value) => {
					this.plugin.settings.newNoteFolderPath = value.trim();
					await this.plugin.saveSettings();
				}));

		// Recent Notes Count
		new Setting(containerEl)
			.setName('Recent notes count')
			.setDesc('Number of recent notes with URLs to show when no web viewer is active')
			.addSlider(slider => slider
				.setLimits(5, 20, 1)
				.setValue(this.plugin.settings.recentNotesCount)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.recentNotesCount = value;
					await this.plugin.saveSettings();
				}));

		// Tab Appearance Mode
		new Setting(containerEl)
			.setName('Tab appearance')
			.setDesc('Choose how tabs are displayed in the sidebar')
			.addDropdown(dropdown => dropdown
				.addOption('notes', 'Notes mode (detailed, shows URLs)')
				.addOption('browser', 'Browser mode (compact, favicon + title)')
				.setValue(this.plugin.settings.tabAppearance)
				.onChange(async (value) => {
					this.plugin.settings.tabAppearance = value as 'notes' | 'browser';
					await this.plugin.saveSettings();
				}));

		// Tab Sort Order
		new Setting(containerEl)
			.setName('Tab sort order')
			.setDesc('How to sort open web viewer tabs')
			.addDropdown(dropdown => dropdown
				.addOption('focus', 'Recently focused')
				.addOption('title', 'Alphabetical by title')
				.setValue(this.plugin.settings.tabSortOrder)
				.onChange(async (value) => {
					this.plugin.settings.tabSortOrder = value as 'focus' | 'title';
					await this.plugin.saveSettings();
				}));

		// Collapse Duplicate URLs
		new Setting(containerEl)
			.setName('Collapse duplicate URLs')
			.setDesc('Show only one entry per URL. Click to cycle through open instances.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.collapseDuplicateUrls)
				.onChange(async (value) => {
					this.plugin.settings.collapseDuplicateUrls = value;
					await this.plugin.saveSettings();
				}));

		// Note Opening Behavior
		new Setting(containerEl)
			.setName('Note opening behavior')
			.setDesc('How to open notes when clicked from the sidebar')
			.addDropdown(dropdown => dropdown
				.addOption('split', 'Open to the right')
				.addOption('tab', 'Open in new tab')
				.setValue(this.plugin.settings.noteOpenBehavior)
				.onChange(async (value) => {
					this.plugin.settings.noteOpenBehavior = value as 'split' | 'tab';
					await this.plugin.saveSettings();
				}));

		// Domain Rules Section
		containerEl.createEl('h3', { text: 'Domain Rules' });

		containerEl.createEl('h4', { text: 'reddit.com', cls: 'web-sidecar-sub-heading' });

		new Setting(containerEl)
			.setName('Reveal other notes from the same subreddit')
			.setDesc('Filter "More notes from this domain" to show only notes from the same subreddit as the current page.')
			.setClass('web-sidecar-sub-setting')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableSubredditFilter)
				.onChange(async (value) => {
					this.plugin.settings.enableSubredditFilter = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Turn on subreddit notes explorer')
			.setDesc('Add new section of notes grouped by subreddit (e.g., r/macApps)')
			.setClass('web-sidecar-sub-setting')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableSubredditExplorer)
				.onChange(async (value) => {
					this.plugin.settings.enableSubredditExplorer = value;
					await this.plugin.saveSettings();
				}));

		// Experimental Section
		containerEl.createEl('h3', { text: 'Experimental' });

		new Setting(containerEl)
			.setName('Web viewer header actions')
			.setDesc('Add a "New web view tab" button to web viewer headers and menus. May break with Obsidian updates.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableWebViewerActions)
				.onChange(async (value) => {
					this.plugin.settings.enableWebViewerActions = value;
					await this.plugin.saveSettings();
					// Re-render to show/hide sub-options
					this.display();
				}));

		// Sub-options (only show if main toggle is enabled)
		if (this.plugin.settings.enableWebViewerActions) {
			// Header buttons section
			containerEl.createEl('h4', { text: 'Header Buttons', cls: 'web-sidecar-sub-heading' });

			new Setting(containerEl)
				.setName('New tab button')
				.setDesc('Add ⊕ button to open a new web viewer tab')
				.setClass('web-sidecar-sub-setting')
				.addToggle(toggle => toggle
					.setValue(this.plugin.settings.showWebViewerHeaderButton)
					.onChange(async (value) => {
						this.plugin.settings.showWebViewerHeaderButton = value;
						await this.plugin.saveSettings();
					}));

			new Setting(containerEl)
				.setName('New Note button')
				.addToggle(toggle => toggle
					.setValue(this.plugin.settings.showWebViewerNewNoteButton)
					.onChange(async (value) => {
						this.plugin.settings.showWebViewerNewNoteButton = value;
						await this.plugin.saveSettings();
					}));

			new Setting(containerEl)
				.setName('Create/Open Note button')
				.setDesc('Add button to create or open note for current URL')
				.setClass('web-sidecar-sub-setting')
				.addToggle(toggle => toggle
					.setValue(this.plugin.settings.showWebViewerOpenNoteButton)
					.onChange(async (value) => {
						this.plugin.settings.showWebViewerOpenNoteButton = value;
						await this.plugin.saveSettings();
					}));

			// Menu options section
			new Setting(containerEl)
				.setName('More options menu')
				.setDesc('Add items to the web viewer context menu (3 dots)')
				.setClass('web-sidecar-sub-heading')

			new Setting(containerEl)
				.setName('New web view tab')
				.setDesc('Add "New web view tab" option to menu')
				.setClass('web-sidecar-sub-setting')
				.addToggle(toggle => toggle
					.setValue(this.plugin.settings.showWebViewerMenuOption)
					.onChange(async (value) => {
						this.plugin.settings.showWebViewerMenuOption = value;
						await this.plugin.saveSettings();
					}));

			new Setting(containerEl)
				.setName('Open note to the right')
				.setDesc('Add "Open note to the right" option when viewing URLs that are linked in notes')
				.setClass('web-sidecar-sub-setting')
				.addToggle(toggle => toggle
					.setValue(this.plugin.settings.showWebViewerOpenNoteOption)
					.onChange(async (value) => {
						this.plugin.settings.showWebViewerOpenNoteOption = value;
						await this.plugin.saveSettings();
					}));
		}
	}
}
