# Connect Cursor so Switch on can start an agent

Edison posts an `@cursor` comment on the GitHub issue when you tap Switch on. Cursor only replies after the Cursor GitHub app can see that repository.

1. Open the Cursor dashboard and connect GitHub for the ZarleyLtd account.
2. Grant the app access to the repositories you want Edison to work in. HelloWorldCursor is the safe first one.
3. Set a cloud-agent spend limit if Cursor asks for one. Cloud agents are billed on top of a Pro plan.
4. In Edison, open Settings and run **Labels** (or **Set up labels on every app**) for that repository.
5. File a moment, mark it ready, and tap **Switch on**.
6. The agent opens a pull request. Review it in Edison or on GitHub. Merge it yourself. Nothing goes live until that merge and GitHub Pages deploys.

Switching to Claude later is a Settings change plus copying `templates/claude.yml` into the app as `.github/workflows/claude.yml`, with a `CLAUDE_CODE_OAUTH_TOKEN` secret. The same Switch on button then comments `@claude`.
