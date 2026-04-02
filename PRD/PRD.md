# Product Requirements Document

## Summary
A clean, Polytrack-inspired racing game with a simple home screen that shows 5 tracks. Before the home screen, the player enters a username. Clicking a track opens a leaderboard and start screen, and the Start button loads that level. The goal is smooth driving, a minimal UI, and a small scope that is easy to build.

## Core Loop
1. Open game.
2. Enter a username.
3. Pick one of 5 tracks on the home screen.
4. Open the selected track's leaderboard and start screen.
5. Press Start to drive the course in a 3D chase camera.
6. Hold space to enter drift mode.
7. Finish the track and return to select another one.

## Goals
- Keep the look clean and low-poly.
- Make the controls responsive and smooth.
- Give each track a clear identity without adding complexity.
- Keep the menu fast and easy to use.
- Use lofi beats or soft driving music that feels relaxed and clean.

## Non-Goals
- No career mode.
- No upgrades or shops.
- No open world.
- No cluttered HUD.
- No playable track action from the home screen yet.

## Username Step
- Show a simple username input before the home screen.
- Require a username before continuing.
- Keep the screen clean and fast to submit.

## Home Screen
- Show 5 clickable track cards.
- Each card should include a name, short preview text, and difficulty.
- Use simple transitions when entering a track.
- Include a back option from gameplay to the home screen.

## Track Detail Screen
- After clicking a track, show a leaderboard and a Start button.
- The leaderboard should show times and usernames.
- The player's username should appear in the list when a new time is set.
- Start loads the selected track.

## Gameplay
- 3D chase camera.
- Smooth acceleration, braking, steering, and drift handling.
- Space enables drift while held.
- Tracks should be short and replayable.
- Each track should have checkpoints and a finish line.

## Track Set
1. Intro Track
   - Very easy layout.
   - Wide turns.
   - Teaches basic driving.

2. S-Curve Run
   - Slightly tighter corners.
   - Introduces drift timing.

3. Ramp Line
   - Small jumps and elevation changes.
   - Focuses on momentum.

4. Corner Grid
   - More turns and line choice.
   - Requires better control.

5. Final Run
   - Longest and fastest track.
   - Mixes all earlier elements.

## Visual Style
- Clean low-poly shapes.
- Clear track silhouettes.
- Minimal HUD.
- Avoid busy effects.

## Controls
- W / Up: Accelerate
- S / Down: Brake or reverse
- A / D or Left / Right: Steer
- Space: Drift while held
- Escape or Back: Return to home screen

## MVP Scope
- Username entry before the home screen.
- One home screen.
- Five track definitions.
- Track detail screen with leaderboard and Start button.
- Click-to-load track flow.
- Basic player movement.
- Drift mode while holding space.
- Restart and return flow.

## Current Build Phase
- Build only the username screen, home screen, and track detail screen first.
- Tracks should be selectable but not playable until Start is pressed.
- Keep gameplay loading separate from the menu flow.

## Acceptance Criteria
- The game opens to a home screen with 5 track options.
- The player must enter a username before reaching the home screen.
- Clicking a track opens a leaderboard screen with a Start button.
- Clicking a track loads the correct level.
- The player can finish each track and return to the menu.
- Drift only works while space is held.
- The game stays simple, clean, and smooth.

## Future Ideas
- Best times.
- Ghost runs.
- Track thumbnails.
- Funky or experimental tracks later.