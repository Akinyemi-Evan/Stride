# Stride

**Your everyday adventure.** An iOS, Android, and web walking game built with Expo and TypeScript.

Your selfie becomes a realistic six-stage game character. Start each day with an exaggerated large avatar; walking unlocks progressively leaner forms at 20%, 40%, 60%, 80%, and 100% of your own goal. Finish at peak form, claim quests, collect XP and coins, and compare progress with accepted friends.

## Run the playable demo

Requires Node.js 24 and npm.

```sh
npm ci
npm run web
```

The app starts in a clearly labeled **demo playground**, with a generated starter avatar and fictional friends. Add simulated steps, claim quests, adjust your next goal, preview all six forms, and inspect your walking journal. Demo and real progress use different local storage keys; simulated steps are never uploaded.

```sh
npm run check   # TypeScript + game-logic tests
npm run build   # static browser build in dist/
```

## What is implemented

- Responsive dashboard, avatar gallery, friend board, walking journal, mobile navigation.
- Six realistic starter-avatar images in one atlas; no external asset host needed.
- Goal-based transformations, one-time quest claims, XP, coins, level, daily rollover, history and streaks.
- Camera/photo-library capture and explicit consent before selfie processing.
- **iPhone:** reads today's cumulative Steps from Apple Health using HealthKit statistics, including Apple Watch steps once synced to Health. Requests read-only Steps access and refreshes in the foreground and on resume.
- **Android:** reads the day's aggregated Steps from Health Connect in a native build. A compatible fitness app must be writing steps to Health Connect; Stride does not create missing records.
- Supabase email/password authentication, private profiles, exact-handle friend requests, accept/remove, accepted-friend leaderboards, cloud step totals and signed avatar URLs.
- Authenticated server-side selfie generation through OpenAI Images; asynchronous job polling, a maximum of three jobs per account per day, no API keys in the mobile bundle.
- Private generated-avatar storage and deletion. Original selfies are sent directly to the image provider from worker memory, not stored in the app database or bucket.

## Backend setup

This repository includes the complete initial migration and two Edge Functions. They are **not deployed automatically** and do not run until you configure your own project.

1. Create a Supabase project, enable email/password authentication, and set the password minimum to at least eight characters. Keep email confirmation enabled for production.
2. Copy `.env.example` to `.env`, then set the project's URL and publishable/anon key. The client configuration is public; the service-role key is not.
3. Install the Supabase CLI using its official installation instructions. Link your project, apply the schema, and deploy the functions:

```sh
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push  # includes the Apple Health source migration
supabase functions deploy generate-avatar
supabase functions deploy delete-avatar
```

4. Set `OPENAI_API_KEY` in the Supabase Edge Function secrets dashboard. Optional: `AVATAR_IMAGE_MODEL` (default `gpt-image-2`). Supabase supplies its own service-role and project secrets. **Never put a service-role or OpenAI key in an `EXPO_PUBLIC_` variable, source code, or chat.**
5. Restart Expo. Create an account with a unique lowercase handle, confirm the email, sign in, and leave demo mode. Both friends need accounts. Add by handle and accept the incoming request.
6. Take a selfie, consent to processing, and choose **Generate my avatar**. Provider generation is billable to the configured API account. Stride never calls the provider in demo mode. Allow up to several minutes; the completed avatar also loads on the next launch.

The migration uses row-level security, prevents client writes to avatar paths and friendship status, and validates step-sync requests through RPCs. The functions explicitly validate JWTs with Supabase Auth before using service credentials. Raw photos, JWTs, and provider responses are not logged.

## Run on a phone

```sh
npx expo prebuild
npx expo run:android
# On macOS with Xcode:
npx expo run:ios
```

Alternatively configure an Expo account and EAS project, then create a development build using `eas build --profile development --platform android` (or `ios`). Development builds are required for Health Connect; Expo Go is not the Android test target. Bundle identifiers in `app.json` are placeholders to change before store publication.

On iOS, install a new native development/TestFlight build (Expo Go and Safari cannot access HealthKit), tap **Connect Apple Health**, and allow read access to **Steps**. The Expo HealthKit plugin adds the HealthKit entitlement and usage description. Enable HealthKit for your Apple App ID and regenerate provisioning profiles when building for devices. Stride never requests write access or other health types. If totals are missing, check Stride’s Steps access in the Health app and allow your Apple Watch to sync. HealthKit cannot reveal whether read permission was denied; an empty query leaves existing progress intact. On Android, grant only read access to Steps in Health Connect and verify a source app is sharing steps. **Connect steps** reads the full day, including activity recorded while Stride was closed. The UI only refreshes while the app runs or resumes; no background JavaScript tracking, GPS location, or notifications are implemented.

## Product rules

- New installs start at zero. No fabricated real step history or friend activity.
- The avatar is cosmetic game progress, not a health assessment or real weight-loss estimate.
- Goal range: 1,000–50,000. Once the day has any steps, a new goal applies tomorrow, so lowering it cannot instantly complete the current challenge.
- Step totals are cumulative replacements, not additive sensor events. Cloud sync is idempotent and retains the highest reported total.
- A quest can be claimed once per local calendar day. Form resets at local midnight; XP and coins persist locally. Revisiting an archived day cannot reclaim its rewards.
- XP, coins, streak history, and future goals are stored on the device. The current day's real steps and avatar are restored from the backend when signed in. Cross-device reward reconciliation is a future feature.
- Friends compare percentages of personal goals, capped at 100%. Their displayed day uses the viewer's local date. No raw selfie, route, location, or body measurements are shared.
- Friend profiles and images are private to accepted friends. Already issued image URLs expire after one hour, so revocation is not instantaneous for a previously issued URL.

## Release status and remaining work

This is a runnable initial implementation, not an App Store release. Browser builds and pure game behavior can be tested locally. Native sensors, camera permissions, the deployed database policies, email delivery, real two-account social flows, and the billable generation pipeline require configured services and physical-device testing. Do not claim those live integrations were validated based on the browser demo.

Before a public launch: validate both native builds and midnight/resume behavior on devices; test two-user access isolation and revoked friends; add a real privacy-policy URL, account deletion, store Health Connect declarations, provider spending limits, production monitoring, and abuse controls. Step values are user-device reports, not attested proof; the initial leaderboard is not suitable for cash prizes or fraud-sensitive competitions. Validate HealthKit totals against Apple Health after iPhone/Apple Watch synchronization, including denied/revoked permissions and locked-device queries. Native distribution and backend hosting remain separate deployment steps.

## Structure

- `App.tsx`: complete cross-platform UI and user flows.
- `src/game.ts`: pure, tested progression rules.
- `src/steps.ts`: cumulative native step adapters.
- `src/backend.ts`: authentication, friends, progress and avatar client.
- `src/Avatar.tsx`: six-frame atlas rendering.
- `supabase/migrations`: schema, RLS and RPCs.
- `supabase/functions`: authenticated avatar generation and deletion.
- `tests`: regression tests for rewards, dates, goals and repeated syncs.
- `docs`: artwork provenance and validation notes.

## Official integration references

- [React Native HealthKit](https://kingstinct.com/react-native-healthkit/)
- [Expo ImagePicker](https://docs.expo.dev/versions/latest/sdk/imagepicker/)
- [React Native Health Connect](https://matinzd.github.io/react-native-health-connect/docs/get-started/)
- [Supabase React Native Auth](https://supabase.com/docs/guides/auth/quickstarts/react-native)
- [OpenAI Images API](https://developers.openai.com/api/reference/resources/images)
