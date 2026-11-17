# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Edison is a phone-first ticket tracker for the ZarleyLtd apps. Each ticket is a GitHub issue (label `edison`) in the target app's repository; new-app ideas are issues in this repo labelled `app:new`. Deploy Agent comments an agent mention (`@cursor` or `@claude`) on the issue, the agent opens a pull request, and the user merges from Edison. Live site: https://zarleyltd.github.io/Edison/ (GitHub Pages from `main`). Design decisions and stage rules: `docs/PLAN.md`.

## Dev server

No build step, no package.json, no linter. Serve the repo root with any static server; the project uses Python on **port 4173**:

```powershell
python -m http.server 4173
```

Then open http://127.0.0.1:4173/index.html. Saving a GitHub token in Settings is required before tickets load. The service worker is network-first, so a normal reload picks up edits. It does not register when a page is opened as `file://`.

## Commands

```powershell
node --test                          # run all tests (use this, not `node --test tests/`, which fails on Node 24)
node --test --test-name-pattern="priority" tests/edison.test.js   # single test by name
.\tools\clone-new-app.ps1 -Name TheNewApp                      # clone a repo made by Create repo into C:\CursorSites
.\tools\preview-pr.ps1 -Repo HelloWorldCursor -Number 12       # check out an app PR into C:\CursorSites\_pr-previews via a worktree (needs gh)
```

## Architecture

- **Pages**: `index.html` (list + detail side by side on wide screens), `ticket.html` (single ticket on phones), `settings.html`. Each sets `<body data-page="...">`; `assets/js/main.js` registers the service worker and calls `EdisonList.init()` / `EdisonTicketPage.init()` / `EdisonSettings.init()`.
- **Scripts are plain globals** loaded by `<script>` tags in a fixed order (config → utils → components → page → `main.js`). There are no modules or bundler. Adding a JS file means adding a `<script>` tag to every page that needs it **and** adding it to the `SHELL` list in `sw.js` (bump `CACHE` so phones pick up the change).
- **Pure helpers** (`labels.js`, `query.js`, `formatters.js`) use a UMD wrapper so they work both as browser globals and via `require` in `tests/edison.test.js`. Keep them free of the DOM.
- **GitHub is the database**: `assets/js/utils/api.js` wraps the REST API (issues, comments, labels, Contents API, branches, pulls, merge). The token lives in browser storage via `auth.js`; there is no server and no Supabase.
- **Labels carry state** (`labels.js` is the source of truth): `type:*`, `stage:*` (inbox, ready, working, needs-input, review, parked), `p1`–`p3`. A closed issue means done. Labels are created on a repo when a ticket is filed (`ensureLabels`).
- **Ticket search** (`query.js`) builds GitHub issue-search queries across `user:ZarleyLtd`; new-app ideas are queried on `repo:ZarleyLtd/Edison` with `label:app:new` instead of `label:edison`.
- **Photos**: compressed in the browser (`ImageCompress.compressToTarget`, ~100 KB JPEG). For an existing app, `storeTicketPhoto` commits them to that ticket's PR branch (opening the PR if needed), so the live branch changes only on merge. For a new-app idea they go under `attachments/<repo>/<issue>/` in this repo, which is public.
- **Agent wiring**: `agents.json` holds the selected vendor and the brief posted with Deploy Agent (`agents.js`). Settings writes it. `setup.js` opens a "rules PR" that puts `templates/edison.mdc` into an app as `.cursor/rules/edison.mdc`; Deploy Agent is disabled until that file is on the app's default branch. `templates/claude.yml` and `templates/CLAUDE.md` are copied into apps for the Claude vendor. Edits to these templates change what agents in *other* repos are told.
- **App list**: `apps.json` (name, repo, pagesUrl, localPath). The `New app` entry (`isNew: true`, `repo: null`) is the target for ideas.
- `mockups/` and `index.reference.html` are design previews, not part of the app or the service-worker shell.

## Rules

Moved here from the former `.cursorrules`. Layout: config in `assets/js/config/app-config.js` (`EDISON_CONFIG`), helpers in `assets/js/utils/`, components in `assets/js/components/`, pages in `assets/js/pages/` (each exposes `init()`).


1. Relative paths only in page markup — never `http://localhost` or a drive letter. (`apps.json` may hold local clone paths.)
2. Must work at 360px touch width and at ≥1100px with list and detail together; keyboard: `n` new ticket, `/` search, Escape closes a sheet.
3. Escape any GitHub-sourced text before `innerHTML`; issue bodies go through `EdisonFormat.renderMarkdown`.
4. Never upload original photos; always compress first.
5. Deploy Agent comments the mention and sets `stage:working`. The agent never merges; Merge PR is a confirmed button on an In review ticket.
6. New-app ideas (`app:new`) do not show Deploy Agent.
7. Never commit a GitHub token.
8. Shared header markup lives in `components/header.html` and is pasted into `index.html`, `ticket.html`, and `settings.html` — keep them in sync by hand.
9. Pages ship a strict CSP (`script-src 'self'`, `style-src 'self'`, `connect-src` only `api.github.com`): no inline scripts/styles or third-party CDNs.
10. Brief messages: `BriefMessage.show(text, anchorEl, options)` in `assets/js/utils/brief-message.js`; canonical spec is `../cursor-sites-shared/ui/BRIEF_MESSAGE.md` (summary in `docs/UI_BRIEF_MESSAGE.md`).
