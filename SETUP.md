# Rainbrew Sky: setup (version 5.1)

Files: **`Rainbrew_Sky.html`** is the complete game in ONE self-contained file (every picture is inside it, so it also works if you just open it or send it around). For hosting, upload the whole folder: `index.html` is the same game with the pictures in `img/` (this is the page GitHub Pages serves), plus `manifest.webmanifest` (the install name is **Rainbrew Sky**), `sw.js` (offline play), the icons, `Code.gs` (the leaderboard server) and `verify.html` (the staff page).




















## Rainbrew Power, Overload, the haunted first stage and a calmer look (new, sim version 36)
* **Unicorn Power** is the old "Rainbrew Power": the button that fills as you defeat creatures (0.5% each) and wipes the screen. It only changed its name.
* **Rainbrew Power** replaces the flying Rainbrew logo. It is a fixed button (the Rainbrew picture) **under the Unicorn Power button**, usable **only in boss fights, once per boss**, once the boss has arrived. It glows with a rainbow ring and says **TAP!** when ready; before a boss it is dim (**BOSS ONLY**) and after use it says **USED**. **One tap** (or the **R** key): an instant, huge blast takes **22% of the boss's health**, the screen clears, and for **8 seconds** you are untouchable, every power is on, gems rain down and you fire **fast** (hyper-fire). No slow motion and no hold. A recorded voice-over says "Rainbrew Power". It also counts for the "Rainbrew Power" badge.
* **Overload** is for **creatures only**: hitting a boss no longer charges it, it cannot start in a boss fight, and one that is running switches off when a boss arrives. A recorded voice-over says "Rainbrew Overload" when it starts (the phone's own voice is the fallback). Both recordings are inside the game file and also kept as `rainbrew-power.mp3` and `rainbrew-overload.mp3` in the repository.
* **Haunted Meadows** (the first stage, Level 1, and again on later cycles): a dark night with stars, a cold moon with clouds drifting across it, mist rising past, falling leaves, two bats, spider webs in the corners, two spiders hanging on silk, and tombstones and bare trees scrolling along the edges, with a slow, eerie soundtrack. Everything moves slowly and gently on purpose. The creatures (pumpkins, ghosts, bats, witches) were already Halloween-themed. Look and sound only (the in-game name is "Haunted Meadows").
* **A calmer screen** (so players are not overwhelmed or dizzy): fewer on-screen texts (no "+score" for the small creatures, no CLOSE!, "Phase clear", shield or power-up messages, no boss-condition message), half the screen shake, softer flashes, a shorter and simpler Rainbrew Power effect (a soft flash and two rings), a calmer Overload start, no fast colour cycling during the Rainbrew rush, and the scenery no longer rushes past during it.
* **Sharper pictures:** the game now draws at a higher resolution on phones that can handle it (Medium 2x, High 3x; Low is unchanged), with high-quality image smoothing. The game still lowers the quality by itself on a slow phone, and Settings has Low / Medium / High.
* **Fair and checked:** the game records the Rainbrew taps (`rb`) and the server replays them, like the Unicorn Power presses, so scores that used them are verified.
* **To tune it**, change these in **both** `index.html` and `Code.gs` (the "SIM" block must stay identical) and raise `SIM_VERSION`: `RB_DMG` (0.22 = 22%), and `G.magic` and `G.hyper` in `rainbrewPower()` (the 8-second rush, 240 steps).
* **Deploy carefully:** the rules version is now **36**. A game and a server on different versions refuse each other's Ranked scores, and a refused score is not kept. So do it at a quiet time, in this order: (1) merge the game; (2) **right away** paste the new `Code.gs` into Apps Script and deploy a **New version** (GitHub Pages takes a minute or two to publish, so the server will be ready first); (3) players with the old page open will see an "update" notice and need to reload. Runs recorded on an older version and not yet uploaded cannot be uploaded any more.
* The `benchmark()` recorded flight was regenerated for version 36.

## Animated places (visual only, no rules change)

Every place now has one quiet, slowly moving background layer, like the haunted first stage: drifting cream clouds and steam (Cappuccino Clouds), light ripples and bubbles (Boba Bay), heat shimmer, dust and embers (Caramel Canyon), mist, ripples and fireflies (Blueberry Bog), light shafts, glints and drips (Mint Grotto), a breathing glow, embers and ash (Cocoa Volcano), blowing sand and crumbs (Cookie Ruins). It is drawn by `drawPlaceFx` and only follows the scenery scroll and the clock, so it changes nothing in the game rules: **no Apps Script redeploy is needed** and `SIM_VERSION` stays 36. On Low quality only the lightest parts are drawn.

## Immersion: place cards, boss entrances, a living unicorn and the Rainbrew Café (visual only, no rules change)

- **Place cards:** a quiet card (level, place name, its tagline) fades in for a few seconds when you reach a new place.
- **Boss entrances:** the screen dims very slightly and the boss's name appears with one line of its own (the lines are in `BOSS_TAUNT` in `index.html`; edit them to change the words). If you record voice lines later, they can be played from the same `boss` event.
- **A living unicorn:** it breathes, hops for joy on hearts, power-ups and level-ups, and droops with a tear when hurt. With one heart left it looks worried now and then.
- **Weather that notices you:** a few small lights drift around the unicorn in the colour of the place (fireflies in the bog, embers at the volcano and so on); a few more join when you power up.
- **Rainbrew Café:** every boss you beat brings one ingredient back (eight in all). They are kept **on the player's phone only** (`us_cafe`), shown in *More > Rainbrew Café*, and bringing all eight earns the *Rainbrew Barista* badge. It has no effect on score, rank or prizes, so Ranked fairness is unchanged.

None of this changes the shared rules, so **no Apps Script redeploy is needed** and `SIM_VERSION` stays 36.

## The intro order, the countdown and the Rainbrew theme (visual and sound only, no rules change)

- **Intro order:** a place is introduced on its own. The card takes the whole screen: the game dims, the HUD and every other message fade away, and only the place name and its tagline remain. Then everything fades back. This holds at the start of a run (GO!, then the Haunted Meadows card) and after a boss and Wild Card. A message that arrives during a card (for example a badge) waits until the card ends. Only one centre message shows at a time. The big "PHASE 1: ..." banner was removed because the HUD already shows the phase.
- **The 3-2-1 countdown** teaches one thing per number: 3 "Drag to fly", 2 "Collect gems", 1 "Defeat the enemies". Nothing else is on screen except the number.
- **Music:** the game now has one heroic tune, the Rainbrew theme (`THEME` in `index.html`, 16 bars in four phrases: call, answer, contrast, climax). It follows each place's own chords and key, so every place sounds different but the tune is the same. The music also breathes (the contrast phrase opens with no kick or snare), adds bass pickups into each chord, ghost snares, an open hat, falling-tom fills and a cymbal into the climax. Nothing here touches the rules: **no Apps Script redeploy is needed**.

## Player feedback (**redeploy Code.gs**; rules unchanged)

- **In the game:** *More > Send feedback*, *Settings > Send feedback* and a small "How was your flight? Tell us" link on the end-of-flight screen open a short form: a type (Idea, Problem, Praise, Other), an optional 1 to 5 star rating of the game, and a message of up to 600 characters. It is **anonymous**. Only if the player ticks *You may contact me about this* does it include their name and registered mobile number. It also sends the game version, mode, screen size and graphics setting (shown to the player), which helps reproduce problems.
- **Where it goes:** a new **Feedback** tab in your Sheet (created automatically, columns When / Category / Rating / Message / Name / Contact / Where / Status / Note). The staff page has a new **Feedback** tab (💬): the newest first, filters (All, New, Idea, Problem, Praise, Other), the average rating, a one-tap *Text* link when the player asked to be contacted, *Mark as done* and *Hide*.
- **Safety:** at most 5 messages an hour from one device and 400 a day for the whole game; text that starts with `=`, `+`, `-` or `@` is neutralised so it can never run as a spreadsheet formula; a contact number is kept only if it is a valid 09 number and the box was ticked. The privacy notice lists what feedback collects.
- After merging, paste the new `Code.gs` and deploy a **New version** (the feedback form needs the new server action).

## After a flight: a shop pop-up; and big scores on the podium (client only, no Code.gs change)

- **Shop pop-up:** when a flight ends and the player has enough gems to buy an upgrade or a unicorn, a pop-up asks "Upgrade in the shop?", shows the gem balance and the (up to three) cheapest things they can afford, and offers *Go to the shop* or *Not now*. It appears once per flight, about a second after the score screen, and never when the player cannot afford anything (so it does not nag new players). *Go to the shop* opens the Weapons tab if an upgrade is affordable (the Unicorns tab otherwise); the score still uploads in the background and the code stays in *My scores and codes* in the profile.
- **Podium numbers:** scores now show with commas and always fit inside their own podium card, even 7 to 8 digits on a small phone (the text shrinks just enough to fit). This also applies to the circle, event and winners podiums.

## Simple 6-digit codes (Code.gs only: **redeploy Code.gs**, rules stay at version 39)

- **Prize codes are now 6 digits** (for example `482 913`). Each accepted Ranked or Classic run gets one, shown on the score screen and in *My scores and codes*; a winner's pop-up shows it too. The server makes sure no two runs ever get the same code (a rare clash moves to the next code in a fixed chain), and a run sent twice gets the same code back. Staff can type it with or without a space or dash in the staff page's search box, the erase tool and the lookup. **Old codes (`RB-XXXX-XXXX`) still work** for lookups.
- **Moving to another phone now uses a 6-digit code:** *Settings > Move to another phone > Make my code* shows 6 digits; type them on the other phone under *I have a code*. The code works **once** and stops working after **15 minutes**; the server keeps the progress in its short-term memory only (never in the Sheet) and forgets it after use. A device that keeps guessing wrong codes is slowed down. If the phone cannot reach the server, the game falls back to the long copy-and-paste code.
- Because this adds two new server actions (`x_put`, `x_get`) and changes the code format, paste the new `Code.gs` and deploy a **New version** after merging.

## Sim version 39: a stronger Golden Sun, and moving progress to another phone (**redeploy Code.gs**)

- **Golden Sun (Classic, the full kit):** stronger shots (damage 2 to 2.6, faster fire) and a much bigger Unicorn Power, *Dawn Break*: the whole screen is wiped and the boss loses 35%, then **6 seconds of Sunfire** (a golden pulse five times a second that hurts every creature, clears every shot and chips the boss), **12 seconds of hyper-fire** and 11 seconds untouchable, plus a heart and a shield. That is longer and stronger than Rainbrew Power (8 seconds). **Ranked is unchanged:** every unicorn keeps the equal base kit and Golden Sun keeps the short Dawn Break, so prizes stay fair. The look: rotating sun rays, a golden ring on every pulse, light that rises across the screen, more sparkles at the start (no extra white-out). This is a **rules change** (`UNICORNS`, `useSkill`, `ultStep` in the shared SIM block), so `SIM_VERSION` is **39**: merge, then deploy `Code.gs` as a **New version** straight away. `BENCH` was regenerated.
- **Using your unicorns and shop purchases on another phone.** Gems, unicorns, upgrades and badges are kept on each phone (they are not on the server), so the same name and number on a new phone does **not** bring them. *Settings > Move to another phone* makes a code (no name or phone number in it); on the other phone, *I have a code* merges it in (the better of the two for everything, so nothing is lost). The leaderboard, circles and prizes follow the player's registered mobile number and are not affected. A code can be edited by someone who knows how, but upgrades only change Classic and Ranked stays equal for everyone, so this cannot affect prizes.
- **Bug fixed:** earned badges were saved under one storage name and read back from another, so they were lost when the page reloaded. They now persist (and the transfer code carries them).

## Sim version 38: new creatures, no repeats, a warning for each phase, device-based graphics (**redeploy Code.gs**)

- **Seven new creatures, no repeats.** Each of the eight worlds now has four phases with four *different* creatures, and no creature appears in two phases anywhere in the game (32 in all): the old third phase (the first two mixed together, for example "storm clouds and puffs") is now a new creature of its own: foam swirls, seahorses, caramel drips, dragonflies, frost moths, salamanders and cobras. They move differently (they sway wider and dive faster). This is a **rules change** (`ENEMIES` and `PLACE_KINDS` in the shared SIM block), so `SIM_VERSION` is **38**: merge the pull request and deploy `Code.gs` as a **New version** straight away, otherwise Ranked scores are refused. `BENCH` was regenerated.
- **Ice shards never arrive with a phase's creatures.** No ice volley can start in the first 5 seconds of a phase (also a rules change, same version).
- **A warning for each phase,** in the same place and style as the ice-shard warning: "The foam swirls are coming!". Messages now show one at a time and wait their turn; urgent ones (ice shards, hearts left) go first. The old first-flight hint was removed (the countdown teaches it now).
- **The Rainbrew Café notice** never shows while an intro card is up.
- **Graphics chosen for each phone.** The first time the game is opened it times a small typical scene at three sharpness levels and looks at the phone's memory and cores, then sets Low, Medium or High (saved on the phone). Settings > Graphics has an **Auto** chip to go back to this choice; a player who picks Low, Medium or High keeps it. The game still steps down by itself if a phone runs slowly.

## Winner notice in the game (no rules change, no Code.gs redeploy)

After a competition's deadline and its short late-upload window, a player who finished **1st, 2nd or 3rd** on that competition's verified leaderboard sees a pop-up the next time the game's home screen opens: "You won 2nd place!", the competition name, their best score, their verification code, and the claim steps (show the code and a valid ID at the counter; staff may also text; a prize that is not claimed in time **lapses**). It is shown once per winner and competition (they tap *Got it*). Nothing else is sent from the game: texting and handing over the prize are still done by staff on the staff page. Unclaimed prizes simply lapse and go to nobody else.

## Sim version 37: a calm opening for every new world, smoother play on phones (**redeploy Code.gs**)

- **No creatures while a world is introduced.** A new world now opens with a short quiet: nothing spawns for 4 seconds (the length of the title card), and the level clock waits. At the start of a run, and after each boss and Wild Card in the first round of eight worlds, the quiet is 4 seconds; when the bosses come round again there is no title card and the quiet is only about 1 second. This is a **rules change** (`quiet` in the shared SIM block), so `SIM_VERSION` is now **37**: merge the pull request and deploy `Code.gs` as a **New version** straight away, otherwise Ranked scores are refused. The benchmark flight (`BENCH`) was regenerated for version 37.
- **The title card is a clean screen.** While it shows, the world, the unicorn and the HUD fade away behind a dim, so only the place name and its line remain.
- **Bosses remember you.** Each world is introduced once. When the bosses come round again there is no second introduction, and each boss says a different line (first meeting, second, then every time after). The lines are in `BOSS_TAUNT`.
- **Smoother play.** The game now draws at most 60 times a second (a 120 Hz phone was doing double the work), the picture is rendered at a lighter sharpness (Medium 1.5x, High 2x instead of 2x and 3x), the game steps the sharpness down by itself if a phone runs slowly, and the music is scheduled further ahead so a slow frame no longer makes it stutter.

## Sound and music: the epic cinematic direction (new, first step)
* **All sounds and music are still made live by the game (no audio files except the two voice-overs)**, so nothing was added to download. This step upgrades them to a more cinematic feel, starting with Rainbrew Power and Overload.
* **Building blocks** (in `index.html`, next to `tone` and `noise`): `stab` (a brass-like hit), `cinPad` (a slowly swelling string pad), `boom` (a deep cinematic hit), `bells` (the bright notes).
* **Rainbrew Power sound:** a deep boom, a golden brass chord, a rising shimmer, then the "Rainbrew call" (root, fifth, octave). **Overload sound:** an electric surge that rises, a drop, a few crackles, a charged chord and a quick run up. Both are played **in the musical key of the current level**, so they sit inside the music. The voice-overs come in just after the hit (Rainbrew Power after 0.12 s, Overload after 0.35 s). A soft power-down sound plays when Overload ends.
* **Music:** the combat music now has deep war-drum hits on the big beats, a low swelling string line, and a brass call to open each phrase; the boss theme has real brass stabs, war drums and a pad. **It reacts:** while the Rainbrew rush is on, the music gets a heroic beat, brass on every beat and a high pad; while Overload is on, it gets a faster tempo, an electric pulsing bass and a sparkling line.
* **Normal (combat) music, re-voiced to be less sleepy and less synth:** a faster, driving pulse from the first second (about 116 to 142 beats per minute, was about 85 to 128), war drums and snare from Level 1, crisp staccato strings (a new `pluck` instrument), a warm horn-like lead (a new `horn` instrument) instead of buzzing saws and squares, a rounder bass, softer pads, no sparkly arpeggio, and a brass swell on every chord. Measured on the same moments: the sound is much warmer (average brightness about 1.4 kHz, was about 3.7 to 4 kHz, with half to two thirds less harsh high-frequency energy) and Level 1 has about 50% more rhythmic hits per second. A real recorded track (see below) would replace it even more completely.
* **Power-ups and Unicorn Powers (second step):**
  * **Power-up sounds** (all under a second, one clear sound each, in the level's key): the Boost (a warm thump, a whoosh and a quick run up), BEAM UP (a charge-up and three pings), FAN SHOT (a whoosh and three notes that fan out), PIERCING (a sharp zip and a metal ping), HELPERS (two soft twinkles), SHIELD (a solid thump and a glassy shimmer), the Charm (two sweet chimes) and the mystery box (a rising shimmer). They are about three times louder than before but still clearly quieter than the big moments.
  * **Power-up look:** catching one now shows a single clean ring in its colour and a small shape that says what it is (three beams, a fan, an arrow, a hexagon shield, twinkling helpers, a star, warm sparkles), about half a second long.
  * **Unicorn Power sounds** (each unicorn has its own, in the level's key): Starfall Barrage (an icy riser and stars falling in a glassy run), Prismatic Beam (a charge-up, a bright sustained chord and a rainbow run), Event Horizon (everything pulled inward, a dark swell, then the implosion), Astral Stampede (galloping drums that speed up, two horn calls and a shimmer) and Dawn Break (a golden brass chord with a bright third, a deep hit and a rising shimmer).
  * **Unicorn Power look:** a soft tint of each unicorn's element at the screen edges, a soft flare and drifting light along the Prismatic Beam, rings pulling inward around Event Horizon, leaves trailing the Stampede, and sun rays for Dawn Break. The Dawn Break white-out, rings, sparks and screen shake were toned down, and the small "+score" pops for the small creatures are no longer shown when a Unicorn Power wipes the screen. The fast colour-cycling hyper-fire aura is now slow and soft.
  * **A soft master limiter** on all game sound means the biggest moments can never distort.
* **Loudness order** (measured): Rainbrew Power is the biggest sound, then the Unicorn Power, then Overload, then the weapon level-up, with power-up pick-ups much quieter. No sound clips.
* **Next steps** (not done yet): the same treatment for the power-up pick-ups and each unicorn's Unicorn Power sound, a Rainbrew sound signature in the menu and boss victory, and (optionally) real recorded sounds and music made with ElevenLabs. To replace the normal music with a real track: make a seamless loop of 60 to 90 seconds (mp3, about 128 kbps), send it, and it can be wired in to play instead of the built-in music, with the built-in music kept as a fallback and for the boss fight, Overload and the Rainbrew rush.

## Privacy, consent and moderation (new)
*(A draft to help with the Philippine Data Privacy Act, RA 10173. It is not legal advice: please have a Philippine lawyer review `privacy.html` and these steps.)*
* **Privacy Notice and Game Rules:** `privacy.html` (linked from the registration screen and the game footer). Search it for **CONFIRM**: add a contact e-mail and the person responsible for privacy, confirm the retention period and reply time, and confirm with DTI or your lawyer whether each prize contest needs a permit.
* **Consent:** new players must tick "I have read the Privacy Notice & Rules" and say whether they are 18 or older, or under 18 with a parent or guardian. Players who registered before this are asked once, before their next game. Each score sent to the server carries the version agreed (`v1:A` adult, `v1:M` minor) and the server stores it in a new **Consent** column (added automatically). If you change `privacy.html` in a way that matters, raise `PRIVACY_V` in `index.html` so everyone agrees again.
* **Names:** bad words (English and Filipino), phone numbers, e-mails and web addresses are blocked in player names and circle names, in the game and again on the server. A score with a blocked name is kept on the phone and the player is asked for a different name. The word list is `BAD_ROOTS` / `BAD_WORDS` (keep it the same in `Code.gs` and `index.html`); it is a first line of defence, not a guarantee.
* **Staff tools** (`verify.html`): **Rename player** (on any score, changes the name everywhere), **Remove score**, hide or close circles and events, and **Tools > Erase a player's data**: removes a player's name and mobile number from every score, takes their scores off the boards, removes them from circles and hides circles they own. Use it when a player or their parent asks for deletion, and write down the request and the date.
* **Your routine:** (1) answer data requests within the time promised in the notice; (2) delete or anonymise players inactive for about 12 months (use Erase); (3) keep the staff PIN private and change it when someone leaves; (4) if personal data is ever exposed, tell the National Privacy Commission and the people affected (the law gives a short deadline, currently 72 hours): keep the lawyer's number handy; (5) keep a backup copy of the Sheet.
* **Speed check:** in Apps Script pick **`benchmark`** in the function list and press **Run**, then read the log. It only reads (it writes nothing). It times reading the Sheet, building the leaderboard, the cache, and replaying a recorded flight, and ends with a verdict. Run it now, again when you have many more scores, and after a busy contest. If reading the Sheet takes more than a few seconds, or players see "busy" errors, it is time to consider a faster server (for example Cloudflare Workers with a database).
* **Faster boards:** the one-minute board refresh and the staff list no longer read the long Events column, so they stay fast as scores grow.
* **Deploy order:** paste the new `Code.gs` into Apps Script and deploy a **New version** first, then publish the game, `verify.html` and `privacy.html`. Older copies of the game still work (they just don't send the consent version).

## Circles and Events (new)
* **Circles:** any registered player can create a circle (a leaderboard for friends, a family, a team or a class) from **Top Rank > Circles & Events**. It gets a 6-letter invite code (like K7M-2QX) and a share link. Members are ranked by their best **verified Ranked** score, **This week** or **All time**. A player can create up to 3 circles and be in up to 10; a circle holds up to 100 members. The owner can remove members, close or delete the circle. Anyone can leave.
* **Events (staff):** open `verify.html` > **Contest** tab > **New event board**: a name, a start date, how long it lasts, who can play, and an optional prize note. **Everyone** events are listed in the game for all players and rank every Ranked score played in the window. **Code or link only** events are joined with a code or link. Staff can edit, close, hide or reopen any event, and close or hide any player circle (the list shows all of them). The existing single **Competition** still works as before.
* **No new verification:** circles and events are only a filter over the same verified Ranked scores (same shared weekly course, same replay check). They cannot create or change a score. Phone numbers are never shown.
* **Privacy:** a circle is private: it has no public list and is found only with its code. Players see names and scores of members only.
* **Sheets:** the server creates two new tabs the first time they are needed: **Circles** and **Members**. Do not rename them.
* **Deploy order (important):** 1) paste the new `Code.gs` into Apps Script and choose **Deploy > Manage deployments > Edit > New version**; 2) then upload the game (`index.html`, `Rainbrew_Sky.html`) and `verify.html`. (When circles and events were added the sim version stayed 33 and the release stays **5.0**; the sim version is now 34, see above.) A game that is newer than the server shows "Circles are not available on the server yet".
* **Links:** a link like `https://YOUR-SITE/?circle=K7M2QX` opens the game and offers to join that circle after the player registers.

## What changed in 5.1
* **Update everything together:** upload `index.html`, `Rainbrew_Sky.html` and `sw.js` to GitHub, paste the new `Code.gs` into Apps Script and choose **Deploy > Manage deployments > Edit > New version**. The game and server are both at **sim version 33**; a mismatch makes the server refuse ranked scores. Runs recorded on the old version cannot be uploaded any more.
* **Harder:** Ranked difficulty 1.25 to 1.5, Classic 0.65 to 0.75 (Classic is still the easy, kid-friendly mode: 5 lives and bosses with 40% less health).
* **Boss health** is a table: base health = `900 + 120 x boss number` on the first run of 8 bosses (Matcha Dragon 900), plus `700 + 90 x boss number` for each further run (Matcha Dragon 1,600, then 2,300, then 3,000). Weapon level still scales it up a little. It is listed on the How to play slide (Levels 1 to 4). Change `bossHP()` in **both** the game and `Code.gs`.
* **Extra boss skills:** every boss has a second attack on its own timer that gets faster each Level: an aimed burst of three shots; from Level 2 also a ring of shots; from Level 3 also a slam column where you stand.
* **Cerberus:** left head FIRE (ring of embers), middle head FROST (icy fan), right head POISON (fast darts), plus all three heads breathing down their lanes.
* **Solar Blaze** was too strong: it fires about a third slower and Classic damage is 0.9 (was 1.1).
* **Tier order:** a Tier 3 unicorn needs a Tier 2 first, Tier 4 needs Tier 3, Tier 5 needs Tier 4. A pop-up explains it. This is checked on the phone only (gems and purchases are stored there).
* **Buy pop-up** before any unicorn is unlocked, in the Shop and on the home page.
* **No 25-minute limit.** A safety cap of 3 hours (`maxSec: 10800`) only protects the server. The server now accepts up to 4,000 skill presses and 4,000 wild-card picks, uploads up to 1 MB, and the game waits up to 2 minutes for the check (before: 60 skill presses, 400 picks, 400 KB, 20 seconds). This fixes "This run is too long to check".
* **Score sheet:** two new columns, **Unicorn** (id, used by the leaderboard pictures) and **Unicorn Name** (for staff). The server adds them the first time it runs. Older scores have no unicorn.
* **Manual score tool:** `addManualScore()` at the bottom of `Code.gs` records a score by hand after staff have seen proof (fill in the values, choose it in the editor, press Run). Rows are marked MANUAL / REVIEW.
* **Screen:** purple and green theme with flat fills, no text shadows, pinned Back / Next / Home, pause button top right above the lives, large centered contest countdown, one-time power-up hints, shaking ULT, small spiky enemy shots, full-bleed background.
* **Home page:** ‹ › arrows beside the flying unicorn and a Select button under it (locked unicorns show a price and open the buy pop-up). With an unfinished run, PLAY becomes **Resume** and **New game**. The Top Rank button glows.
* **Home bar glow:** the Shop button now glows (it was Top Rank). Look only; no rules change, so `Code.gs` and the sim version (33) stay the same.
* `sw.js` cache name is `rainbrew-sky-v5-12`. `verify.html`, `manifest.webmanifest` and `make_icons.py` needed no change.

## What changed in 5.0
* **Weapon levels come only from bosses, one every 2 Levels.** Beating the boss of Level 2, 4, 6, 8... earns a **Star Core**. It falls early in the next Level (4 seconds into Phase 1); catch it to upgrade your weapon one level. If you miss it, it falls again in the next phase until you catch it. No Star Cores fall in ordinary phases and beating a boss does not upgrade the weapon by itself: you must catch the core. You reach weapon level 5 at about Level 10. This keeps the difficulty balanced.
* **The Rainbow Laser is removed** everywhere: no capsule, no drops, no side icon, no sound, nothing in the guide. Rainbrew Magic (the rare logo) no longer gives it either; it still clears the screen, switches on every power and rains gems. Power-ups are now BEAM UP, FAN SHOT, PIERCING, helpers, shield, the Boost and the Rainbrew Charm.

## What changed in 4.9
* **Overload is colourful again, without taking over the screen.** Its beams are slim rainbow-coloured streaks (a soft glow and a half-opaque core) that are drawn *behind* creatures, bosses, enemy shots and hazards, so threats always stay on top. The halo around your unicorn drifts through the rainbow colours with five small sparkles. Starting it is a short soft flash and a small burst of colour.
* **Lower score from Overload.** Creatures the Overload beams defeat are now worth **half the points** (creatures your own beams defeat keep their full value), so the extra firepower no longer inflates your score. The rules version is now 28, so deploy the new `Code.gs`.

## What changed in 4.8
* **Overload now stacks with everything.** The Rainbow Laser (and Rainbrew Magic) used to switch off your normal beams, the fan and the Overload beams while they ran. Now the laser burns AND your own beams, Fan Shot, helpers and Overload all keep firing together. Picking up any power-up or Wild Card leaves Overload running and counting down normally.
* **Overload is colourful but never overpowering.** Its beams are slim rainbow streaks (red through violet) at moderate strength, drawn behind creatures, bosses, enemy shots and hazards, so you can always see what is coming. The halo is a soft coloured glow with five small sparkles (it was a bright glow with nine), your own beams no longer swell while it runs, and starting it is a short soft flash with a modest burst of colour. It still adds four beams and 50% more damage. (4.9 turned the pale 'ghost' look of 4.8 back into colour.)
* **New app icon from the high-resolution crystal unicorn** (the 1024-pixel Frost Unicorn artwork), flying over dusk clouds with a rainbow trail. Home-screen, maskable (Android), Apple, browser-tab and link-share pictures are all new, and clearly different from the Rainbrew Magic Catch icon. Installed copies keep the old icon until removed and installed again.
* **Contest countdown card** is see-through (about 26% opaque), one line tall, with a red LIVE badge, and it sits to the left so it never covers the settings button. The Rainbrew logo shows through it. Tap X to dismiss.

## What changed in 4.7
* **A new Rainbrew Sky app icon**, different from Rainbrew Magic Catch: a golden winged unicorn flying over dusk clouds with a rainbow trail, on a purple-to-pink sky. The home-screen icon, the Android "maskable" icon (made to survive circle and rounded-square crops), the Apple icon, the browser tab icon and the picture shown when the link is shared are all new. The picture is made by `make_icons.py` (run `python3 make_icons.py`, then rebuild). If the game is already installed, remove it and install it again (or wait a day) to see the new icon, because phones keep the old one.

## What changed in 4.6
* **Rainbrew Power** (the old ULT): every defeated creature charges it by **0.5%**, so **200 defeats** fill it. Every unicorn's power now wipes the whole screen at once (every creature, even tough ones, plus all shots, shards and attack lanes) and takes a big bite out of a boss (30% or more), on top of its own special show. Creatures it wipes do not feed the Overload streak. The button now says POWER.
* **Overload** (the old Overcharge): renamed everywhere. When it starts you get a huge, booming 3-second detonation (deep sub-bass slams, a blast, a growl, rolling shockwaves and a rising power chord), the music dips, the screen shakes hard and flashes white.
* **Clean home page:** no version number anywhere in the app. The home page is full screen on one smooth gradient. Play and Ranked / Classic have no filled backgrounds; only the bottom bar (Top Rank, Shop, Invite, More) keeps its containers.
* **Contest popup:** when a contest is on, a floating card sits on top of the home page with its name and a live countdown (time until it starts, or until it ends). Tap X to carry on to the game.
* **Install App popup:** a custom popup replaces the browser-menu instructions. Its Install button opens the browser's own install dialog in one tap, and it also appears by itself (at most once a week) after you have played and your browser says the app can be installed. iPhones cannot install from a button, so there it shows two small steps (Share, then Add to Home Screen).
* **How to Play** has three new slides, Small creatures, Tough creatures and Shooters: each creature's picture, its health, and how many hits it takes with 1, 2 and 4 damage per beam.

## What changed in 4.5
* **Overcharge** is its own thing now: a rainbow lightning-bolt icon (different from the Rainbow Laser's capsule), and no side icon, because the progress bar already shows it. It lasts **8 seconds**. It cannot stack: nothing charges the bar while it runs, and creatures defeated by Overcharge beams never count towards the next one. **Hitting a boss with your normal beams charges the bar** (a little with every hit), so it can fill during boss fights.
* **Longer boss fights:** bosses have 2.6 times their original life, and you now have 90 seconds to beat one before it flies away. With the test autopilot every unicorn still beats the first boss, in about 10 to 50 seconds.
* **Sidebar:** the MORE sidebar is a dark surface with white text in both light and dark mode (it had white text on a pale panel in light mode). The close buttons are drawn X icons instead of a text glyph that could disappear. The in-game side icons sit on near-opaque dark plates with bigger white timers and outlined counts.

## What changed in 4.4
* **Overcharge progress bar:** a bar at the bottom left shows your streak ("OVERCHARGE 40/100") and fills as you defeat creatures without being hit. At 100 the Overcharge starts: the bar drains while four extra wide rainbow beams and 50% more damage last (about 9 seconds). A hit resets the streak.
* **Mystery boxes are rare and glow**, and their gem prizes are small (25 or 50 gems at most).
* **How to Play** is left-aligned, the Levels and phases slide is removed, and Back / Next disappear on the first and last slide.
* **Readable in light and dark mode:** every pop-up is a dark surface with light text; buttons use a deep gradient with white text; the Play button, which is light, has dark text; the home screen sits on a dark scrim so the title, mode buttons and footer stay readable over any place's sky.

## What changed in 4.3
* **How to Play** is left-aligned on every slide, with readable white text and pale-gold titles in both light and dark mode.
* **Mystery boxes are rare** (about one defeat in a hundred from tougher creatures) and **glow** with a pulsing violet halo and circling sparkles. Their prizes are small: 25 gems, a full ULT, a free shield, or a gamble (15 gems but half fire rate for 8 seconds). Overcharged now drips one gem a second (about 9 per streak).

## What changed in 4.2
* **Overcharged:** 100 defeats in a row without being hit powers up your weapon for about 9 seconds: four extra wide rainbow beams fan out beside yours, and your own beams hit 50% harder, with a glowing aura. It gives no gems.
* **Mystery boxes:** rare, glowing "?" capsules (about one in a hundred tougher creatures): a small gem prize (25), a full ULT, a free shield, or a gamble (15 gems, but half fire rate for 8 seconds).
* **Flawless boss victory:** beat a boss without taking a hit and the first Wild Card offered is guaranteed Prismatic (super rare).
* **Tougher bosses:** every boss has 70% more life. At 30% health the music adds heavy percussion and a pulsing synth (and the tempo rises) to mark the final push; the 3-2-1 warning swells straight into the boss theme, and when the boss falls it melts back into the journey track.
* **Precise beams:** curving "homing" shots are gone. Two super-rare Wild Cards replace them: **Fan Stars** (two straight angled beams beside yours) and **Extra Beam** (one more beam for the whole flight). The BEAM UP capsule now drops much less often; FAN SHOT and PIERCING are the common weapon capsules.
* **Arcade recap:** every run ends on a stat card: Beams Stacked, Close Calls (shots that just missed you), Bosses Melted, plus Overcharges and Flawless wins when you earned them.
* **Readable shots:** your beams are slim, glowing and white-cored; enemy and boss shots are round with a dark rim, and no boss shot is icy blue.
* **How to Play:** all power-ups on one page, all bosses on one page, left-aligned text, the demo as the last slide. Every sideways carousel swipes by touch and by mouse drag, as well as with the arrows.

## What changed in 4.1
* **Sans-serif only:** every letter in the game is a clean sans-serif (no serif, handwriting or script fonts, and no web fonts are loaded). The copyright notice appears only at the very bottom of the Home page and the Settings page.
* **The background and the café names are unchanged:** the eight Alto-style places (Matcha Meadows, Cappuccino Clouds, Boba Bay, Caramel Canyon, Blueberry Bog, Mint Grotto, Cocoa Volcano, Cookie Ruins), their eight bosses and their own soundtracks stay exactly as they were.
* **Green gems:** gems are drawn at 40 units (they were 24) with a bright green aura, and the gem symbol everywhere (HUD, Shop, pop-ups) is green.
* **Home page:** the technical Ranked line is replaced by "Race the café leaderboard for prizes."; Play flows with colour, pulses and shines; **Install App** (for new players), **Invite**, **Follow Us on FB** (facebook.com/RainbrewCoffeeShop) and **IG** (instagram.com/rainbrew.cs) are animated buttons.
* **Shop:** the Select button now sits between the Previous and Next arrows, right under the unicorn's name, and the bottom button says **Home** instead of Done.
* **Profile and badges:** an avatar, a few big numbers with symbols, and 13 graphic badge medals (hexagons with their own symbols; locked ones are dim with a lock) with almost no text.
* **Weapon power-ups that stack:** two new temporary power-ups join BEAM UP, Helpers and the Rainbow Laser: **FAN SHOT** (two angled beams beside your own) and **PIERCING** (every beam passes through two more creatures). Tougher creatures drop weapon capsules now and then. All of them add on top of your Shop upgrades and of each other; the main beams stay capped at 5 (plus the 2 fan beams). The screen is refilled with creatures within a quarter of a second (except during a ULT or Rainbrew Magic).
* **Continue costs 250 gems** and its pop-up is minimal: the question, a heart, and your gem count. The boss warning, the 3-2-1, the buff tracker (power-ups as symbols with timers on the left, Wild Cards as small icons on the right) and the shared boss theme that starts the moment the warning begins are as before.
* **A better demo:** the unicorn glides (its moves are smoothed), the demo hurries through the four phases, then fights the boss with its ULT and ends when the boss falls, with captions for each step.

## What changed in 4.0
* **Registration:** nobody flies before registering a **name** (2+ letters) and a **mobile number** (9 to 15 digits; spaces and dashes are fine). The profile is kept on the device, and a returning player is recognised ("Playing as Ana"). **Switch player** lists everyone who has played on this device (numbers masked) and lets someone new register. Every finished game (Ranked or Classic, even a quit run) is recorded under the registered player: date, mode, Level and Phase reached, score. **Records** (home screen) shows *My games* and *Everyone on this device*. Verified runs still go to the server with the player's name and number as before; the full history is stored on the device.
* **Levels and Phases:** each magical place is a **Level** and its five steps are **Phases** (Phase 5 is the boss). The top of the screen reads LEVEL 3 / Boba Bay with the phase bar and "PHASE 2 · Jellies" below it.
* **Lower, tighter scores:** creatures are worth 5 to 24 points (were 25 to 120), hits score nothing, the combo multiplier is x2 after 6 defeats and x3 after 12 (Magic doubles it), and the phase, boss, comet and Magic bonuses are about a fifth of before. The score achievements are now 2,000 and 10,000.
* **ULTs hurt bosses:** every ULT takes 27 to 35% of a boss's life and delays its next attack. **No repeated waves:** every phase of every level has its own two wave formations (row, V, columns, zigzag, pairs, wall, diagonal, stagger); the next phase and the next level never reuse them, and each leaves a gap you can fly through.
* **Buff tracker:** a compact list down the left edge shows every active power-up (with its timer, e.g. +2 BEAMS 5s) and every Wild Card bonus (+1 MAX LIFE, CRIT 15%, +1.5% ULT...).
* **Wild Card rarity effects:** Common = a silver sparkle, Rare = a golden shockwave and banner, Prismatic = a massive rainbow burst, banner and a unicorn aura for about 4 s.
* **Continue?:** out of lives, a pop-up offers **1 life for 500 diamonds** (taken from this flight's diamonds first, then your wallet) or **End run** (the score is recorded). At most 2 Continues per run; the server replays them. Heart drops now exist **only for the Golden Sun** (3%, from tougher creatures, and only when it is missing a heart).
* **Boss conditions you can feel:** High Winds cut your speed to about 12 units a step (from 32); Freezing Air halves your shooting; Undertow drags you down twice as hard; Heat Haze cuts damage by 40%; Scorching Air cuts your recovery after a hit to a third; Toxic Fog cuts ULT charge to a quarter; Thick Ash slows shots to 8; Tremors shove you 30 units. Each also tints the screen edge and drifts particles across it, stronger during the Final Push.
* **A soundtrack for every place:** each of the 8 places has its own chords, tempo, drum feel, bass pattern, melody mode (minor or major), a signature sound (bells, water plucks, hand claps, a bog drone, crystal sparkles, a heavy growl, tambourines) and boss riff, all keeping the slow-to-fast build with the boss fastest.
* **Sound stays in the app:** leaving the tab, minimising, locking the screen, losing focus or backgrounding the page suspends all music and effects and cuts the voice; they return when you are back.

## What changed in 3.10
* **Shards that suit the place.** The falling shards keep identical rules and speed everywhere, but look, sound and wording match the place: **ice shards** in Matcha Meadows, Cappuccino Clouds, Boba Bay and Blueberry Bog; **crystal shards** in Mint Grotto; **caramel shards** in Caramel Canyon; **lava shards** in Cocoa Volcano (dark rock with glowing cracks and rising embers); **stone shards** in Cookie Ruins. Each has its own marker colour, its own warning ping and fall sound, and the warning says what is coming ("3 lava shards! Move!"). No hot place gets ice.

## What changed in 3.9
* **Falling stars are now sharp ice shards.** Same rules (a volley of 2 to 4, every 13-22 s from level 2, never in a boss fight, one lane always free, the ULT clears them) but they **plunge much faster**: 15 units a step instead of 10, crossing the screen in about 1.5 s after their static marker. A shard is a faceted ice crystal with a streak of cold mist, hurts at its tip and along its body, and has its own sounds (glassy pings, a sharp shing). The message says "3 ice shards! Move!", the achievement is **Shard dodger**, and the how-to-play text matches.
* **The demo now shows the real game:** each level brings its own creatures, defeats charge the ULT, white diamonds, the Rainbrew logo, ice shards, tapping a full ULT (the demo fills it at 20 s so you can see it), then the boss and Wild Cards. The old lines about treats and spiders are gone.
* (Frost's ULT is still *Starfall Barrage*: those are stars it rains on enemies, not the hazard.)

## What changed in 3.8
* **Every level has its own creature, climbing to the boss.** Matcha Meadows: level 1 all pumpkins, level 2 all ghosts, level 3 all bats, level 4 all witches, level 5 the boss. Every other place has three creatures, so it goes: a tank (level 1), the small ones (level 2), tank and small ones together (level 3), the shooters (level 4), then the boss. The next magical place repeats the same pacing with its own creatures, a little harder. The level start says which creature is coming ("Level 2 · Ghosts").
* **Harder:** enemies are tougher with every stage and every level, faster, and come in denser waves; shooters fire more often; bosses have more life (200 + 110 per stage); falling-star showers come every 13-22 s; difficulty multipliers are up (Ranked 1.25, Classic 1.1).

## What changed in 3.7
* **Seamless Wild Cards:** the moment the boss's defeat animation ends, the 3 cards fade and rise in over the scene (no level-complete wait). The boss no longer showers diamonds or pays a gem bonus: the cards are the reward. Picking a card flies straight into the next stage while the cards fade away (no get-ready pause).
* **New card icons:** 13 custom, softly shaded vector icons (wings, magnet, three kinds of diamond bundle, star dust, heart, shield with wind, shield with a renewing arrow, crit star, homing stars, charged star, coffee cup 2x).
* **Wild Cards complement the Shop:** damage, fire rate, extra beams and piercing stay with the shop's weapon upgrades. Wild Cards are run-modifiers and passives. Common: Swift Wings (+15% move speed), Gem Magnet (pull from 70 units farther, 3 stacks), Diamond Dust (+15), Star Dust (+0.5% ULT charge per defeat). Rare: Heart of Stars (+1 max life, heal), Weather Ward (50% boss-condition resistance), Aegis Bloom (a shield grows back after 25 s without a hit), Lucky Star (15% of shots crit for double damage, up to 45%), Diamond Cache (+35). Prismatic: Homing Stars, Star Charger (+1% ULT charge per defeat), Eternal Brew (Rainbrew Boost lasts twice as long), Diamond Jackpot (+75).
* **Power-ups add to your beams:** BEAM UP (formerly Triple Beam) adds +2 beams on top of the beams you already have from the shop, +1 if only one slot is left under the cap of 5, and pays +10 diamonds at the cap. It never sets or resets a fixed beam count. The pop-up says what it really did: "+2 BEAMS!", "+1 BEAM!" or "BEAMS MAXED! +10 GEMS".
* **Red boss warning:** the compact top-centre banner and the 3 - 2 - 1 are now red (red glow, red border and accents).
* **Boss eyes blink together:** the left and right eye no longer have different timing.

## What changed in 3.6
* **Compact boss warning:** a small semi-transparent banner at the top centre with the 3 - 2 - 1. It never covers the unicorn, enemies or hazards.
* **Final Push at 30% boss life:** a clean, slowly breathing aura in the boss's colour (no flicker), attacks 20-25% faster, and its environmental condition becomes 30% stronger (a Wild Card's resistance still applies). The indicator says "stronger".
* **ULT charge is 2% per defeat** (50 defeats). **Every unicorn has its own ULT**, with its own description, icon and look: Frost = *Starfall Barrage* (time crawls while 30 star bolts hit enemies and the boss), Solar = *Prismatic Beam* (a wide piercing rainbow beam up your column for 2.5 s), Void = *Event Horizon* (a black hole drags everything in, then implodes), Emerald = *Astral Stampede* (invincible, +1 heart, astral beasts trample up the screen), Golden Sun = *Dawn Break* (wipes the screen, 8 s hyper-fire, heart and shield). The ULT button shows your unicorn's icon.
* **Wild Cards after every boss:** pick 1 of 3. Common (silver, 65%): +12% fire rate, +15% move speed, +10% damage, +15 diamonds. Rare (gold, 28%): Twin-Shot, Piercing, +1 max life and heal, 50% resistance to boss conditions, +35 diamonds. Prismatic (rainbow, 7%): Homing Star-Shots, +1% ULT charge per defeat, Rainbrew Boost lasts twice as long, +75 diamond jackpot. **Reshuffle** costs diamonds and climbs each time on the same screen: 15, 25, 40, 60, 80. Card choices are recorded and the server replays them.
* **Golden Comet:** once per stage, around level 2 or 3, a fast golden comet crosses the sky (it never attacks). Shoot it down (8 HP in the first stage, a bit more each stage) for a shower of white diamonds and an instant Rainbrew Boost.
* **Balance:** stat bonuses have diminishing returns and caps (fire rate +60%, move speed +45%, max 5 beams, piercing +3, max life 5). Every offensive card makes enemies, spawn pace and boss health up to 24% tougher; enemy HP, boss HP and falling-star frequency also grow with each stage. Diamond income is tuned to about 120 per boss cycle, so a reshuffle or two per boss is affordable.

## What changed in 3.5
* **Alto-style places:** a smooth three-colour gradient sky, a soft glow of light, and three drifting layers of calm silhouettes along the edges (with one small motif per place). The middle of the screen is always clear. No lines, props or clutter.
* **The Bomb is gone.** The **ULT** button sits bottom right, where it was. Every defeated enemy charges it by 5% (20 defeats = full). The ULT charge gems are removed; hitting a boss no longer charges it, and every unicorn charges at the same rate. Standard gems are glowing white diamonds.
* **Blazing Falling Stars replace the spiders:** a shower of 2 to 4 every 16-26 s (from level 2, never in a boss fight). Each shows a small static "!" marker, then falls fast; they are staggered, in different lanes, and one lane is always free. The ULT clears them.
* **Harder:** Ranked difficulty 1.15 (was 1.0), Classic 1.0 (was 0.85); enemies are faster, waves closer, and they shoot more often.
* **No life bars on regular enemies**; only the boss has one.
* **The boss no longer blinks:** the fast pulses and hit flash are replaced by smooth fades and a soft hit tint, and the boss picture buffer keeps one fixed size.
* **One hype track for all of combat:** about 92 BPM at the start of a stage (kick on beats 1 and 3), adding drums, bass, lead and arpeggios level by level, building in the pre-boss moment, and fastest (about 158 BPM) in the boss fight; afterwards the tempo glides back down with no gap. The home screen keeps its calm theme.
* **Warnings in the game's purple and gold,** static: the 3-2-1 sign and the falling-star markers.

## What changed in 3.4
* **3 - 2 - 1** before every boss level: a plain, static sign with a big number that pops in, a small "3 - 2 - 1" row, and short clean ticks (still no siren).
* **The HUD never disappears.** The pre-boss build-up used to hit a drawing error that hid the Score and the buttons; fixed, and the HUD is now drawn separately so no effect can hide it.
* **Gems and lives no longer overlap:** lives are the top-right row, gems have their own row beneath, and the pause button now sits at the very top right, above them.
* **One skill: ULT** (key E or Q). It wipes out every creature, shot, spider and boss attack for double points, hits a boss for 25% of its life, and gives 4 s untouchable with 5 s of hyper-fire (double fire rate and damage, piercing rainbow beams). Each unicorn adds a small signature (Frost stops time 2 s, Solar a bonus-point blaze, Void pulls every pickup, Emerald a heart and a shield); the Golden Sun does all of it at maximum (35% of a boss, 8 s of hyper-fire). The effect: white-out, five rainbow shockwaves, 150 sparks, a screen punch, slow motion and a huge ULT! banner. The Standard skill from 3.3 is removed.
* **Two kinds of gem:** standard gems are glowing white diamonds. The gems that charge the ULT are hot-magenta eight-point stars with a golden heart and a bright magenta glow, and the ULT button glows the same colour.
* **High-action opening:** every flight starts with a 10 s Rainbrew Boost (already firing fast) and a crowd of enemies from the first second, easing to the normal pace over the first 40 s.

## What changed in 3.3
* **Stage progress bar:** right under the stage title, five steps for the five levels; the last step ends in the icon of that stage's boss.
* **Plain, grounded stages:** each stage is a flat ground with ONE straight path and a few props that belong to that stage (trees and pumpkins, buoys and lily pads, mesas, reeds, crystals, lava pools, ruins...). No lines, rays, glows, sparkles or lighting in the background.
* **Static boss warning:** a plain sign (no movement, shaking, vibration or flashing) and **no siren**. The music still cuts out when the warning starts.
* **Two skills:** the **Standard skill** (cooldown button next to the Ultimate; key Q) and the **Ultimate** (charged by elemental tokens; key E). Standard skills: Frost Nova (slows everything), Flare Lance (a burst up your column), Phase Shift (2.5 s untouchable, pickups fly to you), Thorn Ward (shield + thorns that break shots), Sun Pulse (a ring of light, 11 s cooldown).
* **Boss conditions** (during the boss fight, with a small indicator): Heat Haze (weaker shots), High Winds (slow flying and gusts), Undertow (pulls you down), Scorching Air (short recovery), Toxic Fog (slow skill charge), Freezing Air (slow shooting), Thick Ash (slow shots), Tremors (shoves you sideways).
* **Rainbrew Boost:** double fire rate, +25% damage, piercing beams, a wider pickup magnet, a warm edge aura, speed afterimages and faster scrolling. **Rainbrew Magic** is now a quick flash, ring and rainbow edge with fast scrolling, with no vertical lines.
* **Pickups:** dropped items fall about twice as fast and are spaced apart so they never overlap, even in Rainbrew Magic.
* The home tab is now **Shop** with a store icon.

## 1. Update the server (you already have an Apps Script)
This version uses **game rules v33** (sim version 33). The server must run the matching `Code.gs` (kept in `apps-script/Code.gs`), or it refuses every score.
1. Open your Apps Script, delete the old code, paste ALL of the new `Code.gs`, save.
2. Deploy > Manage deployments > the pencil > Version: **New version** > Deploy. (The address stays the same.)
3. Check `YOUR-ADDRESS/exec?action=ping`: release **5.0**, rules **33**. (The release number in `Code.gs`, `index.html` and `verify.html` is `5.0`; the "5.1" in this file's title is the documentation label.)

## 2. GitHub Pages and a custom domain
Upload the folder (including `img`). For a custom domain such as rainbowsky.io: Settings > Pages > Custom domain, then at your registrar add `CNAME www -> YOUR-NAME.github.io` and `A @ -> 185.199.108.153, .109.153, .110.153, .111.153`; keep the `CNAME` file GitHub creates; tick Enforce HTTPS. (Also a comment at the top of `index.html`.)

## 3. Gameplay
* **Ranked** (weekly prizes) gets harder as you fly and builds hype before each boss. **Classic** is casual.
* Defeat creatures to score; collect gems, elemental tokens (they charge your active skill) and glowing hearts. Every pickup has a bright aura.
* **Bosses** have calm, solid bodies with depth (key light, rim light, grain and a soft shadow on High); their ATTACKS are the wiggly part: slamming tentacles, the Hydra's lunging neck, Medusa's snake shots, flame and beam lanes.
* **Boss warning:** a vibrating WARNING banner, four rotating red emergency beacons, a shaking screen and a real wail siren. Calm ambient stage music cuts out and the intense boss theme begins when the boss enters; a victory fanfare plays on defeat, then calm music returns.

## 4. Shop
Buy in tier order (see 5.1): Tier 2 before 3, 3 before 4, 4 before 5.

| Unicorn | Tier | Price | Skill |
|---|---|---|---|
| Frost Unicorn | I | free | Blizzard |
| Solar Blaze | II | 2,000 | Sun Burst |
| Void Shadow | III | 5,000 | Black Hole |
| Emerald Nature | IV | 12,000 | Overgrowth |
| **Golden Sun** | V, **ULTIMATE** | **30,000** | **Solar Ascension** (all five skills at once) |

Higher tiers deal more damage, reach further and have stronger skills. The **Golden Sun** has three piercing beams, built-in helpers, a starting shield and a skill meter that charges twice as fast, with a glowing sun aura.
The **Weapons** tab sells permanent upgrades: **Damage** (5 levels, +10% each), **Fire Rate** (5 levels, 6% each) and **Projectile Tier** (3 levels: +1 beam, piercing, +1 beam and more piercing).

**Important: fair Ranked.** Gems are stored on each phone, so the server cannot check what a player bought. To keep the weekly prizes fair, **Ranked uses an equal base kit for every unicorn** (each keeps its own beam style and skill) and ignores weapon upgrades. The full tier kit and the upgrades apply in **Classic**. To change this, set `fair: 1` to `fair: 0` for `rank` in the `MODES` table, in **both** `index.html` and `Code.gs`, but then anyone can claim the Golden Sun.

## 5. Settings (gear button on the home screen and in the pause menu)
Audio: sound and music sliders, voice. Graphics: Low / Medium / High (resolution, particles, glow, boss lighting and scenery layers; auto-picked for the phone and lowered automatically if frames are slow) and screen shake. Controls: Drag or Follow-finger, sensitivity, vibration. Reset restores the defaults.

## 6. Good to know
* Every ranked score is replayed by the server, including Wild Card picks, Continues and skill presses.
* `SHOP_LINE: ''` in the game can hold the shop address or hours.
* Until DTI is confirmed, announce recognition only. `og-image.png` (link preview) is still an older picture.
