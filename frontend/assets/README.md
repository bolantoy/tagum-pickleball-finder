# Assets

Place the following image files in this directory for the Expo app:

| File                  | Size        | Purpose                                    |
|-----------------------|-------------|--------------------------------------------|
| `icon.png`            | 1024×1024   | App icon (all platforms)                   |
| `splash.png`          | 1284×2778   | Splash screen (centered on dark bg)        |
| `adaptive-icon.png`   | 1024×1024   | Android adaptive icon foreground           |
| `favicon.png`         | 32×32       | Web favicon                                |

## Quick Placeholders

You can generate placeholder images using:
- https://placehold.co/1024x1024 (save as icon.png)
- https://placehold.co/1284x2778 (save as splash.png)

Or run this from the project root to create simple PNG placeholders:

```bash
# macOS / Linux (requires ImageMagick)
convert -size 1024x1024 xc:'#0F172A' assets/icon.png
convert -size 1024x1024 xc:'#0F172A' assets/adaptive-icon.png
convert -size 1284x2778 xc:'#0F172A' assets/splash.png
convert -size 32x32 xc:'#22C55E' assets/favicon.png
```
