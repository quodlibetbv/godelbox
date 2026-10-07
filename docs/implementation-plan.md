# Implementation plan

Authority: [_specs/ace-mvp-specification-v1.1.md](../_specs/ace-mvp-specification-v1.1.md), especially Sections 16–18. This plan follows its implementation order. The engine milestones below are implemented. Local deterministic tests and target-browser recovery have passed; live-provider and deployment evidence is recorded in [the implementation report](implementation-report.md). The original welcome page is retained as `public/about.html`.

## 1. Host, storage, seed, and runtime

Scaffold the TypeScript/Vue/Vite host and test commands. Pin dependencies and Node requirements; document a fixed strict development port. Implement VFS/path/size validation, IndexedDB records and transactions, operation coordination, and single-writable-tab admission. Package the deterministic seed, pinned Vue bytes, provenance, and license. Implement the fixed iframe bootstrap, session-bound bridge, SDK file persistence, runtime diagnostics, and independent Start/Stop controls.

Exit evidence: Start works with no key or network; counter/note writes acknowledge only committed current values; generated code never executes in the host; invalid/stale bridge requests fail. Cover A01, persistence portions of A04/A24, and A09/A13/A17/A20/A21/A23/A26 as relevant. Run A22's infinite-loop recovery test early against the actual target Chromium configuration and record the result.

## 2. Version history, restore, and portable backup

Implement immutable full snapshots, manual checkpoints, dirty markers, parent relationships, restore with preservation of dirty work, restart checkpoints, and stopped-on-reload/safe mode. Add the read-only file viewer and project export/import with structural validation and atomic replacement. Exclude host configuration/credentials/usage through an explicit export allowlist.

Exit evidence: code, data, instructions, and dependencies restore together; branches survive; malformed imports/quota failures leave saved state coherent. Cover A06–A08/A19 and relevant A04/A10/A15/A20/A25 behavior. Imports remain stopped; explicit restore restarts without requiring AI.

## 3. Connection settings and persistent allowance

Implement validated host `localStorage` connection loading/saving/clearing and error handling. Add the direct-browser compatible Chat Completions client, editable model ID, optional discovery, generic connection test with a tool round-trip, compatibility fields, timeout/cancellation, and persistent IndexedDB accounting. Capture settings per operation and redact credentials in diagnostics.

Exit evidence: base path prefixes and configured request options survive; failed/cancelled/test calls count; restore/reload/import cannot replenish allowance; settings errors preserve project data. Cover A03/A16/A27/A28/A30 and connection portions of A04/A24/A26. Automated tests use synthetic credentials and deterministic provider responses. Live A02 requires an actual suitable user-configured endpoint/model and is reported separately.

## 4. Bounded AI editor and prompt recovery

Implement the real generic file-tool schemas and sequential draft tools, bounded context, app instruction loading, repair mode, tool message/continuation handling, and host prompt lifecycle. Keep editing paused, commit workspace/snapshot/head atomically against the base revision, append successful conversation memory, and start a fresh runtime only while the edit remains current. Show changed files and actual saved/runtime outcomes.

Exit evidence: prompts change actual files and preserve unrelated data; instruction changes are versioned; repair works without a running app; malformed, truncated, cancelled, or stale edits never apply partial drafts. Cover A05/A07/A10–A12/A14/A15/A25/A26 and complete A24. No production fake responses or automatic paid repair.

## 5. Dependencies, failures, and complete static delivery

Add public credential-free asset/library import into the draft with limits and provenance. Finish quota/storage-failure handling, stale-operation race coverage, and offline saved-library restoration. Run the whole workflow from the built `dist/` using a generic static file server, then run a real direct-provider smoke test from that build. Complete README setup/deployment/storage/recovery guidance and acceptance coverage records.

Exit evidence: A18/A29 pass and remaining relevant A01–A30 coverage is complete. Deterministic tests intercept provider traffic in the browser; they do not add a product backend. Report A02 live provider results and A22 browser recovery separately with endpoint/model and browser/version, without recording secret values.

## Completion gate

A fresh checkout must support first launch → configure → Start → prompt change → saved child version → restore, with real code/data changes, persistent browser connection settings, functioning Stop/allowance controls, and the same behavior from a static build. Every required visible control has a real implementation.

Record tests actually executed and their outcomes, live checks, failures, and unperformed checks. Development-server success does not establish static deployment, deterministic transport tests do not establish live provider support, and a ready signal does not establish application correctness.
