# Validation scope

Automated validation covers TypeScript, browser production export, and the game engine: stage boundaries, quest eligibility and duplicate claims, local midnight rollover, future goal changes, archived-day revisits, corrupt saves, separation of demo and phone totals, and cumulative step refreshes.

The database test executes the actual migration in PGlite (PostgreSQL) with Auth/Storage fixtures. It verifies private progress and avatar access, pending and accepted friendship behavior, rejection of third-party acceptance and client avatar-path updates, revocation after friend removal, step-sync idempotence, and rejection of demo uploads. This is a schema regression test, not a substitute for testing a deployed Supabase project.

The local browser preview could not be opened by the available remote browser. No claim of completed visual/browser interaction testing is made. Native hardware, deployed Auth/email, phone camera capture, and billable avatar generation are not exercised in this environment. See README release notes for the remaining device and service checks.

Recorded results: TypeScript passed; all eight tests passed, including the PostgreSQL privacy test; web production export succeeded; iOS and Android JavaScript/Hermes exports succeeded. These exports validate bundling and module resolution, not Xcode/Gradle native compilation or device execution.

## Apple Health integration

Tests cover Steps-only read authorization, local-day aggregate queries, repeated totals, midnight boundaries, missing/denied-read data, and invalid/query-failure handling. The database test applies both migrations and accepts Apple Health step totals. Native HealthKit signing, permissions, and iPhone/Apple Watch totals still require a real iPhone build; JavaScript exports cannot validate them. No background HealthKit delivery is configured.
