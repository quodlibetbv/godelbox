# Project understanding

## Intended outcome

Godelbox is a personal experiment in applications that can be changed through a persistent host prompt. A user starts a deterministic local app, asks the model for a change, receives a saved version with real file changes, and can restore any earlier version. Generated applications may also use their SDK to persist files, create checkpoints, request text from the host AI gateway, and ask for a restart.

The key abstraction is a writable virtual filesystem with immutable snapshots. It is broader than a code-generating chat UI: generated files actually run, app data persists, and historical code/data/library/instruction combinations remain recoverable. There is no predefined catalogue of app types.

The original specification calls the engine ACE. Godelbox names this project; keeping the existing ACE protocol identifiers avoids an unnecessary format change during initialization.

## Ownership and data flow

The immutable host owns the prompt, controls, model connection, allowance, storage coordinator, and permission to execute. A replaceable app owns its versioned files and runs in an opaque-origin iframe. Its SDK requests are validated by the host through a channel bound to that particular runtime.

An AI edit stops the running app, preserves acknowledged dirty files, copies the current VFS into a draft, and runs sequential validated file tools. On successful completion, the host atomically saves the draft, a child snapshot, and the new head. It then starts a fresh iframe. Failed or cancelled edits leave the pre-edit files usable. A later runtime error does not erase the committed version.

Manual restore preserves any dirty current state, copies the selected snapshot's entire filesystem, and moves the working head to that historical snapshot. Future versions branch from it; later existing history remains accessible. Restore covers persisted files, not unsaved variables or external side effects.

## Boundaries already decided

| Area | Required boundary |
| --- | --- |
| Deployment | Static files over HTTPS or localhost; direct browser-to-provider requests. |
| Host | TypeScript, Vue 3, Vite; development/build tools only. |
| App runtime | HTML fragment, CSS, classic browser scripts; locally vendored p5.js universe starter. |
| Project storage | IndexedDB working VFS and full-copy snapshots. |
| Connection storage | Complete model connection in host `localStorage`; separate from project/usage storage. |
| AI | Non-streaming Chat Completions, generic tools, one model request at a time. |
| Recovery | Permanent host controls, stopped-on-reload, explicit restore, repair mode, safe reopen. |
| History | Parent-linked immutable snapshots and simple indented list; no merges. |
| Scope | Single user, one active project and writable tab; no cloud sync, backend, marketplace, autonomous agents, or app bundler. |

Repository secrecy and browser credential persistence are separate requirements: the prototype deliberately remembers the user's key in browser storage, but no actual connection data belongs in repository files or history. The host must also prevent its connection from leaking into app files, model context, exports, or diagnostics.

## Implementation risks to resolve with evidence

1. **Persistence correctness:** IndexedDB completion, quota failures, branch references, monotonic revisions, and dirty-state accounting must agree. A successful UI label cannot precede a completed transaction.
2. **Cancellation races:** Stop, Restore, import, and connection clearing can overtake model responses, asset downloads, bridge messages, and pending commits. Revocation must apply at every dispatch/commit/activation boundary.
3. **Runtime responsiveness:** An iframe sandbox separates capabilities but is not a universal CPU limit. The specified Chromium infinite-loop test must demonstrate responsive Stop in the tested configuration; safe reopen is a separate recovery path.
4. **Provider compatibility:** Direct requests require CORS and compatible tool calling. Validate actual chat/tool round-trips and continuation handling; discovery failure cannot block manual model selection. A proxy would violate the product contract.
5. **Reproducible execution:** Save actual dependency bytes, avoid host execution of app code, and transfer generated data structurally. Restoring offline must not fetch newer libraries.
6. **Storage lifetime and credentials:** Browser-origin changes, eviction, and blocked localStorage are real failure cases. Exports provide project backup, while connection settings and usage remain outside exported history.

These are testing obligations, not reasons to expand the MVP into a production platform.

## Implementation choices and publication

The implementation uses Node 22.22.2, Vue 3.5.43, TypeScript 5.9.3, Vite 8.3.3, idb 8.0.4, Ajv 8.20.0, Vitest 5.0.3, and Playwright 1.63.0. Development and static-browser tests use `http://127.0.0.1:5173/`. The seed packages exact p5.js 2.3.3 bytes, hash/provenance, and its LGPL-2.1 notice. The static distribution also includes the exact corresponding unminified source. No provider model is baked into the app.

The owner replaced the specification's counter seed with an animated universe and an in-app prompt asking “What do you want me to become?” The extension `ace.runtime.requestEdit(prompt)` validates the current runtime, recent user activation, workspace availability, and prompt, then runs the permanent host editor using the saved connection and limits. It ends the submitting runtime when editing is accepted. Missing connection settings leave the scene open and copy the prompt into the host for retry. This is an additional entry point to the same editor, not a second editing system.

Existing working files are retained across upgrades. **Load universe starter** checkpoints dirty files and creates a manual child version containing the new seed; it preserves old branches, the model connection, and request usage. The previous counter remains a synthetic test fixture for the original engine acceptance coverage.

The public repository and Pages site are under `quodlibetbv/godelbox`, following the owner's account correction. The earlier `delorionbv` copy is left for the owner to delete. Public visibility does not establish an open-source license. The welcome document remains at `about.html`; the root page is the adaptive engine when its deployment passes. See the implementation report for test and deployment evidence.
