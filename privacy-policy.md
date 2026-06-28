# Privacy Policy — YouTube 雙語字幕助手 (Antigravity Dual Sub)

Last updated: 2026-06-28

## Overview

YouTube 雙語字幕助手 is a Chrome extension that displays a translated second subtitle beneath YouTube's native captions. This policy explains what data is accessed and how it is used.

## Data We Access

| Data | Purpose | Stored? |
|------|---------|---------|
| YouTube caption text (currently displayed subtitle) | Send to Google Translate API to produce the second language subtitle | No — processed in memory only |
| Chrome extension settings (target language, font size, opacity) | Remember your preferences across sessions | Yes — stored locally in `chrome.storage.local` on your device only |

## Data We Do NOT Collect

- We do **not** collect, transmit, or store any personal information.
- We do **not** track browsing history or video watch history.
- We do **not** share any data with third parties, except as described below.

## Third-Party Services

Subtitle translation is performed by **Google Translate** (free endpoint at `translate.googleapis.com`). The currently displayed subtitle text is sent to this endpoint to obtain a translation. Please refer to [Google's Privacy Policy](https://policies.google.com/privacy) for information on how Google handles this data.

## Permissions Used

| Permission | Reason |
|------------|--------|
| `storage` | Save user settings (language, font size) locally |
| `scripting` | Inject subtitle overlay into YouTube pages |
| `host_permissions: *.youtube.com` | Read and modify YouTube video pages to display dual subtitles |
| `host_permissions: translate.googleapis.com` | Call Google Translate API from the background script |

## Changes to This Policy

If this policy changes, the updated version will be published at the same URL with a new "Last updated" date.

## Contact

For questions or concerns, please open an issue at:
https://github.com/niceheadwkt/youtube-dual-subtitles/issues
