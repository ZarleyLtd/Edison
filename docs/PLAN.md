# Edison development plan

Edison is a phone-first tracker for bugs, changes, features, and new-app ideas. Tickets are GitHub Issues. A background coding agent works only after you tap Deploy Agent, and it stops at a pull request.

## Decisions

- Static HTML, CSS, and JavaScript. No build step. GitHub Pages from `main`.
- One issue per ticket, in the target app's repository. New-app ideas live in this repository with the `app:new` label until Create repo.
- Labels carry type, stage, and priority. Closing the issue means done.
- Photos are compressed in the browser and committed under `attachments/` in this repository.
- The agent is selected in Settings (`agents.json`): `@cursor` now, `@claude` when you copy `templates/claude.yml` into an app.
- A website cannot create `C:\CursorSites\<Name>`. Create repo does the GitHub work and shows the clone command. `tools/clone-new-app.ps1` runs that clone on the PC.

## Stages

`inbox`, `ready`, `working`, `needs-input`, `review`, `parked`. Done is a closed issue.

Deploy Agent is available from Ready and Needs you, once `.cursor/rules/edison.mdc` is on that app's default branch. It comments the agent mention and sets Working. An open pull request moves Working to In review.

## Lightbulb

The lightbulb is the mark and the status signal. Future styling should use different colours and different variants of the bulb to convey different meanings: brightness, glow, greyscale, outline, or a changed colour. Each variant means something. The word for the stage stays next to the bulb, so colour is not the only signal.

The preview in `mockups/` is a first pass: dim for Inbox, brighter for Ready, a glow for Working, violet for Needs you, fully lit for In review, grey for Parked, and green for Done. Those pairings can change. The rule is that a new colour or a new bulb shape is added only when it carries a meaning.

## Out of scope

- No Supabase and no accounts beyond one GitHub token stored on the device.
- Edison does not merge pull requests.
