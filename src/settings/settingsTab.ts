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
				.addOption('browser', 'Browser mode (compact, favicon + title)')
				.addOption('notes', 'Notes mode (detailed, shows URLs)')
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
				.addOption('manual', 'Manual (drag to reorder)')
				.setValue(this.plugin.settings.tabSortOrder)
				.onChange(async (value) => {
					this.plugin.settings.tabSortOrder = value as 'focus' | 'title' | 'manual';
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
				.addOption('tab', 'Open in tab group with focus')
				.setValue(this.plugin.settings.noteOpenBehavior)
				.onChange(async (value) => {
					this.plugin.settings.noteOpenBehavior = value as 'split' | 'tab';
					await this.plugin.saveSettings();
					// Re-render to show/hide tab group placement options
					this.display();
				}));

		// Opening Behavior for Tab Groups (only show when notes open to the right)
		if (this.plugin.settings.noteOpenBehavior === 'split') {
			containerEl.createEl('h3', { text: 'Opening behavior for tab groups' });

			new Setting(containerEl)
				.setName('Prefer to open web viewers in the left tab group')
				.setDesc('When opening new web viewers, place them alongside existing web viewers (left side in paired layouts)')
				.addToggle(toggle => toggle
					.setValue(this.plugin.settings.preferWebViewerLeft)
					.onChange(async (value) => {
						this.plugin.settings.preferWebViewerLeft = value;
						await this.plugin.saveSettings();
					}));

			new Setting(containerEl)
				.setName('Prefer to open notes in the right tab group')
				.setDesc('When opening notes, place them alongside existing notes (right side in paired layouts)')
				.addToggle(toggle => toggle
					.setValue(this.plugin.settings.preferNotesRight)
					.onChange(async (value) => {
						this.plugin.settings.preferNotesRight = value;
						await this.plugin.saveSettings();
					}));
		}

		// ============================================
		// AUX SECTIONS
		// ============================================
		const auxSectionsContainer = containerEl.createDiv({ cls: 'web-sidecar-settings-group' });
		auxSectionsContainer.createEl('div', { text: 'Aux Sections', cls: 'web-sidecar-settings-group-title' });

		new Setting(auxSectionsContainer)
			.setName('Recent web notes')
			.setDesc('Show section with recently modified notes that have URLs')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableRecentNotes)
				.onChange(async (value) => {
					this.plugin.settings.enableRecentNotes = value;
					await this.plugin.saveSettings();
				}));

		new Setting(auxSectionsContainer)
			.setName('Grouped by domain')
			.setDesc('Show section with notes grouped by their domain')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableTldSearch)
				.onChange(async (value) => {
					this.plugin.settings.enableTldSearch = value;
					await this.plugin.saveSettings();
				}));

		new Setting(auxSectionsContainer)
			.setName('All Tags')
			.setDesc('Show section with notes grouped by their tags')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableTagGrouping)
				.onChange(async (value) => {
					this.plugin.settings.enableTagGrouping = value;
					await this.plugin.saveSettings();
				}));

		new Setting(auxSectionsContainer)
			.setName('Tag selection')
			.setDesc('Show section with notes grouped by specific tags')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableSelectedTagGrouping)
				.onChange(async (value) => {
					this.plugin.settings.enableSelectedTagGrouping = value;
					await this.plugin.saveSettings();
					// Re-render to show/hide allowlist
					this.display();
				}));

		if (this.plugin.settings.enableSelectedTagGrouping) {
			new Setting(auxSectionsContainer)
				.setName('Selected tags allowlist')
				.setDesc('Enter tags to group by, separated by commas (e.g. #todo, #research)')
				.setClass('web-sidecar-sub-setting')
				.addText(text => text
					.setPlaceholder('#todo, #research')
					.setValue(this.plugin.settings.selectedTagsAllowlist)
					.onChange(async (value) => {
						this.plugin.settings.selectedTagsAllowlist = value;
						await this.plugin.saveSettings();
					}));
		}

		new Setting(auxSectionsContainer)
			.setName('Subreddit notes explorer')
			.setDesc('Show section with notes grouped by subreddit (e.g., r/macApps)')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableSubredditExplorer)
				.onChange(async (value) => {
					this.plugin.settings.enableSubredditExplorer = value;
					await this.plugin.saveSettings();
				}));

		new Setting(auxSectionsContainer)
			.setName('Group YouTube Channels')
			.setDesc('Show section with notes grouped by YouTube channel. Configure channel property fields in Domain Rules → youtube.com.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableYouTubeChannelExplorer)
				.onChange(async (value) => {
					this.plugin.settings.enableYouTubeChannelExplorer = value;
					await this.plugin.saveSettings();
				}));

		// ============================================
		// DOMAIN RULES
		// ============================================
		const domainRulesContainer = containerEl.createDiv({ cls: 'web-sidecar-settings-group' });
		domainRulesContainer.createEl('div', { text: 'Domain Rules', cls: 'web-sidecar-settings-group-title' });

		domainRulesContainer.createEl('h4', { text: 'reddit.com', cls: 'web-sidecar-sub-heading' });

		new Setting(domainRulesContainer)
			.setName('Reveal other notes from the same subreddit')
			.setDesc('Filter "More notes from this domain" to show only notes from the same subreddit as the current page.')
			.setClass('web-sidecar-sub-setting')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableSubredditFilter)
				.onChange(async (value) => {
					this.plugin.settings.enableSubredditFilter = value;
					await this.plugin.saveSettings();
				}));

		domainRulesContainer.createEl('h4', { text: 'youtube.com', cls: 'web-sidecar-sub-heading' });

		new Setting(domainRulesContainer)
			.setName('Reveal other notes from the same YouTube channel')
			.setDesc('Filter "More notes from this domain" to show only notes from the same channel.')
			.setClass('web-sidecar-sub-setting')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableYouTubeChannelFilter)
				.onChange(async (value) => {
					this.plugin.settings.enableYouTubeChannelFilter = value;
					await this.plugin.saveSettings();
				}));

		new Setting(domainRulesContainer)
			.setName('Channel name property fields')
			.setDesc('Frontmatter properties containing channel name, in priority order (first match wins)')
			.setClass('web-sidecar-sub-setting')
			.addText(text => text
				.setPlaceholder('channel_name, author')
				.setValue(this.plugin.settings.youtubeChannelPropertyFields.join(', '))
				.onChange(async (value) => {
					this.plugin.settings.youtubeChannelPropertyFields = value
						.split(',')
						.map(s => s.trim())
						.filter(s => s.length > 0);
					await this.plugin.saveSettings();
				}));

		domainRulesContainer.createEl('div', {
			text: 'More coming soon...',
			cls: 'setting-item-description',
			attr: { style: 'font-style: italic; padding-left: 14px; margin-top: 8px;' }
		});

		// Experimental Section
		containerEl.createEl('h3', { text: 'Experimental' });

		containerEl.createEl('div', {
			text: '⚠️ Disclaimer: Experimental features may be unstable or break with Obsidian updates. Use with caution.',
			cls: 'setting-item-description'
		});

		// Pinned Tabs Section (Moved)
		containerEl.createEl('h4', { text: 'Pinned Tabs', cls: 'web-sidecar-sub-heading' });

		new Setting(containerEl)
			.setName('Enable Pinned Web View Tabs')
			.setDesc('Allow pinning web views to the top of the sidecar')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enablePinnedTabs)
				.onChange(async (value) => {
					this.plugin.settings.enablePinnedTabs = value;
					await this.plugin.saveSettings();
					this.display();
				}));

		if (this.plugin.settings.enablePinnedTabs) {
			new Setting(containerEl)
				.setName('Pinned property key')
				.setDesc('Frontmatter property used to identify notes linked to pins (e.g. pinned-status)')
				.setClass('web-sidecar-sub-setting')
				.addText(text => text
					.setPlaceholder('pinned-status')
					.setValue(this.plugin.settings.pinnedPropertyKey)
					.onChange(async (value) => {
						this.plugin.settings.pinnedPropertyKey = value;
						await this.plugin.saveSettings();
					}));

			new Setting(containerEl)
				.setName('Pinned property value')
				.setDesc('Value for the property that marks a note as pinned source (e.g. sidecar)')
				.setClass('web-sidecar-sub-setting')
				.addText(text => text
					.setPlaceholder('sidecar')
					.setValue(this.plugin.settings.pinnedPropertyValue)
					.onChange(async (value) => {
						this.plugin.settings.pinnedPropertyValue = value;
						await this.plugin.saveSettings();
					}));
		}

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
			containerEl.createEl('h4', { text: 'Action row', cls: 'web-sidecar-sub-heading' });

			new Setting(containerEl)
				.setName('New web viewer button')
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
			containerEl.createEl('h4', { text: 'More options menu', cls: 'web-sidecar-sub-heading' });

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
