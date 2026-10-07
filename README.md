# Godelbox

Godelbox is a personal browser app that you can reshape through a permanent prompt. AI edits real virtual files; successful changes become saved versions. Restore brings back an app's code, data, libraries, instructions, and conversation together.

Open **[Godelbox](https://quodlibetbv.github.io/godelbox/)**. It is named in honour of Kurt Friedrich Gödel; the original welcome document is available from **About Godelbox**.

## Start using it

1. Press **Start** to explore a slowly rotating p5.js universe. It works without a model or API key, including offline after the host loads. **Pause motion** freezes the scene; reduced-motion preferences start it paused.
2. Open **Settings**, choose OpenRouter or a compatible endpoint, enter its base URL, model ID, and key, then **Save settings**. Optional headers, token field, instruction role, timeout, and limits are editable.
3. **Test connection** verifies chat connectivity and a real tool round-trip. **Load models** is optional; you can enter a model ID manually.
4. The universe asks **“What do you want me to become?”** Enter an idea, such as “Become a star atlas”, and press **Become** or Ctrl/Cmd + Enter. Your typed prompt persists locally. The permanent host prompt works too, even if the app has no interface.
5. The app pauses while file tools edit a draft using your saved model connection and limits. A successful turn saves a child version and starts a fresh canvas. Without a connection, the universe shows an instruction to open Settings and places your prompt in the host for retry.
6. Open **History**, select an earlier version, and **Restore selected version**. Its code and data return; newer branches remain available.

Already have the earlier counter app or another saved project? Open **Settings → Load universe starter**. This preserves your current files in History, including acknowledged unsaved changes, and keeps your connection and usage. Existing projects are never silently replaced on reload.

The app fills the window below a slim black header. The panel icon shows or hides the host prompt; hiding it keeps unsent text. A host edit that changes app files closes the prompt panel and returns the canvas to full width. History, Files, Errors, and Save version are inside that panel. Start/Stop and the Settings and GitHub icons remain in the header. On narrow screens the prompt opens over the canvas.

## Transform the app, then use it

The universe's **Become** form and the host's **Shape your app** panel request changes to the application's files. A request such as “Become a motivational assistant” should build that experience inside the canvas, with its own input, responses, and saved data. A saved prompt alone is not a transformation. If a model only replies without changing any files other than editor conversation history, Godelbox reports **No app changes made** and keeps your prompt for retry. The conversation-only version remains in History; prose is not proof of working behavior.

An AI-powered app uses `ace.ai.request` for everyday questions. The host supplies separate in-app response instructions, the latest versioned `/agent/instructions.md`, your configured model, and the existing allowance. Responses return to the running app; its code displays them and can persist its own conversation under `/data`. It must not forward ordinary questions, answers, or failures to `ace.runtime.requestEdit`. That API is for an explicit request to change the app. Editor history in `/agent/conversation.json` is separate from the app's conversation.

Previously generated app code is preserved on upgrade. If it forwards chat to the editor or retained the universe's Become form, open the prompt panel, enable **Ignore app instructions / Repair mode**, and request a repair. For the motivational-assistant example: “Build a usable motivational assistant inside the app canvas, with its own chat UI and persisted conversation. Use ace.ai.request for replies; remove the old Become handler and every automatic requestEdit handoff, including error fallbacks. Update the app instructions to its motivational role.” This requires a new edit using your configured model; the platform cannot guarantee generated behavior from the model's final summary.

## Start fresh and report a problem

Use **Settings → Clear app and history** to replace the current app, all its data, and every saved version with a fresh universe. Confirm the deletion, then press **Start**. Your saved model connection, limits, request allowance, and usage records remain. Export the project before clearing if you want a backup. **Load universe starter** is the separate option that keeps your history.

After a failure, select **Export diagnostics** in the error notice, Settings, or Errors. It downloads a `godelbox-diagnostics-….json` file with browser/build information, host state, recent request accounting, timings, available HTTP status/request IDs, provider error codes/details, and runtime errors. Attach that file when reporting a problem. New request diagnostics survive reload in the existing usage records; general host/runtime events cover the current session. The export is limited to the latest 200 requests and 200 events. Earlier requests cannot gain details that were never collected.

Diagnostic exports omit API keys, header values, request/response bodies, app files/data, prompt bodies, and conversations. Known connection secrets are redacted when messages are collected and again when exported. Error text can contain content supplied by the app or provider, so review it before sharing.

Capacity/rate-limit responses now retain the provider's available explanation, including errors inside a response with HTTP 200. An errored completion is counted as failed and cannot apply a draft. There is no automatic retry or change of model; provider availability cannot be fixed by resetting your app. See [OpenRouter's response/error schema](https://github.com/OpenRouterTeam/docs/blob/main/api_reference/overview.mdx).

The model must support Chat Completions tool calling and direct browser requests with CORS. Plain chat support alone is insufficient. Requests go straight to your saved endpoint, without a backend or proxy. Provider failures are visible; there is no simulated fallback or automatic retry. Generated app quality depends on the selected model.

## Local development and static deployment

Use Node **22.22.2** (minimum 22.12), npm, and Python 3 for the browser tests' generic static server. Dependencies are locked. From a fresh checkout:

```bash
npm ci
npx playwright install --with-deps chromium
npm run dev
```

The fixed development origin is `http://127.0.0.1:5173/`, with strict port selection. Use the same origin when testing persistence. Build and verify with:

```bash
npm run build
npm run test
npm run test:e2e
npm run preview
```

`npm install` also works. Close the dev/preview server before browser tests, which reserve port 5173. Tests serve `dist/` using Python and intercept provider responses inside the test browser. They need no paid key or application backend.

`npm run build` produces static files in `dist/`. Any HTTPS or localhost static server can serve them; there are no production routes, serverless functions, environment credentials, or Vite proxy. Relative asset paths support the GitHub Pages project URL. Model settings can change without rebuilding.

[The Pages workflow](.github/workflows/pages.yml) installs locked dependencies, builds, runs unit and Chromium browser tests, and publishes only `dist/` after relevant `main` changes. Official actions use immutable commit pins. GitHub supplies the deployment job token; no model credential belongs in repository secrets or the artifact.

## Storage and recovery

The initial target is desktop Chromium. Reload and import leave execution **stopped**, including `?safe=1`. **Stop** revokes the current iframe and AI operation immediately. **Start** runs the current persisted files. **History** supports explicit restore; **Files** inspects current or historical files without executing them. **Errors** shows runtime diagnostics. The host prompt remains usable after an app breaks or removes its own interface. **Ignore app instructions / Repair mode** bypasses app behavioral instructions and memory.

IndexedDB database `godelbox-v1` stores working files, immutable snapshots, limits, and usage. One tab holds the write Web Lock; other tabs are read-only. App writes acknowledge transaction completion. Restore preserves dirty work in a pre-restore checkpoint and advances the workspace revision. Failed or cancelled edits do not apply their draft; a failed final storage commit offers explicit retry/export while the draft remains in memory.

The complete validated model connection is saved only in host-origin `localStorage`, under `ace.model-connection.v1`. The prototype contract stores the key as plain text in this browser. It stays outside IndexedDB, app files, snapshots, exports, model context, and iframe messages. **Clear saved connection** cancels AI work and removes the record without deleting project/history/usage. Blocked or malformed storage produces a visible error, preserving unsaved form input and project data.

Each attempted model request reserves persistent allowance before fetching. Failures, cancellations, timeouts, and connection tests count. Restore, import, and reload never replenish it. **Reset request allowance** creates a new epoch explicitly and retains older records. Unknown provider token/cost values remain unknown.

**Export project** backs up current working files and all history, including app data and prompts. Host connection settings, headers, credentials, and usage are excluded. **Import and replace project** validates the complete file/history structure and atomically replaces the project after confirmation; your receiving browser's connection and usage remain. Browser storage is origin-specific and can be evicted, so keep exports of work you want to retain. Moving between GitHub accounts does not migrate existing browser storage; export/import transfers the project.

An iframe sandbox is not a universal CPU or memory guarantee. Stop successfully removed a deliberate infinite loop in the tested Chromium configuration; other browser/platform isolation is unverified. The sandbox permits app network access and only grants `allow-scripts`, without access to host origin storage.

## Project and evidence

The supplied [specification](_specs/ace-mvp-specification-v1.1.md) governs the engine. Godelbox is the project name; `window.ace`, `ace/1`, storage keys, and export contracts retain the specification's ACE identifiers. The host uses TypeScript, Vue 3, and Vite. At the owner's request, the starter now uses locally packaged p5.js 2.3.3 instead of the specification's counter. Generated apps can use HTML fragments, CSS, and any compatible classic browser scripts.

The universe submits through the SDK extension `ace.runtime.requestEdit(prompt)`, which requires recent user activation and hands control to the permanent host editor. An accepted edit stops that iframe; it must not expect to keep running after the call. Credentials remain in the host.

- [Implementation and acceptance evidence](docs/implementation-report.md)
- [Project understanding](docs/project-understanding.md)
- [Implementation plan](docs/implementation-plan.md)
- [Agent guidance](AGENTS.md)
- [Product context](PRODUCT.md)

## Repository secrets

Treat every commit and its history as public. Never commit real credentials, connection records, browser profiles, captured user/provider data, or exported projects. Use unmistakably synthetic fixture values. [.gitignore](.gitignore) excludes local configuration and artifacts, but actual staged contents must also pass a secret scan before every commit/push. Scan full history before any visibility change. Public availability does not establish an open-source license for Godelbox. Bundled p5.js retains its LGPL-2.1 notice and exact [corresponding source](https://quodlibetbv.github.io/godelbox/vendor/p5-2.3.3/p5.js); Vue retains its MIT notice.
