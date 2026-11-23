import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildButtonEvent,
  buildDPadEvent,
  buildJoystickEvent,
  buildTouchpadEvent,
  buildTriggerEvent,
  isValidLocalWebSocketUrl,
} from './companionBridge';

test('companionBridge builds valid clamped JSON protocol payloads', () => {
  const btn = buildButtonEvent('L1', true, 123456789);
  assert.deepEqual(btn, {
    type: 'button',
    button: 'L1',
    pressed: true,
    timestamp: 123456789,
  });

  const joy = buildJoystickEvent('LEFT', 1.4, -0.72345, 500);
  assert.deepEqual(joy, {
    type: 'joystick',
    stick: 'left',
    x: 1,
    y: -0.7235,
    timestamp: 500,
  });

  const trig = buildTriggerEvent('R2', true, 600);
  assert.deepEqual(trig, {
    type: 'trigger',
    trigger: 'R2',
    value: 1,
    timestamp: 600,
  });

  const pad = buildTouchpadEvent('move', 0.5, 1.8, 700);
  assert.deepEqual(pad, {
    type: 'touchpad',
    action: 'move',
    x: 0.5,
    y: 1,
    timestamp: 700,
  });

  const dpad = buildDPadEvent({ up: true, down: false, left: true, right: false }, 800);
  assert.deepEqual(dpad, {
    type: 'dpad',
    up: true,
    down: false,
    left: true,
    right: false,
    timestamp: 800,
  });
});

test('isValidLocalWebSocketUrl restricts connections to loopback ws/wss URLs', () => {
  assert.equal(isValidLocalWebSocketUrl('ws://127.0.0.1:8765'), true);
  assert.equal(isValidLocalWebSocketUrl('ws://localhost:8765'), true);
  assert.equal(isValidLocalWebSocketUrl('ws://192.168.1.50:8765'), false);
  assert.equal(isValidLocalWebSocketUrl('http://127.0.0.1:8765'), false);
  assert.equal(isValidLocalWebSocketUrl('not-a-url'), false);
});
