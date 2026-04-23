# Build assets

Drop a Windows icon file here named `icon.ico`. 256×256 (or multi-resolution) recommended.

If you don't have an ICO file yet, electron-builder will still try to use it when packaging. Generate one from a PNG at https://convertio.co/png-ico/ or with ImageMagick:

```
magick convert icon.png -define icon:auto-resize=256,128,64,48,32,16 icon.ico
```

Until you add an icon, `npm run dist` will either warn or use a default electron-builder icon — either is fine for a quick test build.
