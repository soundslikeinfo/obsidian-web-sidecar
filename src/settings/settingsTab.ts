import { App, PluginSettingTab, Setting } from 'obsidian';
import type WebSidecarPlugin from '../main';
import { DEFAULT_SETTINGS } from '../types';
import { renderAuxiliarySectionsSettings, renderDomainRulesSettings } from './settingsSections';
import { renderExperimentalSettings } from './settingsExperimental';

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

		// Use Vault's Default Location Toggle
		new Setting(containerEl)
			.setName('Use vault\'s default location')
			.setDesc('Use the location configured in Obsidian\'s Files & Links settings')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.useVaultDefaultLocation)
				.onChange(async (value) => {
					this.plugin.settings.useVaultDefaultLocation = value;
					await this.plugin.saveSettings();
					this.display();
				}));

		// New Note Folder Path (only show if not using vault default)
		if (!this.plugin.settings.useVaultDefaultLocation) {
			new Setting(containerEl)
				.setName('New note folder')
				.setDesc('Custom folder for new notes created from this plugin (leave empty for vault root)')
				.setClass('web-sidecar-sub-setting')
				.addText(text => text
					.setPlaceholder('Folder/Subfolder')
					.setValue(this.plugin.settings.newNoteFolderPath)
					.onChange(async (value) => {
						this.plugin.settings.newNoteFolderPath = value.trim();
						await this.plugin.saveSettings();
					}));
		}

		// Capture Page Content
		new Setting(containerEl)
			.setName('Capture page content')
			.setDesc('When creating a new linked note, extract and include the page content as markdown using Defuddle (desktop only)')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.capturePageContent)
				.onChange(async (value) => {
					this.plugin.settings.capturePageContent = value;
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

		// Recent Notes Cache Limit
		new Setting(containerEl)
			.setName('Recent notes cache limit')
			.setDesc('Maximum number of recent notes to cache for performance safety')
			.addText(text => text
				.setPlaceholder('150')
				.setValue(String(this.plugin.settings.recentNotesCacheLimit))
				.onChange(async (value) => {
					const limit = parseInt(value);
					if (!isNaN(limit) && limit > 0) {
						this.plugin.settings.recentNotesCacheLimit = limit;
						await this.plugin.saveSettings();
					}
				}));

		new Setting(containerEl)
			.setName('Tab appearance')
			.setDesc('Choose how tabs are displayed in the sidebar')
			.addDropdown(dropdown => {
				dropdown
					.addOption('basic', 'Basic')
					.addOption('linked-mode', 'Linked notes');

				dropdown
					.setValue(this.plugin.settings.tabAppearance)
					.onChange(async (value) => {
						this.plugin.settings.tabAppearance = value as 'linked-mode' | 'basic';
						await this.plugin.saveSettings();
					});
			});

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

		// Linked Note Display Style
		new Setting(containerEl)
			.setName('Linked note display style')
			.setDesc('How to display linked notes based on whether they are open in the workspace')
			.addDropdown(dropdown => dropdown
				.addOption('none', 'Do nothing')
				.addOption('color', 'Muted for closed, accent for open')
				.addOption('style', 'Muted italic for closed, accent for open')
				.setValue(this.plugin.settings.linkedNoteDisplayStyle)
				.onChange(async (value) => {
					this.plugin.settings.linkedNoteDisplayStyle = value as 'none' | 'color' | 'style';
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
					this.display();
				}));

		// Opening Behavior for Tab Groups (only show when notes open to the right)
		if (this.plugin.settings.noteOpenBehavior === 'split') {
			new Setting(containerEl).setName('Opening behavior for tab groups').setHeading();

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

		// Render auxiliary sections settings
		renderAuxiliarySectionsSettings(containerEl, this.plugin, () => this.display());

		// Render domain rules settings
		renderDomainRulesSettings(containerEl, this.plugin);

		// Render experimental settings
		renderExperimentalSettings(containerEl, this.plugin, () => this.display());
	}
}
