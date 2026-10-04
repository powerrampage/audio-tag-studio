# Audio Tag Studio

Browser-based audio tag editor and converter. Edit title, artist, album, cover art and more, convert between mp3/m4a/flac/ogg/wav, and download the result. Everything runs client-side (ffmpeg.wasm), so files never leave your computer.

Plain HTML + JavaScript, no build step. Third-party libraries are vendored in `vendor/` (ffmpeg.wasm 0.12 UMD, jsmediatags).

## Run locally
```
python3 -m http.server 8000
```
Open http://localhost:8000
