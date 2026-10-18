# Edison

A phone-first list of tickets. Each ticket is a GitHub issue on one of the ZarleyLtd apps. When you tap Switch on, a coding agent picks it up and opens a pull request. You review and merge. The live site changes only after that.

Live site: https://zarleyltd.github.io/Edison/

## Stack

Same shape as the other CursorSites apps:

- Static HTML, CSS, and JavaScript. No build step.
- GitHub Issues, labels, and the Contents API. No separate database.
- GitHub Pages from `main`.
- Installable on a phone (manifest, lightbulb icon, offline shell).

## First run

1. Open Settings and save a GitHub personal access token. A classic token with the `repo` scope covers issues, files, pull requests, and creating a repository. The token stays in this browser.
2. Connect the Cursor GitHub app so `@cursor` comments start a cloud agent. Steps are in [docs/SETUP_CURSOR.md](docs/SETUP_CURSOR.md).
3. In Settings, set up labels on the app you want to use. HelloWorldCursor is a good first target.
4. File a ticket, mark it ready, and tap Switch on.

On a wide screen the list and the open ticket sit side by side. On a phone the ticket opens on its own page. Press `n` for a new ticket, `/` to search, and Escape to close the sheet.

## New apps

Choose **New app** when the idea has no repository yet. Switch on stays hidden. Create repo makes `ZarleyLtd/<Name>`, files the first build ticket, and closes the idea. Then, on the PC:

```powershell
.\tools\clone-new-app.ps1 -Name TheNewApp
```

## Agent vendor

Settings writes `agents.json`. Cursor comments `@cursor`. Claude comments `@claude`, after `templates/claude.yml` is copied into the app as `.github/workflows/claude.yml` and the Actions secret is set.

## Local preview

```powershell
python -m http.server 4173
```

Open `http://127.0.0.1:4173/index.html`.

## Notes

Photos attached to a ticket are committed to this public repository. Do not attach anything private.

`GolfScoreChecker` is a private repository listed in `apps.json` so it can appear in the app menu. The GitHub token needs access to it.

Shared brief-message behaviour: [docs/UI_BRIEF_MESSAGE.md](docs/UI_BRIEF_MESSAGE.md).
