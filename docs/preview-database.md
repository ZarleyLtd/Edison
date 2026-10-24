# Preview database

How a database change is reviewed with the page change, before it reaches the live Apps database. This is the workflow to build. Edison does not do it yet.

The live apps are static HTML, CSS, and JavaScript on GitHub Pages. They share one Supabase project, Apps. Zarley One is the other project in the same organisation. A weekly GitHub job restores an Apps backup into Zarley One, and that job is also how the backup is tested. Most of the time the two projects already match. The rows on Zarley One can be up to a week old. Zarley One holds one experiment at a time.

## The review never changes which database is live

The JavaScript committed for the live site names Apps. A pull request does not rewrite that URL and then change it back at merge. Merging such a change would publish Zarley One as the live database.

The page chooses Zarley One only when both of these are true:

- This commit is a database experiment. The branch records that with a flag.
- The page is not the live site. The hostname is the signal. `htmlpreview.github.io`, a local preview, and a file opened from disk count as a preview. `zarleyltd.github.io` counts as live.

The query string is a poor signal. The review host already uses it for the file address. On the live hostname the flag does nothing, so leaving it in the merged file does not point the live site at Zarley One.

A pull request with no SQL file is not a database experiment. Its review page keeps using Apps.

## Prepare test environment

This step runs when a database pull request is ready to review. It can be run again. It shares a concurrency lock with the weekly restore, so a review never reads Zarley One halfway through that job.

1. Fingerprint the app object definitions on Apps and on Zarley One.
2. When the fingerprints match, the copy is skipped. Zarley One already has the objects, and its rows are from the last successful restore.
3. When they differ, run the same restore the weekly job runs, then fingerprint again. The second check has to match before the environment is ready.
4. When this pull request contains a SQL file, apply that file to Zarley One after the base matches.

The ticket then says one of:

- Definitions match. Preview is ready.
- Definitions differed, so Zarley One was refreshed from Apps.

When a refresh was needed, the check includes the short diff: a new column on Apps, or an object that exists only on Zarley One.

A second run on the same pull request does not copy again. After step 4, Zarley One is meant to be ahead of Apps by that one SQL file. The step remembers the Apps fingerprint and the pull-request commit. It copies again only if Apps itself has changed, or if Zarley One is no longer that base plus this file.

### What the fingerprint includes

The app schema only: `public`, and any other schema the apps own. Include tables, columns, types, constraints, indexes, views, functions, triggers, and policies.

Leave out row contents, sequence counters, and Supabase's own `auth` and `storage` catalogs. Those differ between two projects even when the app tables match, and counting them would force a copy on every prepare. If the first real run shows a stable difference the restore always leaves behind, such as object owners, leave that out too.

A schema-only dump of both sides, or one checksum query run on each, is enough. The check does not read the rows. The weekly job is why the fingerprints usually match. The check is against the databases, not against that job's green tick. It catches a change made on Apps since the restore, a failed restore, or an earlier experiment left on Zarley One.

Rows stay as of the last successful restore until a definition mismatch forces a new copy. A column added on Apps today causes that copy, so the new shape arrives with current data. New rows alone do not.

The refresh is a restore into the existing Zarley One project, so its URL and keys stay the same. Restoring Apps into a brand-new project would issue new keys, and the review page would not know them.

A database dump does not include Storage files. A row that stores a full Apps file URL still loads. A page that builds the file URL from the Zarley One project will not see the file until the bucket is copied too. The weekly restore already brings the rows. Copying auth users matters on a fresh restore, so a sign-in on the preview is the same person and row policies still match. The password hash comes across; the preview issues its own login.

## From the ticket to the live site

1. The ticket says what should change in the database and on the page. Mark it ready and deploy the agent.
2. The agent adds one SQL file and the page changes. It leaves the Apps URL alone. It does not run anything against Apps. The SQL is additive, so the current live app still works after Apps receives it. A new column is fine. A rename or a drop waits for a later ticket, after the new page is live.
3. Prepare test environment runs. The review link then opens the unmerged page against Zarley One.
4. You review from the phone or the PC. The ticket shows the SQL and whether prepare succeeded.
5. Apply to Apps runs that same SQL file, from this commit, against Apps. It does not copy Zarley One back. The live site is still the old page.
6. Merge PR stays unavailable until that apply has succeeded for this commit. Merging publishes the page. GitHub Pages then updates, and the live site starts using the new column.
7. Close the ticket. Wipe Zarley One afterwards so the spare is empty for the next restore, the next experiment, or a backup test.

The database passwords stay in GitHub secrets. Edison does not hold them, and the page does not hold them. The dump is piped through the job and is not committed.

From the phone this is deploy, prepare, open the review link, Apply to Apps, Merge PR, close. From the PC the apply step is the same action.

## One experiment, one migration list

Edison refuses a second database ticket while one is in review. The lock is across every app, because they share Apps and they share Zarley One.

Keep one ordered list of SQL files for that shared database, in one repo. An app's pull request can change its own pages. A database ticket adds the next file to that single list. Separate migration histories in each app will disagree about what Apps looks like.

Zarley One can go back to the weekly backup restore between experiments. Starting a database ticket means that restore is not running.

## What the agent is told

- A schema change is a file in the migration list, plus the preview flag.
- Do not change the Apps URL.
- Do not apply SQL to Apps.
- Do not merge.

## Not in this workflow yet

Edison has no Prepare or Apply to Apps control. The review page does not switch database by hostname. No app writes its SQL into a shared migration list. The weekly restore is the existing piece this step is meant to reuse.
