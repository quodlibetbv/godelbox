# Godelbox

Godelbox is a local-first, single-user web application where AI changes a running application by editing its virtual files. The user can save versions and restore an application's code, data, libraries, and instructions together.

An independent host provides the permanent prompt, Start, Stop, Settings, Files, Errors, and History controls. Generated applications run in a sandboxed iframe. The host remains available when an application breaks or deletes its own interface.

## Status

Project definition and repository foundation only. The application, package scripts, and acceptance tests have not been implemented. There are no runnable installation, development, or build commands yet.

The supplied [prototype specification](_specs/ace-mvp-specification-v1.1.md) is the implementation authority. Godelbox is the project name; ACE is the specification's working name. Existing `ace/1`, `window.ace`, storage keys, and export formats remain the specified contracts until explicitly revised.

## Intended implementation

- **Host:** TypeScript, Vue 3, and Vite, producing static HTML, CSS, JavaScript, and assets.
- **Generated apps:** HTML fragments, CSS, and classic browser JavaScript, initially with a locally packaged, pinned Vue global build.
- **Persistence:** host-owned IndexedDB for working files, immutable snapshots, host limits, and request accounting.
- **Model connection:** Settings saves the endpoint, model, API key, and connection options in host-origin `localStorage` under `ace.model-connection.v1`.
- **AI:** direct browser requests to OpenRouter or a compatible Chat Completions endpoint with tool calling and browser CORS support.
- **Execution:** one opaque-origin iframe with `sandbox="allow-scripts"` and a session-bound message bridge.
- **Initial browser target:** desktop Chromium; actual browser/version and recovery-test results will be recorded during implementation.

There is no application backend, model proxy, generated-app bundler, or server-side credential configuration. Node and Vite are development/build tools. Model configuration happens in the browser and requires no rebuild. The seed and saved versions must start without an API key or model request.

Snapshots copy the entire virtual filesystem. Restore preserves existing history branches. Reload leaves execution stopped. AI edits operate on a draft and commit only after successful completion and validation; Stop invalidates pending work and prevents late responses from activating an app.

## Project documents

- [Project understanding](docs/project-understanding.md): intended behavior, boundaries, and implementation risks.
- [Implementation plan](docs/implementation-plan.md): ordered milestones and evidence required for delivery.
- [Agent guidance](AGENTS.md): repository conventions and engineering requirements.

## Secrets and repository contents

Treat every commit as potentially public. Never commit real API keys, tokens, passwords, private keys, sensitive headers, connection records, browser profiles, project exports, or captured user/provider data. This applies to specs, documentation, fixtures, logs, screenshots, and Git history as well as source code. Use unmistakably synthetic test values.

The browser-local connection store is runtime data, outside the repository. Its API key is stored as plain text by the explicit prototype contract; it must never enter generated files, snapshots, exports, model context, iframe messages, or diagnostics. **Clear saved connection** must remove it without erasing project history or request accounting.

[.gitignore](.gitignore) excludes local credentials, runtime data, and test artifacts. Review the actual staged files and run a secret scanner before committing/pushing; ignore rules alone do not inspect file contents or previously tracked files. Before any future visibility change, scan the complete Git history and review all repository attachments and automation configuration.

## Delivery evidence

The implementation will document its fixed development origin, required Node version, pinned dependencies, working npm commands, static deployment, browser Settings flow, storage, recovery, and export/import. Acceptance criteria A01–A30 are defined in the specification. Deterministic browser/unit tests must work without a paid key; live provider tests and the target-browser infinite-loop recovery test must be reported separately with their actual outcomes.
