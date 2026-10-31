# Release checks (not part of the game)

These Playwright scripts catch broken buttons before players do.

- `actions.js`: every `data-a` button in `index.html` has a handler.
- `clickall.js`: opens each screen and clicks every button on it; fails on any error.
- `journey.js`: a touch-emulated phone taps through the whole first-time journey (skip demo, Settings, Profile, Back, Shop, How to play, register, Play, Pause, Quit).

They were written against a local mock of the Apps Script server (`mock.js`, not included) and expect the game at `/home/user/rainbrew-skies/index.html`; adjust the paths and run them with `node tests/clickall.js`.
