# Web Sidecar

Elevate the web viewer with a sleek, vertical tab interface designed for rediscovering your web-linked notes. Track all your open web pages, see matching notes from your vault, and seamlessly navigate between web content and your notes.

## Features

🌐 Track all open web viewer tabs in one sidebar  
📝 See linked notes for each URL automatically  
🔗 Smart URL matching with frontmatter properties  
📂 Group notes by domain, subreddit, or YouTube channel  
⚡ Quick actions: create notes, open URLs, focus tabs  
🎯 Paired view: open web page + note side-by-side  
📌 Pin frequently visited pages for quick access  
🔄 Real-time updates as you browse  
📋 Capture page content using [Defuddle](https://github.com/kepano/defuddle) (same as Save to vault)  

## Changelog

See [CHANGELOG](CHANGELOG.md) for version history.

## Installation

### From Obsidian Community Plugins
1. Open **Settings → Community plugins**
2. Turn off Safe Mode if prompted
3. Click **Browse** and search for "Web Sidecar"
4. Install the plugin and enable it

### Manual Installation
1. Download the latest release from GitHub
2. Extract files into your vault's `.obsidian/plugins/web-sidecar/` directory
3. Enable the plugin in **Settings → Community plugins**

## Configuration

1. Open **Settings → Web Sidecar**
2. Configure URL property fields (default: `source`, `url`, `URL`)
3. Set your preferred note folder and display options

### Key Settings

| Setting | Description |
|---------|-------------|
| URL property fields | Frontmatter properties to search for URLs |
| Tab appearance | Basic mode or Linked notes mode |
| Note open behavior | Split view or new tab |
| Recent notes count | Number of recent notes to show |
| Capture page content | Extract and save web page content using Defuddle |

## Usage

### Basic Workflow

1. Open a web page in Obsidian's web viewer
2. The Web Sidecar sidebar automatically shows matching notes
3. Click notes to open them, or create new notes for the current URL
4. Right-click for additional options like paired opening

### Auxiliary Sections

- **Recent web notes** — Recently modified notes with URLs
- **Group by domain** — All web notes organized by website
- **Group by subreddit** — Reddit notes grouped by community
- **Group by YouTube channel** — YouTube notes grouped by creator

### Pinned Tabs

Pin frequently visited pages for quick access. Pinned tabs persist across sessions and can track URL redirects.

## Features in Detail

### Smart URL Matching
- Matches notes based on frontmatter URL properties
- Supports both single URLs and arrays: `source: https://...` or `source: [https://..., ...]`

### Virtual Tabs
Notes with URLs that aren't currently open appear as "virtual tabs" — click to open the URL in a new web viewer.

### Paired Opening
Open a web page and its linked note side-by-side via right-click context menu.

### Domain Grouping
See all notes from the same domain at a glance. Sort by name, count, or recency.

## Privacy & Network Usage

This plugin operates locally and does not connect to any AI services, analytics, or telemetry. Your vault contents and browsing activity remain private.

**External service used:**
- **Google Favicons API** — Used to display website icons (favicons) in the sidebar. Only the domain name is sent to fetch the icon (e.g., `google.com/s2/favicons?domain=example.com`). No other data is transmitted.

## Support

- For bugs or feature requests, please [open an issue](https://github.com/soundslikeinfo/obsidian-web-sidecar/issues)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Frequently Asked Questions

### How does the plugin find my web notes?
The plugin looks for notes with a URL property (default: `source`) in the frontmatter. You can customize which properties to search in the settings.

### Why doesn't my note appear in the sidebar?
Make sure your note has a URL property in its frontmatter that matches the web page URL. Check **Settings → Web Sidecar → URL property fields**.

---

### 🧠 Crafted with AI & Human Creativity
```
🎨 Design & Development
Greg K. (@soundslikeinfo)

🤖 AI Pair Programming
- Claude by Anthropic
- Gemini 3 by Google
```

### 💝 Support the Project

[![GitHub Stars](https://img.shields.io/github/stars/soundslikeinfo/obsidian-web-sidecar?style=social)](https://github.com/soundslikeinfo/obsidian-web-sidecar)
[![Buy Me A Coffee](https://img.shields.io/badge/-buy_me_a%C2%A0coffee-gray?logo=buy-me-a-coffee)](https://www.buymeacoffee.com/soundslikeinfo)

Made with ❤️ for the Obsidian Community
