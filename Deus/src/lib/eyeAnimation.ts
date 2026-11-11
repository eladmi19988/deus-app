import type { EyeMode } from './eyeState';

export type EyeMotion = {
  pulse: number;
  pupilScale: number;
  scanSpeed: number;
  glow: number;
  gazeSensitivity: number;
  orbitSpeed: number;
};

export function getEyePulse(mode: EyeMode, time: number): number {
  switch (mode) {
    case 'thinking':
      return 1 + Math.sin(time * 3) * 0.018;
    case 'speaking':
      return 1 + Math.sin(time * 8) * 0.035;
    case 'action':
      return 1 + Math.sin(time * 5) * 0.025;
    case 'idle':
    default:
      return 1 + Math.sin(time * 1.4) * 0.008;
  }
}

export function getEyeMotion(mode: EyeMode, time: number): EyeMotion {
  const pulse = getEyePulse(mode, time);

  switch (mode) {
    case 'thinking':
      return {
        pulse,
        pupilScale: 0.94,
        scanSpeed: 0.9,
        glow: 0.78,
        gazeSensitivity: 0.78,
        orbitSpeed: 0.55,
      };
    case 'speaking':
      return {
        pulse,
        pupilScale: 1.06,
        scanSpeed: 1.6,
        glow: 0.96,
        gazeSensitivity: 1.12,
        orbitSpeed: 0.92,
      };
    case 'action':
      return {
        pulse,
        pupilScale: 0.88,
        scanSpeed: 2.2,
        glow: 1.2,
        gazeSensitivity: 1.3,
        orbitSpeed: 1.55,
      };
    case 'idle':
    default:
      return {
        pulse,
        pupilScale: 1,
        scanSpeed: 0.18,
        glow: 0.58,
        gazeSensitivity: 1,
        orbitSpeed: 0.2,
      };
  }
}

export type LiquidShellMotion = {
  shellPulse: number;
  dropletOrbit: number;
  splashAmount: number;
};

export function getLiquidShellMotion(mode: EyeMode, time: number): LiquidShellMotion {
  const intensity = mode === 'action' ? 1.35 : mode === 'speaking' ? 1.12 : mode === 'thinking' ? 0.82 : 0.58;
  return {
    shellPulse: 1 + Math.sin(time * (1.1 + intensity)) * 0.035 * intensity,
    dropletOrbit: 0.22 + intensity * 0.34,
    splashAmount: intensity * (0.72 + (Math.sin(time * 1.7) + 1) * 0.14),
  };
}

export type LiquidShellWave = {
  radial: number;
  depth: number;
};

/** Deterministic vertex displacement for a continuously moving liquid-chrome rim. */
export function getLiquidShellWave(angle: number, time: number, intensity: number): LiquidShellWave {
  const strength = Math.max(0, Math.min(1.8, intensity));
  const asymmetry = Math.sin(angle * 2.0 + time * 0.37) * 0.62;
  const broadWave = Math.sin(angle * 2.0 + time * 0.82) * 0.021;
  const rollingWave = Math.sin(angle * 3.0 - time * 1.13 + 0.7) * 0.017;
  const fineWave = Math.sin(angle * 8.0 + time * 1.63) * 0.011;
  const splash = Math.pow(Math.max(0, Math.sin(angle * 5.0 + asymmetry + time * 0.94)), 8.0) * 0.105;
  const depthWave = Math.sin(angle * 3.0 + time * 1.08) * 0.022;
  return {
    radial: (broadWave + rollingWave + fineWave + splash) * strength,
    depth: (depthWave + splash * 0.58) * strength,
  };
}
