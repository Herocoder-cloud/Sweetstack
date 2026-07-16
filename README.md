# Sweet Stack -- Candy Tower Game

A one-tap block-stacking game built for genuine "one more try" replay
value. Line up the sliding block perfectly to keep the tower wide;
misjudge it and the block gets trimmed to fit; miss completely and the
tower falls.

**Live demo:** _add your Netlify/GitHub Pages URL here after deploying_

## Why this design

This is deliberately built around the same core loop as some of the
most-played browser games of all time (Stack, Drift Boss, Drive Mad):
**one input, instant to learn, hard to master, short sessions, endless
replay.** That formula is what actually gets played and shared,
especially by kids -- not complexity. Research into what performs well
on platforms like CrazyGames and Poki pointed clearly at this pattern
before any code was written.

Kid-safety by design: no violence, no timers creating anxiety, no
text/reading requirements, no monetization pressure built into the
game itself, and bright, non-scary visuals.

## How the core mechanic works

On every drop, the game compares the moving block's position against
the block below it:

- **No overlap** -> the block missed entirely -> game over
- **Overlap within a few pixels of perfect alignment** -> counted as a
  "perfect" placement: the block keeps its full width, a combo streak
  increments, and bonus points are awarded. This is what rewards
  precision without punishing near-misses too harshly.
- **Partial overlap** -> the placed block is trimmed down to exactly
  the overlapping region. The piece that got cut off becomes a small
  falling piece purely for visual feedback (it has no gameplay effect,
  it just makes a miss feel physical rather than silent).

The camera doesn't literally move -- instead, every block's draw
position is calculated from its height in the tower, and once the
tower gets tall enough that the top block would go off-screen, a
`cameraShift` value is added to every block's Y position to pull the
whole scene back down, creating the illusion of the camera following
the tower upward.

## Tech stack

- Plain HTML5 Canvas 2D (no game engine/library) -- direct `fillRect`
  style drawing with rounded rectangles
- Web Audio API for sound -- every sound effect is a synthesized tone
  (`OscillatorNode`), not an audio file. This keeps the whole game at
  a handful of KB with no asset licensing to worry about.
- `localStorage` for the best-height record
- No build step, no framework, no dependencies

## Deploying this yourself

Same as the other portfolio projects: push to GitHub, then deploy via
Netlify or GitHub Pages (static site, no environment variables or
backend needed).

## If submitting to a platform like CrazyGames or Poki

Most platforms want a few things beyond the game itself:
- A square or landscape cover thumbnail image
- A short description and a few gameplay screenshots
- Confirmation the game works well on both desktop and mobile touch
  (this one already handles both via the Pointer Events API)

## Possible extensions

- Add a "shop" where earned points unlock new block skin themes
- Add a slow-motion effect on very high combos for extra juice
- Track a small local leaderboard of the last 5 runs
- Add haptic feedback (`navigator.vibrate`) on perfect placements for
  supported mobile browsers
