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

export type SplashShardMotion = {
  radial: number;
  tangent: number;
  depth: number;
  stretch: number;
  width: number;
  twist: number;
};

/** Asymmetric, elongated motion for chrome fragments breaking away from the eye rim. */
export function getSplashShardMotion(angle: number, time: number, index: number, intensity: number): SplashShardMotion {
  const strength = Math.max(0.25, Math.min(1.8, intensity));
  const phase = index * 1.731;
  const pulse = 0.5 + 0.5 * Math.sin(time * (0.72 + (index % 4) * 0.09) + phase);
  const directional = Math.sin(angle * 2.0 + time * 0.31 + phase * 0.2);
  return {
    radial: 1.34 + (index % 4) * 0.105 + pulse * 0.105 * strength + directional * 0.045,
    tangent: Math.sin(time * 0.83 + phase) * 0.095 * strength,
    depth: 0.08 + Math.sin(time * 1.12 + phase) * 0.19 * strength,
    stretch: 1.45 + (index % 3) * 0.42 + pulse * 0.36 * strength,
    width: 0.72 + (index % 2) * 0.16 + pulse * 0.08,
    twist: Math.sin(time * 0.66 + phase) * 0.24,
  };
}

/**
 * A short top-down chrome eyelid sweep. The animation clock advances at
 * 0.72 units per second, so this produces a natural blink roughly every 8 seconds.
 */
export function getEyeBlinkAmount(time: number): number {
  const period = 5.8;
  const duration = 0.42;
  const closeFraction = 0.34;
  const phase = ((time % period) + period) % period;
  const start = period - duration;

  if (phase < start) return 0;

  const progress = (phase - start) / duration;
  const ease = (value: number) => value * value * (3 - 2 * value);

  if (progress <= closeFraction) {
    return ease(progress / closeFraction);
  }

  return 1 - ease((progress - closeFraction) / (1 - closeFraction));
}


export type ChromeSurfaceProfile = { radial: number; depth: number; reflection: number };

/** High-contrast liquid-chrome folds and studio reflection bands for the sculpted shell. */
export function getChromeSurfaceProfile(angle: number, crossAngle: number, time: number, intensity: number): ChromeSurfaceProfile {
  const strength = Math.max(0.25, Math.min(1.8, intensity));
  const crest = Math.pow(Math.max(0, Math.sin(angle * 7.0 + time * 0.48 + 0.6)), 10);
  const broad = Math.sin(angle * 2.0 + time * 0.36) * 0.105
    + Math.sin(angle * 3.0 - time * 0.29 + 0.8) * 0.065;
  const narrow = Math.sin(angle * 5.0 + time * 0.62) * 0.035;
  const highlightA = Math.exp(-Math.pow((crossAngle - 0.42) / 0.22, 2));
  const highlightB = Math.exp(-Math.pow((crossAngle + 1.05) / 0.16, 2)) * 0.82;
  const reflection = Math.min(1.8, highlightA * 1.25 + highlightB + crest * 0.45);
  return {
    radial: (broad + narrow + crest * 0.19) * strength,
    depth: (Math.sin(angle * 3.0 + time * 0.52) * 0.055 + crest * 0.12) * strength,
    reflection,
  };
}

export type ChromeShellLayout = {
  irisRadius: number;
  irisZ: number;
  outerRadius: number;
  outerTube: number;
  outerZ: number;
  innerRadius: number;
  innerTube: number;
  innerZ: number;
  highlightTube: number;
  highlightZ: number;
};

/** Front-facing chrome geometry, with a clear annular gap around the iris. */
export function getChromeShellLayout(): ChromeShellLayout {
  return {
    irisRadius: 0.78,
    irisZ: 0.94,
    // The torus inner edge overlaps the iris slightly, eliminating the exposed black gap.
    outerRadius: 1.02,
    outerTube: 0.29,
    outerZ: 1.02,
    innerRadius: 0.73,
    innerTube: 0.29,
    innerZ: 1.02,
    highlightTube: 0.026,
    highlightZ: 1.19,
  };
}
