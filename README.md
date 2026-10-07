# Godelbox

Godelbox is a personal browser app that you can reshape through a permanent prompt. AI edits real virtual files; successful changes become saved versions. Restore brings back an app's code, data, libraries, instructions, and conversation together.

Open **[Godelbox](https://quodlibetbv.github.io/godelbox/)**. It is named in honour of Kurt Friedrich Gödel; the original welcome document is available from **About Godelbox**.

## Start using it

1. Press **Start**. The local starter app works without a model or API key.
2. Open **Settings**, choose OpenRouter or a compatible endpoint, enter its base URL, model ID, and key, then **Save settings**. Optional headers, token field, instruction role, timeout, and limits are editable.
3. **Test connection** verifies chat connectivity and a real tool round-trip. **Load models** is optional; you can enter a model ID manually.
4. Change the counter and write a note. Wait for **Saved**, then save a version named **Before changes**.
5. Prompt “Add a reset button without losing my note.” The app pauses while file tools edit a draft. A successful turn saves a child version and starts a fresh canvas.
6. Open **History**, select **Before changes**, and **Restore selected version**. Your earlier code and data return; newer branches remain available.

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

The supplied [specification](_specs/ace-mvp-specification-v1.1.md) governs the engine. Godelbox is the project name; `window.ace`, `ace/1`, storage keys, and export contracts retain the specification's ACE identifiers. The host uses TypeScript, Vue 3, and Vite. Generated apps use HTML fragments, CSS, and classic browser scripts; Vue is a locally packaged seed dependency, not an app-type requirement.

- [Implementation and acceptance evidence](docs/implementation-report.md)
- [Project understanding](docs/project-understanding.md)
- [Implementation plan](docs/implementation-plan.md)
- [Agent guidance](AGENTS.md)
- [Product context](PRODUCT.md)

## Repository secrets

Treat every commit and its history as public. Never commit real credentials, connection records, browser profiles, captured user/provider data, or exported projects. Use unmistakably synthetic fixture values. [.gitignore](.gitignore) excludes local configuration and artifacts, but actual staged contents must also pass a secret scan before every commit/push. Scan full history before any visibility change. Public availability does not establish an open-source license; bundled Vue retains its MIT notice.
