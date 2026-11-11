export type EyeMode = 'idle' | 'thinking' | 'speaking' | 'action';
export const eyeModeLabel: Record<EyeMode, string> = {
  idle: 'STANDBY', thinking: 'PROCESSING', speaking: 'VOICE ACTIVE', action: 'EXECUTING',
};
export const eyeModeColor: Record<EyeMode, string> = {
  idle: '#75E8F2', thinking: '#D8B76C', speaking: '#1BC6B0', action: '#278BCE',
};
