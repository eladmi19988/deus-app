# D.E.U.S. — The Living Eye

Expo SDK 58 / React Native TypeScript application for Android, iOS and web.

## Current foundation
- 3D eye rendered with Three.js through `expo-gl`.
- Touch-driven pupil tracking with eased movement.
- Procedural iris shader, metallic rings, lighting and floating particles.
- Idle, thinking, speaking and action visual states.
- Supabase client with persistent auth session; sign-up/sign-in UI.
- Chat function invocation scaffold for the deployed `deus-chat` Edge Function.

## Setup
1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env` and fill in the Supabase URL and publishable/anon key.
3. Start: `npx expo start`

Never put the Anthropic API key or Supabase service-role key in the app. They belong only in Supabase Edge Function secrets.

## Expo project
- Owner: `eladmi19988`
- Slug: `deus`
- EAS project ID: `0fb803d8-5553-4472-9b81-e126f3795c76`

## Notes
The current eye is an initial real-time 3D implementation, not yet a frame-accurate recreation of the supplied reference video. Fine geometry, asymmetrical shell sculpting, iris detail and motion timing need visual comparison on-device.

## Verification performed
- `npx tsc --noEmit` — passed.
- `npx expo export --platform android` — passed.
- `npx expo export --platform web` — passed.
- `npx expo-doctor` — 20/20 checks passed.

The iOS target is configured, but an iOS build/device run has not been performed in this Linux sandbox.

## Supabase backend
The project includes local source snapshots for the three deployed Edge Functions under `supabase/functions/`:
- `deus-chat` — authenticated chat requests to Anthropic; expects `conversationId` and `message`.
- `deus-memory` — authenticated private/workspace memory operations.
- `deus-command` — proposes and records approval/denial; it does **not** execute OS/device actions.

The app uses the public Supabase publishable key from `.env` (never a service-role key). The `.env` file is local-only and excluded from the source archive. Set the following in your local environment:
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` (the publishable key is accepted by the client)

The Anthropic key and model must be configured as Supabase Edge Function secrets (`ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`). Their values cannot be read back through the available project tools, so live Anthropic completion has not yet been verified.

## Verification

- `npm test` runs the eye-state animation tests.
- `npx tsc --noEmit` checks the TypeScript application.
- `npx expo-doctor` checks Expo project configuration and dependencies.
- `npx expo export --platform android` and `npx expo export --platform web` validate both export targets.

The eye animation reads its current mode without rebuilding the WebGL scene, so idle, thinking, speaking, and action states update while the eye remains mounted.
