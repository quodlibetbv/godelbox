# Project guidance

## Scope and authority

Read `README.md`, `_specs/ace-mvp-specification-v1.1.md`, and `docs/implementation-plan.md` before implementation. The specification governs product behavior; the plan records sequencing, not a replacement contract. Current user instructions take precedence.

Godelbox is the project name. Preserve the specification's ACE SDK, storage, runtime, and export identifiers unless a deliberate contract revision is requested. Keep the supplied specification intact; record interpretation or proposed changes separately.

The repository implements the static adaptive engine in `src/`, built to `dist/` and published by `.github/workflows/pages.yml`. Read `docs/implementation-report.md` for actual acceptance and live-provider evidence. Do not claim behavior or provider/browser support beyond executed evidence. Keep the supplied specification intact.

Read `PRODUCT.md` when changing UI. Use the fixed strict port 5173, Node version in `.nvmrc`, and locked dependencies. `npm run build`, `npm run test`, and `npm run test:e2e` are the delivery checks. Browser tests serve the production build, so rebuild after source changes. Keep public assets in `public/`; publish only `dist/`, never the repository root, exports, browser state, or local credentials. Preserve immutable action pins and minimal permissions.

## Architecture

- Build a static TypeScript/Vue 3/Vite host. Do not add a backend, relay, API route, serverless function, Vite proxy, or environment-variable model configuration.
- Keep host controls, credentials, request limits, and usage outside the versioned application filesystem. The host prompt works with no running iframe.
- The writable VFS and immutable full snapshots are the foundation. Code, data, dependencies, instructions, and conversation are files restored together. Do not introduce competing authoritative state fields.
- Use one iframe with `sandbox="allow-scripts"`. Generated code and imported application libraries execute only inside it. Do not grant same-origin, fullscreen, navigation, or popup permissions.
- Use a fixed host-owned bootstrap and structured payload transfer. Never concatenate generated file contents into host markup or scripts. Bind RPC to the expected iframe, fresh runtime session, and dedicated message port.
- Support generic browser-ready classic scripts. Vue is a seed dependency, not a permanent application requirement. Do not add app categories, a general npm bundler, or generated-app compilation.
- Package the deterministic seed, pinned Vue bytes, version provenance, and license locally. Start/restore must not depend on a CDN or AI request.

## Persistence and operation control

- Centralize mutations in one host operation coordinator; admit only one writable/executing tab through Web Locks.
- Use short IndexedDB transactions. Never hold a mutation lock or database transaction across network/model requests.
- Validate VFS paths, encodings, decoded sizes, RPC parameters, tool schemas, and import references at the host boundary. Use prototype-safe maps.
- Advance workspace revisions monotonically, including on restore. Update files, snapshot, and head atomically and acknowledge writes only after transaction completion.
- Snapshots are immutable. Save dirty work before edit/restore; preserve branches and old data. Never clear databases or delete history as generic recovery.
- AI editing uses an in-memory draft against an expected revision. Validate success and current identity before tool dispatch, commit, and activation. Malformed/truncated output, failed requests, exhausted limits, and cancellation do not apply a partial draft.
- Stop synchronously revokes runtime/edit identities before asynchronous cleanup. Close ports, abort network work, remove the iframe, and reject late results. Completed transactions stay completed; cancellation does not imply rollback or stopped provider billing.
- Reload/import leave execution stopped. Explicit Restore launches the selected persisted version. Keep the `?safe=1` recovery path.
- Diagnostics and `ready()` are reports, not proof of correct behavior. A failed saved version stays in history; no automatic paid repair or silent rollback.

## Model connection and secrets

Treat all repository content and history as potentially public, even while GitHub visibility is private.

- Never write real secrets to source, documentation, specs, fixtures, commit/PR text, diagnostics, screenshots, test reports, exports, or Git history. Never print credential files, environment dumps, authentication headers, or token-bearing remote URLs.
- Use clearly synthetic fixture values. Keep real connection data and browser profiles outside tracked content; do not copy browser storage into test artifacts.
- Keep `ModelConnection` exclusively in host-origin `localStorage` under `ace.model-connection.v1`, with a validated in-memory copy. Do not duplicate it in IndexedDB, the VFS, exports, AI context, or sandbox messages.
- Persist keys through host Settings as required by the spec. No `.env` setup or embedded provider credentials. Mask inputs and redact keys/sensitive headers from diagnostics, including provider errors that might echo them.
- Capture a connection copy at operation start. Clear saved connection cancels and invalidates active AI work, removes the connection, and preserves project/history/usage.
- Call configured providers directly from the browser. Preserve base-URL path prefixes, configurable token fields/instruction roles, and tool-call continuation fields. Report CORS/network errors accurately; no fake model fallback.
- Reserve/persist allowance before each model fetch. Failed, cancelled, timed-out, and connection-test calls count. Restore/import/reload never reset usage; only an explicit host reset creates a new allowance epoch.
- Before every commit/push, review an explicit file list and staged contents with a secret scanner, such as Gitleaks. Scan complete history before a visibility change. Report unavailable scanning honestly. Ignore rules are a second layer, not proof that contents are safe.
- If a real credential is detected, stop publication, remove it from the proposed content, and report the exposure without repeating its value. Any already-exposed credential requires replacement and history remediation.

## Working conventions and verification

Use the directory boundaries from specification Section 16: `src/host`, `storage`, `runtime`, `ai`, `seed`, `shared`, and `tests`. Create them when they gain real implementation; avoid placeholder code and empty scaffolding.

Prefer simple supported APIs and small modules with clear ownership. Preserve unrelated changes. Use explicit staging paths; do not blindly stage the entire workspace. Do not add an open-source license without the owner's choice; retain third-party license notices when vendoring dependencies.

When scaffolding, document the actual Node version, lock dependencies, expose the specified npm commands, and choose/document a fixed strict development port. Keep the same browser origin for persistence tests.

Test persistence, protocol validation, accounting, cancellation, and restore meaningfully. Use deterministic Chat Completions fixtures for automated integration tests; fixtures must never replace the real production transport. Test the built `dist/` with a generic static server and browser interception, without a backend/proxy.

Trace acceptance coverage to A01–A30. Report automated tests, static-hosting tests, live model smoke tests, and actual Chromium infinite-loop recovery independently. Record actual browser/version, endpoint/model, commands, failures, and unperformed checks; never publish secrets as evidence.
