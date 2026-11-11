import type { EyeMode } from './eyeState';

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
