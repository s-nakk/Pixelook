# Pixelook

Multi-device responsive design preview Chrome extension.

Any webpage can be previewed across multiple device viewports simultaneously, with synchronized scrolling.

## Features

- **Multi-viewport preview** — View any URL in multiple device sizes side by side
- **Scroll sync** — Scroll one viewport and all others follow (percentage-based)
- **1:1 device widths** — Each iframe renders at the actual CSS pixel width of the device
- **Category filters** — Toggle Phone / Tablet / Desktop visibility
- **17 device presets** — iPhone 17, Galaxy S26, Pixel 10, iPad Pro, and more (2026 viewport data)
- **Custom devices** — Add your own device dimensions
- **iframe restriction bypass** — Strips `X-Frame-Options` and `Content-Security-Policy` headers for preview tab only (scoped to tab ID)
- **Dark theme UI**

## Default Devices

| Device | Width | Height | Category |
|--------|-------|--------|----------|
| Galaxy S26 | 360 | 773 | Phone |
| iPhone 17 | 402 | 874 | Phone |
| iPhone Air | 420 | 912 | Phone |
| Pixel 10 Pro XL | 448 | 997 | Phone |
| iPad Air 11" | 820 | 1180 | Tablet |
| iPad Pro 13" | 1032 | 1376 | Tablet |
| Laptop | 1366 | 768 | Desktop |
| Desktop FHD | 1920 | 1080 | Desktop |

## Install (Developer Mode)

1. Clone this repository
   ```bash
   git clone https://github.com/s-nakk/Pixelook.git
   ```
2. Open `chrome://extensions` in Chrome
3. Enable **Developer mode** (top right)
4. Click **Load unpacked** and select the cloned `Pixelook` directory
5. Navigate to any website and click the Pixelook icon in the toolbar

## Usage

1. Open any webpage
2. Click the Pixelook extension icon
3. A new tab opens with multi-device preview of the current URL
4. Use the **category filters** (Phone / Tablet / Desktop) to toggle device groups
5. Toggle **Scroll Sync** to synchronize scrolling across all viewports
6. Click **+ Device** to manage devices or add custom ones

## How It Works

### Header Stripping

Many sites set `X-Frame-Options` or `Content-Security-Policy` headers that prevent iframe embedding. Pixelook uses Chrome's `declarativeNetRequest` API to strip these headers, **scoped exclusively to the preview tab** via `tabIds`. Other tabs are completely unaffected. Rules are cleaned up when the preview tab is closed.

### Scroll Sync

A content script is injected into each iframe via `chrome.scripting.executeScript`. It listens for scroll events and posts the scroll percentage to the parent page via `postMessage`. The parent relays the position to all other iframes. A cooldown mechanism prevents feedback loops.

## Permissions

| Permission | Reason |
|------------|--------|
| `activeTab` | Get the current tab's URL |
| `tabs` | Create preview tab, listen for tab close |
| `scripting` | Inject scroll sync script into iframes |
| `declarativeNetRequest` | Strip iframe-blocking response headers |
| `webNavigation` | Detect iframe load completion for script injection |
| `storage` | Save custom device presets |
| `<all_urls>` | Required for header stripping and script injection on any domain |

## Tech Stack

- Chrome Extension Manifest V3
- Vanilla JavaScript (no build step, no framework)
- CSS custom properties for theming

## License

[MIT](LICENSE)
