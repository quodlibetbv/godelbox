# Implementation and acceptance evidence

Recorded 7 October 2026. The engine follows `_specs/ace-mvp-specification-v1.1.md`; that supplied file is unchanged. This report distinguishes deterministic protocol/state tests, live provider behavior, browser isolation, and publication.

## Delivered behavior

The static Vue/TypeScript host owns Settings, persistent prompt, Start/Stop, history, file/error inspection, and request accounting. A fixed bootstrap receives structured app files inside a fresh opaque-origin iframe with only `allow-scripts`. Validated, session-bound MessagePort requests expose the ACE SDK. Web Locks admit one executing/writable host tab.

IndexedDB transactions coordinate working files, monotonic revisions, immutable full snapshots, branching restore, import, and persistent usage reservation. AI operates on an isolated draft with sequential schema-validated file tools, captured connection settings, bounded context/calls/tools, provider continuation messages, and explicit commit/activation guards. Stop/Restore/import/connection clearing invalidate pending work. Failed final storage commits keep a draft for explicit retry/export; other failed edits discard it. No backend, proxy, model environment setup, production fixtures, or automatic paid repair exists.

The deterministic seed packages Vue 3.5.43's exact full global production bundle, SHA-256/source/version provenance, and MIT license. Non-Vue classic scripts and imported assets also work. The original Gödel welcome page remains at `about.html`.

## Executed local checks

Node 22.22.2 and npm 10.9.7; Chromium 153.0.8010.12 through Playwright 1.63.0 on Linux, headless with the OS sandbox disabled for the root test runner. Site isolation uses Chromium defaults; it was not disabled or altered to obtain a passing recovery test.

- `npm run build`: passed TypeScript/Vue checking and produced static `dist/` assets.
- `npm run test`: **39 passed** across five files; persistence, import graph/path/size validation, connection storage/redaction, RPC schemas, editor boundaries, and direct model gateway tests.
- `npm run test:e2e`: **25 passed**; served the production build with Python's generic static HTTP server on `http://127.0.0.1:5173/`. Provider/library responses were intercepted by Playwright, without a product backend or dev proxy.
- Layout smoke: widths 1440, 390, and 320 passed without host horizontal overflow or browser errors. Desktop and mobile app/Settings screenshots were visually inspected in isolated browsers with no credentials. Keyboard focus remains visible.

The tests use synthetic keys and headers. Browser traces and screenshots are disabled in the acceptance runner. No real provider connection is a repository fixture.

## Acceptance coverage

| ID | Executed evidence |
| --- | --- |
| A01 | Empty-storage Start renders the locally vendored seed; no model fetch. |
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

## Live provider smoke

The credential JSON supplied by the owner was read only from `/tmp`, outside the project. The API key was entered through Settings in a temporary isolated browser. No profile, trace, secret screenshot, connection export, or credential value was retained in repository artifacts.

Endpoint: `https://openrouter.ai/api/v1`. Supplied model: `nvidia/nemotron-3-ultra-550b-a55b:free`. OpenRouter's [model page](https://openrouter.ai/nvidia/nemotron-3-ultra-550b-a55b:free) and public catalogue identify it as free and tool-capable.

Two separate connection tests each completed the actual echo tool round-trip, with both requests counted before fetch. Live edit attempts also exercised real file-tool transport. One finished and saved but failed the requested button assertion; another returned an upstream Nvidia service-overload error; another had an incomplete/undecodable response while receiving its second edit call. These are failures, not passing edit evidence. Saved state stayed recoverable. An interrupted response revealed and prompted correction of timeout classification during JSON decoding; a regression test covers that case.

The model is entered by the user, never hardcoded into production. A separate exploratory test used `cohere/north-mini-code:free`: nine requests, provider-reported zero cost, and passing edit/restore/persistence. That does not establish the supplied model's editing behavior. Final connection verification uses only the model from the owner-supplied, unchanged credentials file. A subsequent configured-model heading edit read and wrote its draft but failed on Nvidia overload during the final response, correctly leaving the persisted project unchanged. The final configured-model local smoke passed with a 2,048 completion-token cap and a 600,000 ms saved timeout. It made two accounted editor requests directly from the static build, changed the heading through `write_file`, created an AI child version, preserved the note and working counter, restored the earlier source/data, and reloaded stopped with the original saved connection. Provider-reported total cost was zero. The exact supplied key was absent from project/IndexedDB records. The same exact configured-model smoke then passed from `https://quodlibetbv.github.io/godelbox/`, making two direct, accounted requests with provider-reported zero cost. The published page created the changed child version, preserved the note/counter, restored the earlier heading/data, and reopened stopped with its saved key/model. This small edit verifies real file changes and recovery; it does not turn the earlier reset-button failure into a pass.

## Publication and limits

Public repository: `https://github.com/quodlibetbv/godelbox`. Pages: `https://quodlibetbv.github.io/godelbox/`. Local origin targets `quodlibetbv`. Engine commit `ddeda5a33919416744fc95785f1b0b5a9825eda5` passed the complete build, unit, browser, and deploy jobs in [Pages run 37582490187](https://github.com/quodlibetbv/godelbox/actions/runs/37582490187). The welcome-page deployment under that account passed before engine work; the old `delorionbv` copy is left for the owner to delete. Browser storage is origin-specific and does not move with repository publication.

Only static build output is uploaded by the pinned-action workflow. No actual credentials are tracked. Gitleaks 8.30.1 found no leaks in the staged engine (~409 KiB) or complete five-commit history (~505 KiB) before publication. An additional exact-match check found the supplied key absent from staged files and `dist/`. Future commits/pushes must repeat the required scans.

Unsupported vendor-specific APIs/authentication, CORS-blocked endpoints, arbitrary generated-app quality, headful/mobile browser resource isolation, and cross-origin browser-data migration are not verified. There is no automatic rollback, merge, cloud sync, storage garbage collection, or general npm compilation for generated apps.
