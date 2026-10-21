# Rainbrew Magic Catch: Unicorn Skies — setup

The folder has everything: `index.html` (the game), the `img` folder (the five unicorns and the Rainbrew logo),
`Code.gs` (the leaderboard server), `verify.html` (the staff page), plus icons, `manifest.webmanifest` and `sw.js` (install as an app, play offline).

## 1. The leaderboard server (Google Apps Script)
This game uses NEW rules, so it needs its own server. Don't paste it over the old Magic Catch server, or the old game stops recording scores.
1. Create a new Google Sheet ("Rainbrew Magic Catch scores"). Extensions > Apps Script. Delete the sample code, paste ALL of `Code.gs`, save.
2. Run `setup` once, then `installTriggers` once, then `setMyStaffPin` (type your PIN into it first).
3. Deploy > New deployment > Web app. Execute as: Me. Who has access: Anyone. Copy the address ending in `/exec`.
4. Open `index.html` in a text editor, find `API_URL: ''` and paste the address between the quotes. (Or send it to Claude to build it in.)
   Without an address the game still plays, but only as practice (no leaderboard).
5. After changing `Code.gs` later: Deploy > Manage deployments > edit > New version.

## 2. GitHub Pages
1. github.com > + > New repository (Public). Name it, e.g. `rainbrew-magic-catch`.
2. "uploading an existing file": drag in EVERYTHING from this folder, including the `img` folder. Commit.
3. Settings > Pages > Deploy from a branch > main > / (root) > Save.
4. In 1–2 minutes: `https://YOUR-NAME.github.io/rainbrew-magic-catch/`. The staff page is the same address + `verify.html`.
5. Staff page > Tools > "Why is board empty?" checks that everything is connected.

## 3. How it plays
* Drag to fly; the unicorn shoots straight up by itself. Halloween creatures drop Rainbrew treats that FALL: fly under them to catch them.
* Treats give powers: coffee rapid fire, pizza more shot lines, burger stronger shots, chicken piercing shots, salad slows creatures,
  ice cream magnet, pasta double points, tea/matcha shield. Also stars (invincible) and bombs (tap the bomb button).
* Spiders drop on their webs where you are: move! The rare Rainbrew logo starts Rainbrew Magic.
* Every 5th level a mythical boss; beating it moves you to the next magical place.
* Modes: Rank (weekly, same course, equal unicorn power: fair prizes), Classic, Rush (90 s), Infinite (no game over).
* Gems collected in flights unlock unicorns in the shop. Gems are kept on each phone (they are not prizes).

## 4. Good to know
* Every ranked score is re-played by the server; a score that can't be reproduced is refused.
* Prizes: until DTI is confirmed, announce recognition only.
* `og-image.png` is still the old link-preview picture: replace it before sharing widely.
