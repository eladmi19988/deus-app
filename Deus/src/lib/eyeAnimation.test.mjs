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

test('liquid chrome shell has a stable organic pulse and bounded droplet orbit', async () => {
  const { getLiquidShellMotion } = await import('./eyeAnimation.ts');
  const idle = getLiquidShellMotion('idle', 0);
  const action = getLiquidShellMotion('action', Math.PI / 2);

  assert.ok(idle.shellPulse > 0.9 && idle.shellPulse < 1.1);
  assert.ok(action.shellPulse > 0.9 && action.shellPulse < 1.1);
  assert.ok(idle.dropletOrbit > 0);
  assert.ok(action.dropletOrbit > idle.dropletOrbit);
  assert.ok(Number.isFinite(action.splashAmount));
});

test('liquid chrome deformation stays finite and bounded while changing over time', async () => {
  const { getLiquidShellWave } = await import('./eyeAnimation.ts');
  const samples = [];
  for (let frame = 0; frame < 80; frame++) {
    for (let segment = 0; segment < 32; segment++) {
      const angle = (segment / 32) * Math.PI * 2;
      const wave = getLiquidShellWave(angle, frame * 0.17, 1.2);
      assert.ok(Number.isFinite(wave.radial));
      assert.ok(Number.isFinite(wave.depth));
      assert.ok(Math.abs(wave.radial) < 0.35);
      assert.ok(Math.abs(wave.depth) < 0.2);
      samples.push(wave.radial);
    }
  }
  assert.ok(Math.max(...samples) - Math.min(...samples) > 0.04);
});

test('liquid chrome deformation remains subtle in idle and intensifies in action mode', async () => {
  const { getLiquidShellWave, getLiquidShellMotion } = await import('./eyeAnimation.ts');
  const idle = getLiquidShellWave(1.2, 2.4, getLiquidShellMotion('idle', 2.4).splashAmount);
  const action = getLiquidShellWave(1.2, 2.4, getLiquidShellMotion('action', 2.4).splashAmount);
  assert.ok(Math.abs(action.radial) > Math.abs(idle.radial));
});

test('liquid chrome fragments stretch into directional splash shards instead of round dots', async () => {
  const { getSplashShardMotion } = await import('./eyeAnimation.ts');
  const idle = getSplashShardMotion(0.8, 2.1, 3, 0.55);
  const action = getSplashShardMotion(0.8, 2.1, 3, 1.4);
  for (const value of Object.values(action)) assert.ok(Number.isFinite(value));
  assert.ok(action.stretch > 1.5);
  assert.ok(action.stretch > idle.stretch);
  assert.ok(action.width > 0 && action.width < 1);
  assert.ok(action.depth !== idle.depth);
});

test('chrome blink fully covers the eye briefly and then reopens on a repeating cycle', async () => {
  const { getEyeBlinkAmount } = await import('./eyeAnimation.ts');
  const blinkStart = 5.8 - 0.42;

  assert.equal(getEyeBlinkAmount(0), 0);
  assert.equal(getEyeBlinkAmount(blinkStart), 0);
  assert.ok(getEyeBlinkAmount(blinkStart + 0.42 * 0.34) > 0.98);
  assert.equal(getEyeBlinkAmount(5.8), 0);
  assert.equal(getEyeBlinkAmount(5.8 + 0.2), getEyeBlinkAmount(0.2));
});

test('chrome blink remains finite and between open and fully closed for negative and long-running times', async () => {
  const { getEyeBlinkAmount } = await import('./eyeAnimation.ts');
  for (const time of [-1000, -0.2, 0, 5.4, 1_000_000]) {
    const amount = getEyeBlinkAmount(time);
    assert.ok(Number.isFinite(amount));
    assert.ok(amount >= 0 && amount <= 1);
  }
});
