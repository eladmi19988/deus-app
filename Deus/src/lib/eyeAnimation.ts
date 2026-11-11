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
