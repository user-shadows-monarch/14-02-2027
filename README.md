# Berlin ✈ Gabès — a birthday & Valentine's journey

A phone-first web page: a glowing heart, a wax-sealed letter, then a real map
where a plane flies from Berlin to Gabès, stopping at your memories (photo,
chat, video, voice note). It ends with a birthday cake, a final message and a
promise at sunset. Valentine piano plays during the flight and crossfades into
a birthday music box at the end.

No build step, no frameworks. Just static files.

## 1. Personalize (10–20 minutes)

Open `js/config.js`. Everything personal is there:

- her name (`herName`) and yours (`from`)
- the letter, every memory (title, date, quote), the chat messages, the final
  message and the promise
- file names for photos, voice notes and videos

The chat messages in the file are **samples**. Replace them with your real ones
(or drop chat screenshots in `assets/chats/` and set `chatImage`).

## 2. Add your media (all optional)

Anything missing is hidden (photos show a soft sunset placeholder).

| Put this in…            | File names                                   |
|-------------------------|----------------------------------------------|
| `assets/photos/`        | `00.jpg` … `05.jpg` (one per stop, ≤ 300 KB) |
| `assets/audio/`         | `00.mp3` … `05.mp3` voice notes, `final.mp3` |
| `assets/video/`         | any `.mp4`, then set `video:` in config      |
| `assets/chats/`         | screenshots, then set `chatImage:` in config |
| `assets/music/`         | `valentine.mp3`, `birthday.mp3` (optional)   |

Without the two music files the page plays its own built-in piano and music
box. If you add your own songs, make sure you have the right to use them.
Keep photos small and videos under ~25 MB so it loads fast on a phone.

## 3. Preview on your computer

Browsers block some features on `file://`, so use a tiny local server:

    python3 -m http.server 8000

then open http://localhost:8000 . Add `?dev` to the address
(http://localhost:8000/?dev) and the browser console will list any media
file the page could not find.

## 4. Put it online with GitHub Pages

1. Create a new repository on GitHub (choose a name that is hard to guess).
2. Upload **everything in this folder** (including the hidden `.nojekyll` file).
3. Go to **Settings → Pages**. Under *Build and deployment* choose
   *Deploy from a branch*, branch `main`, folder `/ (root)`, then Save.
4. After a minute your page is live at
   `https://YOUR-USERNAME.github.io/YOUR-REPO/`. Send her that link.

Privacy: a GitHub Pages site is public to anyone who has the link, and on a
free account the repository is public too, so your photos and messages are
viewable by anyone who finds it. The page tells search engines not to index
it, but keep the repo name unguessable and only include media you are happy to
share.

## Notes

- Tap-to-begin is required: phones only allow sound after a tap.
- Internet is needed for the map tiles and the Google fonts.
- Map data © OpenStreetMap contributors, style © CARTO (credit is shown on the
  page). Fine for a personal gift; check their terms for anything commercial.
- Change the cities in `route` (config) to reuse this for another trip.
