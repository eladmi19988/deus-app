import test from 'node:test';
import assert from 'node:assert/strict';
import { getEyePulse, getEyeMotion } from './eyeAnimation.ts';

test('idle eye keeps a subtle resting pulse', () => {
  assert.ok(Math.abs(getEyePulse('idle', 0) - 1) < 1e-9);
});

test('thinking eye uses a slow focused pulse', () => {
  assert.ok(Math.abs(getEyePulse('thinking', Math.PI / 6) - 1.018) < 1e-9);
});

test('speaking eye uses a quicker, stronger pulse', () => {
  assert.ok(Math.abs(getEyePulse('speaking', Math.PI / 16) - 1.035) < 1e-9);
});

test('action eye has a distinct alert pulse', () => {
  assert.ok(Math.abs(getEyePulse('action', Math.PI / 10) - 1.025) < 1e-9);
});

test('each system mode produces a distinct holographic response profile', () => {
  const idle = getEyeMotion('idle', 0);
  const thinking = getEyeMotion('thinking', 0);
  const speaking = getEyeMotion('speaking', 0);
  const action = getEyeMotion('action', 0);

  assert.equal(idle.scanSpeed, 0.18);
  assert.equal(thinking.scanSpeed, 0.9);
  assert.equal(speaking.scanSpeed, 1.6);
  assert.equal(action.scanSpeed, 2.2);
  assert.ok(idle.glow < thinking.glow);
  assert.ok(thinking.glow < speaking.glow);
  assert.ok(speaking.glow < action.glow);
});

test('holographic motion values remain finite for long-running animation times', () => {
  for (const mode of ['idle', 'thinking', 'speaking', 'action']) {
    const motion = getEyeMotion(mode, 1_000_000);
    for (const value of Object.values(motion)) assert.ok(Number.isFinite(value));
    assert.ok(motion.pulse > 0);
    assert.ok(motion.pupilScale > 0);
  }
});
