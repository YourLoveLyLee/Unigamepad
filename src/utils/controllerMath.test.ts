import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyTouchpadGesture,
  computeDPadDirections,
  computeGyroDelta,
  computeStickOutput,
  normalizeAngleDelta,
} from './controllerMath';

test('computeStickOutput enforces radial deadzone and clamps unit circle', () => {
  // Inside deadzone (0.05 < 0.1)
  const inside = computeStickOutput(5, 0, 100, 0.1, 1.0);
  assert.equal(inside.x, 0);
  assert.equal(inside.y, 0);
  assert.equal(inside.active, false);

  // Full right push beyond max radius clamps to 1.0
  const fullRight = computeStickOutput(150, 0, 100, 0.1, 1.0);
  assert.equal(fullRight.x, 1);
  assert.equal(fullRight.y, 0);
  assert.equal(fullRight.active, true);

  // Screen up (negative dy) produces positive controller Y
  const fullUp = computeStickOutput(0, -100, 100, 0.05, 1.0, false);
  assert.equal(fullUp.x, 0);
  assert.equal(fullUp.y, 1);

  // Inverted Y flips vertical output
  const invertedUp = computeStickOutput(0, -100, 100, 0.05, 1.0, true);
  assert.equal(invertedUp.y, -1);
});

test('computeDPadDirections supports cardinals and 45-degree diagonals', () => {
  // Center deadzone
  assert.deepEqual(computeDPadDirections(2, 2, 50), {
    up: false,
    down: false,
    left: false,
    right: false,
  });

  // Pure UP (negative dy)
  assert.deepEqual(computeDPadDirections(0, -40, 50), {
    up: true,
    down: false,
    left: false,
    right: false,
  });

  // Diagonal UP + LEFT
  assert.deepEqual(computeDPadDirections(-30, -30, 50), {
    up: true,
    down: false,
    left: true,
    right: false,
  });

  // Diagonal DOWN + RIGHT
  assert.deepEqual(computeDPadDirections(30, 30, 50), {
    up: false,
    down: true,
    left: false,
    right: true,
  });
});

test('normalizeAngleDelta and computeGyroDelta handle 360-degree wrap-around', () => {
  assert.equal(normalizeAngleDelta(1, 359), 2);
  assert.equal(normalizeAngleDelta(359, 1), -2);

  // Null sensors return unavailable and zeroed deltas (never fabricated)
  const missing = computeGyroDelta(
    { alpha: null, beta: null, gamma: null },
    { alpha: 0, beta: 0, gamma: 0 },
    0.05,
    1.0,
    false,
    false,
  );
  assert.equal(missing.available, false);
  assert.equal(missing.deltaX, 0);

  // Valid sensor reading
  const active = computeGyroDelta(
    { alpha: 345, beta: 15, gamma: 0 },
    { alpha: 0, beta: 0, gamma: 0 },
    0.05,
    1.0,
    false,
    false,
  );
  assert.equal(active.available, true);
  assert.ok(active.deltaX > 0);
  assert.ok(active.deltaY > 0);
});

test('classifyTouchpadGesture detects tap, double-tap, and swipes', () => {
  assert.equal(classifyTouchpadGesture(0.5, 0.5, 0.51, 0.51, 120, false), 'TAP');
  assert.equal(classifyTouchpadGesture(0.5, 0.5, 0.51, 0.51, 120, true), 'DOUBLE_TAP');
  assert.equal(classifyTouchpadGesture(0.2, 0.5, 0.7, 0.52, 200, false), 'SWIPE_RIGHT');
  assert.equal(classifyTouchpadGesture(0.7, 0.5, 0.2, 0.52, 200, false), 'SWIPE_LEFT');
  assert.equal(classifyTouchpadGesture(0.5, 0.7, 0.5, 0.2, 200, false), 'SWIPE_UP');
  assert.equal(classifyTouchpadGesture(0.5, 0.2, 0.5, 0.7, 200, false), 'SWIPE_DOWN');
});
