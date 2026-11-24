# Filmie ♡ — Starter website

A cute, responsive, browser-only photo booth based on Filmie SRS Version 1.0.

## What's included
- Home/landing page and responsive design
- Camera permission and live preview
- Front/rear camera preference where supported
- 4, 6, or 8 captures, optional countdown, retake last
- Local camera filters and photo strip frames
- Canvas-based photo strip with caption and sticker
- Enlarged preview, PNG download, and browser print
- No accounts, backend, database, or photo uploads

## Run it on your computer (beginner-friendly)

Camera access works on `localhost` and on HTTPS websites. Do not open `index.html` by double-clicking it (`file://`), because browser camera permissions may not work there.

### Option A — VS Code + Live Server
1. Install Visual Studio Code.
2. Unzip the `filmie` folder somewhere easy to find, such as Desktop.
3. In VS Code choose **File → Open Folder** and select the `filmie` folder.
4. Open Extensions (the four-squares icon), search for **Live Server**, and install it.
5. Right-click `index.html` and choose **Open with Live Server**.
6. Your browser should open a localhost address. Click **Step inside**, then allow camera access.

### Option B — Python local server
1. Install Python if you do not already have it.
2. Open a terminal inside the `filmie` folder.
3. Run: `python -m http.server 8000`
4. Visit `http://localhost:8000` in your browser.
5. Click **Step inside** and allow camera access.

## Privacy and security notes
- The app requests camera permission only after the user clicks to start.
- Captured photos are kept in page memory and composed locally using Canvas.
- There is no upload endpoint, account system, database, analytics, or remote photo storage.
- Camera tracks are stopped when the page is hidden or closed.
- A Content Security Policy is included in the HTML. If you later remove the external Google Fonts dependency, tighten `style-src` and `font-src` to `'self'`.
- Deploy only over HTTPS so camera access is available on the public site.
- The camera feed and photos are sensitive. Use a device/browser you trust, and close the page when finished.

## Before public deployment
1. Test on Chrome, Edge, Safari, and a phone if available.
2. Confirm camera permission, camera switching, filters, all photo counts, retake, download, and print.
3. Configure your hosting provider to serve HTTPS.
4. Configure equivalent HTTP response headers at the host: `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, and `Permissions-Policy: camera=(self), microphone=(), geolocation=()`.
5. Keep the project static. Do not add photo-upload services unless the privacy requirements are deliberately changed.

## Current limitations
- Filters are applied to the camera preview and captured image; the selected filter is baked into each capture.
- Retake-last is provided; individual thumbnails are not yet independently editable.
- Front/rear camera switching depends on the device and browser.
- Printing uses the browser print dialog; the on-screen printer is an animation, not a physical printer connection.
- Google Fonts load from Google. For fully offline operation, download licensed font files and self-host them.
