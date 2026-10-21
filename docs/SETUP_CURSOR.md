# Connect Cursor so Deploy Agent can start an agent

Edison posts an `@cursor` comment on the GitHub issue when you tap Deploy Agent. Cursor only replies after the Cursor GitHub app can see that repository.

1. Open the Cursor dashboard and connect GitHub for the ZarleyLtd account.
2. Grant the app access to the repositories you want Edison to work in. HelloWorldCursor is the safe first one.
3. Set a cloud-agent spend limit if Cursor asks for one. Cloud agents are billed on top of a Pro plan.
4. In Edison Settings, start **Rules PR** for that repository and merge it. Deploy Agent stays off until `.cursor/rules/edison.mdc` is on the default branch.
5. File a ticket, mark it ready, and tap **Deploy Agent**.
6. The agent opens a pull request. Review it in Edison or on GitHub. Merge it yourself. Nothing goes live until that merge and GitHub Pages deploys.

Switching to Claude later is a Settings change plus copying `templates/claude.yml` into the app as `.github/workflows/claude.yml`, with a `CLAUDE_CODE_OAUTH_TOKEN` secret. The same Deploy Agent button then comments `@claude`.
