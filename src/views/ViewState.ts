import type { WebSidecarSettings } from '../types';

export class ViewState {
    subredditSort: 'alpha' | 'count' = 'alpha';
    domainSort: 'alpha' | 'count' | 'recent' = 'alpha';
    tagSort: 'alpha' | 'count' | 'recent' = 'alpha';
    selectedTagSort: 'alpha' | 'count' | 'recent' = 'alpha';
    isSubredditExplorerOpen: boolean = false;
    isDomainGroupOpen: boolean = false;
    isRecentNotesOpen: boolean = false;
    isTagGroupOpen: boolean = false;
    isSelectedTagGroupOpen: boolean = false;
    isYouTubeChannelExplorerOpen: boolean = false;
    youtubeChannelSort: 'alpha' | 'count' | 'recent' = 'alpha';
    isTwitterExplorerOpen: boolean = false;

    twitterSort: 'alpha' | 'count' | 'recent' = 'alpha';
    isGithubExplorerOpen: boolean = false;
    githubSort: 'alpha' | 'count' | 'recent' = 'alpha';

    expandedGroupIds: Set<string> = new Set();
    isManualRefresh: boolean = false;

    // Track if user is interacting with the sidebar (prevents re-render)
    isInteracting: boolean = false;

    // Track expand state for toggle
    allExpanded: boolean = false;

    constructor(initialSettings?: WebSidecarSettings) {
        if (initialSettings) {
            this.syncFromSettings(initialSettings);
        }
    }

    syncFromSettings(settings: WebSidecarSettings): void {
        this.isRecentNotesOpen = settings.isRecentNotesOpen;
        this.isDomainGroupOpen = settings.isDomainGroupOpen;
        this.isSubredditExplorerOpen = settings.isSubredditExplorerOpen;
        this.isTagGroupOpen = settings.isTagGroupOpen;
        this.isSelectedTagGroupOpen = settings.isSelectedTagGroupOpen;
        this.isYouTubeChannelExplorerOpen = settings.isYouTubeChannelExplorerOpen;
        this.youtubeChannelSort = settings.youtubeChannelSortOrder || 'alpha';
        this.isTwitterExplorerOpen = settings.isTwitterExplorerOpen;
        this.twitterSort = settings.twitterSortOrder || 'alpha';

        this.isGithubExplorerOpen = settings.isGithubExplorerOpen;
        this.githubSort = settings.githubSortOrder || 'alpha';
        this.expandedGroupIds = new Set(settings.expandedGroupIds);
    }
}
