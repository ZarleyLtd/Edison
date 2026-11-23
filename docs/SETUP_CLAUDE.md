# Connect Claude so Deploy Agent can start an agent

With Claude selected, Deploy Agent comments `@claude` on the issue, and later notes are sent as an `@claude` comment on the ticket's pull request. Each app's `.github/workflows/claude.yml` (from `templates/claude.yml`) picks that comment up and runs Claude Code in GitHub Actions on your Claude subscription.

## Shared conventions

The runner only checks out the app, so before Claude starts, the workflow rebuilds the local `C:\CursorSites` layout around it. It clones the public `ZarleyLtd/cursor-sites-shared` repo beside the app, copies that repo's `CLAUDE.md` to the parent folder (where Claude Code picks it up, as it does locally), and installs `cursor-sites-shared/skills/` as Claude skills. It also clones the reference apps the skills point at: FamilyTree, ierne-snooker, Edison and CrossGunsSnooker (as `PubliiCrossguns`). The prompt tells Claude to treat all of those as read-only.

Changes to the shared rules or skills reach cloud runs only after they are **pushed** to `cursor-sites-shared`.

## Once

1. Install the Claude GitHub app on the ZarleyLtd account: https://github.com/apps/claude → **Install** → all repositories (or the ones Edison works in).
2. Create a long-lived token for your Claude subscription: run `claude setup-token` and copy the `sk-ant-oat…` token it prints.
3. From the Edison folder run `.\tools\set-claude-secret.ps1` and paste the token. It sets the `CLAUDE_CODE_OAUTH_TOKEN` Actions secret on every app in `apps.json` (legacy 4Next* repos skipped). ZarleyLtd is a user account, so there is no org-wide secret.
4. Your Edison GitHub token needs the **workflow** scope as well as **repo**, because the setup pull request adds a file under `.github/workflows/`.
5. In Edison Settings, choose **Claude Code** under Agent and save.

## Per app

1. In Edison Settings → Repositories, tap **Setup PR** for the app and merge that pull request. Deploy Agent stays off until `.github/workflows/claude.yml` with the current `edison-claude-workflow` marker is on the default branch.
2. File a ticket, mark it ready, and tap **Deploy Agent**. Watch the run on the app's **Actions** tab.
3. Claude opens a pull request, comments a summary on the issue, and moves the ticket to In review. Merge it yourself from Edison.

## When something goes wrong

- Nothing appears on the Actions tab: the workflow is not on the default branch, or the comment did not start with `@claude`.
- The run fails at authentication: the secret is missing or the token has expired. Run `claude setup-token` again and re-run the script.
- The run fails at **Add shared CursorSites conventions**: the `cursor-sites-shared` repo could not be cloned. Check that it still exists and is public.
- The ticket stays in Working: open the run log. A command Claude needed may not be in the workflow's `--allowedTools` list.
