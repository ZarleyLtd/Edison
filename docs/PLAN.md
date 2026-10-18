# Edison development plan

Edison is a phone-first tracker for bugs, changes, features, and new-app ideas. Tickets are GitHub Issues. A background coding agent works only after you tap Switch on, and it stops at a pull request.

## Decisions

- Static HTML, CSS, and JavaScript. No build step. GitHub Pages from `main`.
- One issue per ticket, in the target app's repository. New-app ideas live in this repository with the `app:new` label until Create repo.
- Labels carry type, stage, and priority. Closing the issue means done.
- Photos are compressed in the browser and committed under `attachments/` in this repository.
- The agent is selected in Settings (`agents.json`): `@cursor` now, `@claude` when you copy `templates/claude.yml` into an app.
- A website cannot create `C:\CursorSites\<Name>`. Create repo does the GitHub work and shows the clone command. `tools/clone-new-app.ps1` runs that clone on the PC.

## Stages

`inbox`, `ready`, `working`, `needs-input`, `review`, `parked`. Done is a closed issue.

Switch on is available from Ready and Needs you. It comments the agent mention and sets Working. An open pull request moves Working to In review.

## Out of scope

- No Supabase and no accounts beyond one GitHub token stored on the device.
- Edison does not merge pull requests.
