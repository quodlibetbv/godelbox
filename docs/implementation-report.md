# Implementation and acceptance evidence

Recorded 7 October 2026. The engine follows `_specs/ace-mvp-specification-v1.1.md`; that supplied file is unchanged. This report distinguishes deterministic protocol/state tests, live provider behavior, browser isolation, and publication.

## Delivered behavior

The static Vue/TypeScript host owns Settings, persistent prompt, Start/Stop, history, file/error inspection, and request accounting. A fixed bootstrap receives structured app files inside a fresh opaque-origin iframe with only `allow-scripts`. Validated, session-bound MessagePort requests expose the ACE SDK. Web Locks admit one executing/writable host tab.

IndexedDB transactions coordinate working files, monotonic revisions, immutable full snapshots, branching restore, import, and persistent usage reservation. AI operates on an isolated draft with sequential schema-validated file tools, captured connection settings, bounded context/calls/tools, provider continuation messages, and explicit commit/activation guards. Stop/Restore/import/connection clearing invalidate pending work. Failed final storage commits keep a draft for explicit retry/export; other failed edits discard it. No backend, proxy, model environment setup, production fixtures, or automatic paid repair exists.

The deterministic seed now packages p5.js from npm `p5@2.3.3`: exact minified bytes, SHA-256/version/source provenance, and its LGPL-2.1 notice. The matching unminified source and license are published under `vendor/p5-2.3.3/`. Upstream's unchanged bundle reports `p5.VERSION` as 2.3.1; provenance records both identifiers. The earlier Vue counter is retained as a synthetic test fixture. Other classic scripts and imported assets also work. The original Gödel welcome page remains at `about.html`.

## Executed local checks

Node 22.22.2 and npm 10.9.7; Chromium 153.0.8010.12 through Playwright 1.63.0 on Linux, headless with the OS sandbox disabled for the root test runner. Site isolation uses Chromium defaults; it was not disabled or altered to obtain a passing recovery test.

- `npm run build`: passed TypeScript/Vue checking and produced static `dist/` assets.
- `npm run test`: **44 passed** across five files; persistence/reset, import graph/path/size validation, connection storage/redaction, RPC schemas, editor boundaries, provider error metadata, and direct model gateway tests.
- `npm run test:e2e`: **37 passed**; served the production build with Python's generic static HTTP server on `http://127.0.0.1:5173/`. Provider/library responses were intercepted by Playwright, without a product backend or dev proxy. The original 25 engine cases use the synthetic counter fixture through the real project importer; seven cases exercise the default universe; three cover minimal framing, diagnostic privacy/persistence, and fresh-start cancellation/settings preservation; two cover an app-owned AI conversation and accurate conversation-only edit reporting.
- Layout smoke: widths 1440, 390, and 320 passed without host horizontal overflow or browser errors. Desktop and mobile app/Settings screenshots were visually inspected in isolated browsers with no credentials. Keyboard focus remains visible. The universe form and Become button fit within the mobile canvas at all three widths. Measured starter text contrast: placeholder 8.58:1, Become button 13.67:1, footer 9.21:1 against its dark base.

The tests use synthetic keys and headers. Browser traces and screenshots are disabled in the acceptance runner. No real provider connection is a repository fixture.

## Acceptance coverage

| ID | Executed evidence |
| --- | --- |
| A01 | Empty-storage Start renders the locally vendored p5.js universe offline; no model fetch. |
| A02 | Live supplied OpenRouter model passed an actual two-request `ace_echo` tool round-trip; details below. |
| A03 | Static-browser edit preserves a custom base path, selected completion field, developer instruction role, and extra header settings. |
| A04 | Acknowledged counter/note persist across stopped reload and explicit Start; connection/allowance persist separately. |
| A05 | Deterministic file tools add a reset button, preserve note data, and create a saved child snapshot. Live generated behavior is reported separately. |
| A06 | Restore replaces source and data while keeping the newer version available and making no model request. |
| A07 | Restore then edit creates a child on the selected branch; other branches remain. |
| A08 | Dirty state is saved in a pre-restore snapshot. |
| A09 | Removing app body content leaves host controls/prompt usable; editing works while stopped. |
| A10 | Changed/default instructions are loaded by subsequent normal edits and restored with old files. |
| A11 | Repair mode excludes app instructions, memory, and conversation behavioral context. |
| A12 | Delayed model results after Stop are discarded without file/tool execution or activation. |
| A13 | A deliberately queued old-port RPC delivered after Stop and a fresh runtime cannot mutate files/history. |
| A14 | Truncated/malformed provider responses and API errors leave saved files intact; malformed/unknown tools return paired structured errors, allowing bounded correction. |
| A15 | Startup exception/rejection diagnostics are visible; failed versions remain saved and can be stopped/restored without automatic AI. |
| A16 | Persistent exhausted allowance blocks fetch after restore/reload; explicit reset retains prior records. |
| A17 | `</script>` and HTML-like note data round-trip without becoming markup. |
| A18 | Public bundle import saves bytes/provenance; offline restore loads it inside the iframe without host execution. |
| A19 | Full export/import preserves working files and branch graph; receiving connection/usage remain; export excludes host secrets/usage. |
| A20 | Injected quota/aborted transaction failures leave working files/head/history atomic, reject acknowledgement, and never delete history. Failed AI commit is explicitly retryable without another model call. |
| A21 | Second host tab cannot run/mutate/use the model. |
| A22 | Deliberate infinite loop passed responsive Stop and safe stopped reopen in the configuration above. |
| A23 | A plain non-Vue classic-script app loads from its own manifest. |
| A24 | SDK file read/write, local Blob asset URL, and text AI use the host gateway without sandbox credentials. |
| A25 | Stop, Restore, and import each cancel a pending draft; late results cannot overwrite or reactivate selected state. |
| A26 | Invalid paths, unknown RPCs/tools, unexpected fields, and bad schema values are rejected at host boundaries. |
| A27 | Saved model/key/endpoint/options reload from the single localStorage record, without duplication in project/IndexedDB. |
| A28 | Clearing during AI cancels the operation; reload restores defaults while preserving project/history/usage. |
| A29 | Seed, persistence, prompt editing, restore, and direct provider target run from static `dist/`, with no backend or environment setup. |
| A30 | Blocked read/save/removal and malformed localStorage show visible errors and preserve project/history/usage and unsaved settings input. |

A22 used `ace.runtime.ready(); setTimeout(() => { while(true) {} }, 250)` in a saved classic script. After the loop began, the host Stop click completed within the test's three-second bound and removed the iframe; `?safe=1` reopened with no iframe or AI request. This is evidence for that Chromium configuration, not a CPU/memory guarantee for arbitrary browsers, mobile devices, or resource-exhaustion programs.

## Universe starter and prompt handoff

At the owner's request, the initial app is a p5.js spiral galaxy with stars, a warm core, pointer parallax, and occasional meteors. It asks “What do you want me to become?” and persists the typed prompt through acknowledged VFS writes. Pause motion and reduced-motion preferences stop drawing. All library bytes are local; the app requires no CDN connection.

The SDK extension `ace.runtime.requestEdit(prompt)` passes a user-submitted prompt to the existing host editor. Host validation checks the current session, writer/workspace state, strict prompt schema, and recent user activation. The same saved connection, file tools, limits, dirty checkpoint, cancellation, and successful child-version commit apply. An accepted edit ends the old iframe. A missing connection leaves the scene running, shows a Settings instruction, and copies the prompt into the permanent host for retry. Click and Ctrl/Cmd + Enter handlers use SDK messages directly because the sandbox blocks native form submission.

Seven browser cases verify actual pixel changes and paused stability, offline startup and prompt persistence across stopped reload, reduced-motion startup, delayed acknowledgements never marking newer input Saved, an in-app edit with two synthetic intercepted tool requests and restore, keyboard submission without a connection and rejection after user activation expires, preserved dirty counter files when loading the new starter, and Stop discarding a delayed in-app edit. Strict RPC tests reject missing/empty/oversized prompts and extra fields. No new live model request was made for this change; historical real-provider evidence below concerns the earlier counter.

Existing browser projects remain unchanged on upgrade. **Settings → Load universe starter** creates a manual child version after preserving dirty files in History. It keeps the connection, allowance, and prior branches; restoring the earlier counter and its note passed.

## Minimal frame, fresh start, and diagnostics

The owner's follow-up replaces the larger host chrome with a 52px black header, Settings/GitHub/prompt icons, and compact Start/Stop. The default canvas has no surrounding margin, border, or status strip. The prompt starts hidden, keeps unsent text when toggled, sits beside the app on desktop, and overlays it on narrow screens. History, file/error inspection, Save version, and detailed status remain inside that panel. Settings opens below the header, keeping Stop available. Visual checks inspected the full canvas at 1440/390/320px and prompt/Settings views at 1440/390px, with no browser errors or horizontal overflow.

**Clear app and history** requires explicit destructive confirmation, revokes the current runtime/edit, and uses the existing atomic project replacement transaction to create a new project and seed root. It deletes old app/history records while keeping localStorage connection settings and IndexedDB limits, allowance, and usage. Execution stays stopped. Tests cover confirmation cancellation, a pending old model result after reset, preserved settings/accounting across reload, and monotonic revisions. Recreating a missing project also now keeps existing limits and allowance instead of resetting them implicitly.

**Export diagnostics** is available from Settings, Errors, and host error notices. Its explicit allowlists include browser/build, host/workspace metadata, compatibility options, up to 200 request summaries, and 200 session events. New request summaries persist with host usage records; no database schema change is required. They capture timings, request sizes/counts, available HTTP status/response IDs/CORS-exposed request IDs, provider error code/name/message, and finish reasons. They omit credential/header values, app source/data, prompt/conversation bodies, and request/response bodies. Known captured-connection secrets are redacted before persistence; exports redact again. Raw upstream error JSON is parsed only to extract known nested error fields, never copied wholesale. Error text may contain provider/app content, so the UI asks users to review it before sharing.

Gateway tests exercise HTTP 503 capacity errors and HTTP 200/error completions, with and without a top-level error object. They retain metadata, count the attempt as failed, and make no retry. A browser test submits a synthetic draft write followed by a capacity error; the draft remains unapplied. Its actual downloaded report excludes synthetic keys/headers, private prompt/note/response bodies, and discarded draft contents; provider metadata survives reload. These changes improve diagnosis, not provider capacity. No real endpoint/model was contacted for this change.

## App-owned AI and transformation behavior

The owner reported that Become requests merely saved their prompt, ordinary motivational replies appeared in the platform editor, and generated code forwarded an AI response back to `runtime.requestEdit`. Source review confirmed that the in-app `ai.request` gateway incorrectly reused the complete file-editor instructions, and that the host rendered a final answer both in conversation history and its save-status message. The supplied transcript, not an inspected browser project export, establishes the generated app's described forwarding behavior.

The host now uses separate generic in-app AI instructions with no file-editor role or tools, while still reading current app behavioral instructions for each request. Editing instructions explicitly require requested transformations to implement app UI/behavior, replace obsolete starter handlers/instructions, and keep ordinary AI input/results/errors within the app. The seed guidance follows the same distinction. No predefined assistant mode or production generated-app fixture was added. Existing browser projects and their historical files are preserved.

Normal final editor turns still append the successful conversation pair and save/restart per the specification, including turns with no other file changes. The save status explicitly reports **No app changes made** for those turns and retains their prompt for retry. Actual changed-file status omits the automatically appended conversation file, and the final answer is displayed once in editing history. A submission that changes app files closes the prompt panel to return the full canvas; a transient host outcome opens it for conversation-only results, including requests originating inside the app, so the no-change notice is visible. No snapshot/storage contract changes are required. The host cannot determine from prose whether a model fulfilled a request; prompt improvements are not a semantic correctness guarantee. The editor instructions also document the existing allow-scripts-only sandbox's blocked native form submission and require direct click/keyboard action handlers; the assistant fixture's original native submit handler failed the initial regression and was corrected without broadening sandbox permissions.

A browser regression transforms the real universe through synthetic `write_file` calls into a browser-ready motivational assistant, then hides the platform prompt throughout ordinary use. It verifies distinct editor/app instruction payloads, the configured instruction role, a displayed AI reply, persistent app chat across stopped reload, unchanged editor history/snapshots during the reply, accounted app requests, stable iframe identity, and a recoverable synthetic capacity error with no editor handoff or extra model call. A second case verifies a model's prose-only claim leaves all non-conversation files unchanged, creates the required conversation-only version, preserves the input, and renders its answer once. This proves host transport/lifecycle behavior with deliberately supplied generated files; it does not prove a real model will generate the assistant correctly. No real endpoint/model was contacted for this change.

## Live provider smoke

The minimal-frame/diagnostics change was verified with synthetic intercepted responses, including HTTP 200/error and HTTP 503/capacity failures. No new live provider request or model substitution was made for this change.

The credential JSON supplied by the owner was read only from `/tmp`, outside the project. The API key was entered through Settings in a temporary isolated browser. No profile, trace, secret screenshot, connection export, or credential value was retained in repository artifacts.

Endpoint: `https://openrouter.ai/api/v1`. Supplied model: `nvidia/nemotron-3-ultra-550b-a55b:free`. OpenRouter's [model page](https://openrouter.ai/nvidia/nemotron-3-ultra-550b-a55b:free) and public catalogue identify it as free and tool-capable.

Two separate connection tests each completed the actual echo tool round-trip, with both requests counted before fetch. Live edit attempts also exercised real file-tool transport. One finished and saved but failed the requested button assertion; another returned an upstream Nvidia service-overload error; another had an incomplete/undecodable response while receiving its second edit call. These are failures, not passing edit evidence. Saved state stayed recoverable. An interrupted response revealed and prompted correction of timeout classification during JSON decoding; a regression test covers that case.

The model is entered by the user, never hardcoded into production. A separate exploratory test used `cohere/north-mini-code:free`: nine requests, provider-reported zero cost, and passing edit/restore/persistence. That does not establish the supplied model's editing behavior. Final connection verification uses only the model from the owner-supplied, unchanged credentials file. A subsequent configured-model heading edit read and wrote its draft but failed on Nvidia overload during the final response, correctly leaving the persisted project unchanged. The final configured-model local smoke passed with a 2,048 completion-token cap and a 600,000 ms saved timeout. It made two accounted editor requests directly from the static build, changed the heading through `write_file`, created an AI child version, preserved the note and working counter, restored the earlier source/data, and reloaded stopped with the original saved connection. Provider-reported total cost was zero. The exact supplied key was absent from project/IndexedDB records. The same exact configured-model smoke then passed from `https://quodlibetbv.github.io/godelbox/`, making two direct, accounted requests with provider-reported zero cost. The published page created the changed child version, preserved the note/counter, restored the earlier heading/data, and reopened stopped with its saved key/model. This small edit verifies real file changes and recovery; it does not turn the earlier reset-button failure into a pass.

## Publication and limits

Public repository: `https://github.com/quodlibetbv/godelbox`. Pages: `https://quodlibetbv.github.io/godelbox/`. Local origin targets `quodlibetbv`. Engine commit `ddeda5a33919416744fc95785f1b0b5a9825eda5` passed the complete build, unit, browser, and deploy jobs in [Pages run 37582490187](https://github.com/quodlibetbv/godelbox/actions/runs/37582490187). The welcome-page deployment under that account passed before engine work; the old `delorionbv` copy is left for the owner to delete. Browser storage is origin-specific and does not move with repository publication.

Universe commit `18cdb7ed12cfaeda2a845a3543ac98a4b3e45eae` passed build, unit tests, all 32 browser cases, and deployment in [Pages run 37585652199](https://github.com/quodlibetbv/godelbox/actions/runs/37585652199). A fresh browser on the published site verified the question, visible p5.js canvas, changing animation pixels, exact corresponding-source hash, an in-app prompt producing a saved child through two synthetic intercepted editor requests, and restoration of the universe. No browser errors or real model calls occurred in that smoke.

Minimal-frame/reset/diagnostics commit `1c76fb6662d6e3d4141d1874c39e52ad0f50cba8` passed build, 44 unit tests, 35 browser tests, and deployment in [Pages run 37589000381](https://github.com/quodlibetbv/godelbox/actions/runs/37589000381). A fresh Chromium 153.0.8010.12 browser verified the published `index-BR7NdXMD.js` asset, 52px frame at 1440/390/320px, exact GitHub link, and prompt visibility/text preservation. Two synthetic intercepted editor responses exercised a draft write followed by an HTTP 200 capacity error: saved files stayed unchanged, the actual downloaded diagnostics retained the provider/request ID and omitted synthetic keys, header values, prompt/response bodies, and discarded draft content. Request details survived reload. Confirmed reset created one fresh root, kept settings/usage across reload, left execution stopped, and reopened the universe through Start. No browser errors or real provider calls occurred.

App AI separation and final outcome visibility are published through commit `6ce4cd46c314de3f9e3746064e41b55de090e630`, which passed build, 44 unit tests, 37 browser tests, and deployment in [Pages run 37597141038](https://github.com/quodlibetbv/godelbox/actions/runs/37597141038). A fresh Chromium 153.0.8010.12 browser verified the live `index-Zucvpdrh.js` asset: a prose-only editor turn reported no app change, retained its prompt, and displayed its answer once; a subsequent synthetic file-tool transformation produced the assistant and closed the prompt panel. Its in-canvas response used separate app instructions, persisted chat, left editor history/snapshots unchanged, and kept the same iframe. A synthetic capacity error caused no editor handoff; stopped reload/Start restored the chat with the prompt panel hidden. Three editor and two app requests were intercepted; no real provider calls or browser errors occurred. This is transport/lifecycle evidence with supplied test files, not live-model generation evidence or a migration of the owner's browser project.

Only static build output is uploaded by the pinned-action workflow. No actual credentials are tracked. Gitleaks 8.30.1 found no leaks in the staged engine (~409 KiB) or complete five-commit history (~505 KiB) before publication. An additional exact-match check found the supplied key absent from staged files and `dist/`. The universe change also passed staged scans of approximately 6.01 MB and a complete seven-commit history scan of approximately 6.52 MB, including exact p5.js source and synthetic fixtures, with no leaks. Future commits/pushes must repeat the required scans.

Before the minimal-frame/reset/diagnostics publication, Gitleaks found no leaks in the explicit 18-file staged change (~40.85 KB) or full nine-commit history (~6.56 MB).

App AI changes passed Gitleaks staged scans (~20.46 KB and ~3.07 KB) and complete history scans before each commit/push, including the twelve-commit history (~6.58 MB), with no leaks. No owner credential file or browser project data was used for these tests.

Unsupported vendor-specific APIs/authentication, CORS-blocked endpoints, arbitrary generated-app quality, headful/mobile browser resource isolation, and cross-origin browser-data migration are not verified. There is no automatic rollback, merge, cloud sync, storage garbage collection, or general npm compilation for generated apps.
