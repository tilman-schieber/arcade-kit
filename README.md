# arcade-kit

Shared code for the NES-style browser games ([Scales](https://github.com/tilman-schieber/scales), [Snackman](https://github.com/tilman-schieber/snackman), [Rebound](https://github.com/tilman-schieber/rebound), [Encore](https://github.com/tilman-schieber/encore), [Pongman](https://github.com/tilman-schieber/pongman), [JTris](https://github.com/tilman-schieber/jtris), [Vektor](https://github.com/tilman-schieber/vektor), [Kaboom](https://github.com/tilman-schieber/kaboom)): the parts that were the same in every game. Plain TypeScript, no runtime dependencies, no build step.

## Modules

| Import | What it has |
|---|---|
| `arcade-kit/font` | The 5×7 bitmap font: `drawText`, `drawTextCentered`, `drawTextScaled`, `drawTextShadow`, `textWidth`. Lower-case `b` is a flat sign, so `Bb` reads right; other lower-case letters draw as capitals. |
| `arcade-kit/draw` | NES palette colors (`WHITE`, `RED`, `GREY`, `LIGHT`, `DARK`, `YELLOW`, `GOLD`, `BLUE`, `GREEN`), `mix`, `drawBox` (the framed panel), `drawSprite` (sprites as rows of characters), `disc`, `pad`, `hash`. The screen size stays in each game. |
| `arcade-kit/rng` | Seeded PRNG: `makeRng`, `hashString`, `randomSeed`, `today`. |
| `arcade-kit/storage` | `load`/`save`: localStorage that never throws. |
| `arcade-kit/scores` | `createScores({ game, tables, normalize, compare?, url?, key? })`: local top-10 tables per mode, plus world tables through a Val Town val with a queue for games that didn't get through. |
| `arcade-kit/touch` | `setupTouch(rows, onButton)` builds the on-screen buttons on touch devices; `setupSwipe` and `setupDrag` for the game screen. The page styles `#touch`. |
| `arcade-kit/audio` | The chiptune engine: `unlockAudio`, `tone`, `noise`, `arp`, `perc`, `midiHz`, `onsets`, `setVolume`, and `createMusic(tunes)`, a player for looping `Tune`s with intensity, tempo and transposition. Sound effects and tunes stay in each game. |
| `arcade-kit/hidpad` | The WebHID d-pad fallback behind `?webhid`, for the DragonRise "USB Gamepad" (`0079:0011`) whose d-pad Chrome on macOS can't see: `setupHidPad()` once, then read `padAxes(pad)` instead of `pad.axes`. |

## Using it in a game

Install it as a git dependency, pinned to a release tag:

```sh
npm install github:tilman-schieber/arcade-kit#v1.0.0
```

The package ships its `.ts` sources, so the game's bundler compiles them: Vite does this out of the box, and TypeScript needs `"moduleResolution": "bundler"` (as every game has). They are written for `strict`, `noUnusedLocals` and `noUnusedParameters`.

A game keeps its own file for each module that has game-specific parts and builds on the kit there. In Scales, for example, `src/scores.ts` declares the entry fields and calls `createScores`, and `src/audio.ts` holds the sound effects and tunes and wraps `createMusic`.

## Working on the kit and a game together

Point the game at a local checkout instead of the tag, and Vite picks up changes as you make them:

```sh
npm install ../arcade-kit       # in the game; writes "file:../arcade-kit" to package.json
```

Switch back to the tag (`npm install github:tilman-schieber/arcade-kit#vX.Y.Z`) before committing the game, as its GitHub Pages build can't see `../arcade-kit`.

## Releasing

Check, bump the version in `package.json`, commit, tag and push:

```sh
npm run check
git tag v1.1.0 && git push && git push --tags
```

Then update the tag in each game that should get the change. Games that don't update stay on the version they have.
