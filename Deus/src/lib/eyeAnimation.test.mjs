import test from 'node:test';
import assert from 'node:assert/strict';
import { getEyePulse } from './eyeAnimation.ts';

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
