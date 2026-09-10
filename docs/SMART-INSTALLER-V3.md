# SCENOVA Smart Installer 3.1.0

Smart Installer 3.1.0 upgrades the Windows setup from a file copier into a lifecycle manager for MT5, the SCENOVA EA and Device Agent. It preserves the existing Slot/device security model and does not read or store MT5 passwords.

## Architecture

The installer is split conceptually into three brains:

- **Discovery Brain**: finds MT5 installations/data folders, identifies broker/path/running state, discovers existing SCENOVA profiles and chooses the safest terminal.
- **Install & Repair Brain**: installs only missing/outdated components, migrates presets without resetting customer values, stages EA updates safely, repairs the Agent/MT5 startup and supports rollback.
- **Verification Brain**: checks hash, Agent, EA heartbeat, runtime Account/Server, version compatibility and overall installation health before reporting READY.

The default UI is a no-tech flow. Advanced Mode exposes paths, hashes, versions, profile count, SafeToRestart and diagnostics.

### 3.1 Light UI and release-channel safety

Version 3.1 switches the installer to a white/light interface for clearer status reading. Normal customer mode displays only the resolved release label (for example `Release: Stable`) and hides the Stable/Beta/AdminTest selector. The channel selector becomes visible only in Advanced Mode.

This is a UI safeguard, not a security boundary: the Server still authorizes/downgrades non-Stable channels. Customers cannot obtain an AdminTest artifact merely by changing a local UI value.

Preset migration in 3.1 also adds missing Indicator Intelligence V6 defaults without overwriting existing customer values:
- `InpIndicatorV6Mode=1` (SOFT_WEIGHT)
- `InpVolumeProfileBars=144`
- `InpDonchianPeriod=20`
- `InpIndicatorMaxWaitSeconds=20`

## Upgrade coverage

1. **Auto Detect MT5** — scans MetaQuotes data folders and Windows uninstall registry entries.
2. **Auto Detect Account** — Account/Server comes from the live EA heartbeat after MT5 starts; the installer never scrapes credentials.
3. **Smart Terminal Matching** — scores existing SCENOVA target, running terminal, executable match and profile history.
4. **Pre-install Health Check** — checks Windows architecture, MT5, executable match, MQL5 write access, disk space, network, Agent, signature and existing install.
5. **One-click Auto Fix** — Repair creates required folders, migrates preset, repairs/restarts Agent and starts the selected MT5 when safe.
6. **Smart Update** — computes Agent/EA/Preset component state instead of reinstalling everything blindly.
7. **Component Update** — Agent, EA and Preset are evaluated independently.
8. **EX5 SHA-256 Verification** — all downloaded/staged EA bytes must match the server artifact hash before activation.
9. **Signed Release Verification** — installer inspects its Authenticode certificate/trust chain; GitHub release signing remains the publishing authority.
10. **Safe Update Mode** — a new EA is staged only while Server reports RUNNING/positions; live EX5 replacement waits for SafeToRestart.
11. **Automatic Rollback** — keeps two local SCENOVA snapshots and restores the latest safe EA/preset/config snapshot.
12. **Post-install Self Test** — confirms Agent/EA heartbeat, hash, required versions and runtime Account/Server.
13. **Installation Score 0–100** — weighted health assessment produces READY / AUTO FIX / NEED ACTION guidance.
14. **Guided Recovery** — structured installer error codes map to Thai recovery instructions.
15. **No-Tech Mode** — default interface focuses on terminal selection, health, install/repair/verify and status.
16. **Advanced Mode** — exposes data path, terminal executable, broker hint, hashes, profile identity, SafeToRestart, versions and backup path.
17. **Multi-MT5 Management** — profile store v3 supports multiple SCENOVA Slot/Instance profiles under one Windows user and Smart Agent loops all profiles.
18. **Existing Install Discovery** — detects EA/profile/Agent already present and preserves authenticated configuration.
19. **Repair Mode** — repairs SCENOVA without requiring full uninstall/reinstall.
20. **Clean Uninstall** — removes only the selected SCENOVA Expert/preset/profile and leaves MT5, other EAs, indicators and templates untouched.
21. **Backup User Configuration** — EA, preset and SCENOVA config/profile files are snapshotted before destructive update/rollback operations.
22. **Preset Migration** — credentials are refreshed, missing defaults are added and existing customer setting values are preserved.
23. **Compatibility Matrix** — Agent heartbeat returns required Agent and EA versions; UI/Agent can detect component mismatch.
24. **Release Channels** — Stable, Beta and AdminTest are supported. Non-stable channels require explicit server configuration/authorization.
25. **Canary Deployment** — optional deterministic beta percentage is supported through SCENOVA_CANARY_PERCENT and is disabled by default.
26. **Remote Diagnostics** — installer status/health/component telemetry is stored in existing bot metrics/audit logs.
27. **Privacy-safe Installer Telemetry** — diagnostics are sanitized; password, install token and device secret are not included in telemetry detail/log output.
28. **Smart Error Codes** — typed errors include MT5 not found, MQL5 write failure, API unavailable, expired enrollment, hash failure, offline EA, account mismatch, update pending and rollback/signature/disk conditions.
29. **Download Resume / Retry** — EA artifact endpoint supports byte offset and the Windows client keeps partial staging data across retry attempts, then verifies final SHA-256.
30. **Zero-config First Run** — one detected terminal is auto-selected; the installer scans, health-checks, enrolls, installs, starts Agent/MT5 and verifies the live EA in one flow.

## Safety invariants

- SafeToRestart from the Server is authoritative for replacing/reloading an already installed EA.
- Open positions are never intentionally interrupted by an installer-driven EA update.
- Account identity is confirmed from the running EA. The installer does not read MT5 password files.
- Stable remains the default release channel.
- Beta/AdminTest artifacts are separate paths and cannot silently replace Stable unless explicitly enabled.
- Canary rollout is opt-in by server environment variable.
- Rollback and uninstall require a safe stopped state when an authenticated profile can report runtime status.
- Legacy config-v2 is maintained as a recovery-compatible copy of the primary v3 profile.

## Server configuration

Stable uses the existing EA artifact/version configuration.

Optional channels:

- `EA_ARTIFACT_PATH_BETA`
- `SCENOVA_EA_VERSION_BETA`
- `EA_ARTIFACT_PATH_ADMIN_TEST`
- `SCENOVA_EA_VERSION_ADMIN_TEST`
- `SCENOVA_BETA_ENABLED=true` to allow customer Beta requests
- `SCENOVA_CANARY_PERCENT=0..100` for deterministic Beta canary rollout

If optional channel artifacts are not configured, the Server resolves the client back to Stable.

## Publishing

The Windows project and API default installer version are both 3.0.0. The GitHub build workflow now derives the versioned download filename from the project file instead of hard-coding an old installer version.

The Windows publish workflow still performs the existing optional Azure Artifact Signing step and verifies the Authenticode signature before publishing when signing is enabled.
