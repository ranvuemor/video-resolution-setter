# Video Resolution Setter

A Chrome/Edge Manifest V3 extension that applies a preferred video quality when a page exposes quality choices.

## How it chooses quality

If the preferred resolution is available, the extension selects it. If not, it selects the next best lower quality. For example, with a preferred resolution of 1440p, a video that only offers 1080p and 720p will use 1080p.

## Current support

- YouTube uses the page player API and is the most reliable target.
- Other websites are handled with a best-effort generic adapter that looks for visible quality or resolution menus.

Browsers do not provide one universal API for forcing resolution on arbitrary HTML videos. Many sites use custom adaptive streaming players, so some sites may ignore quality changes or hide the quality menu from extensions.

## Load in Chrome or Edge

1. Open `chrome://extensions` or `edge://extensions`.
2. Enable Developer mode.
3. Choose **Load unpacked**.
4. Select this folder.

Use the toolbar popup to choose the preferred resolution and apply it to the current tab.

## Ignore websites

Some sites use video controls that do not behave well with generic quality detection. Add those domains to **Ignored websites** in the toolbar popup, one per line, or open the site and choose **Ignore this site**. Ignored domains also cover their subdomains, so adding `x.com` ignores `x.com` and `mobile.x.com`.
