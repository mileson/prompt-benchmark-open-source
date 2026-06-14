# Privacy and Sanitization

This public copy was prepared to avoid carrying private classroom history into the open-source repository.

## Removed From the Public Copy

- Existing Git history
- Local agent and review workflow folders
- Build output and dependency folders
- Local deployment metadata
- Screenshots and generated evidence boards
- Historical task reports and review artifacts
- Real learner roster seed data

## Kept

- Application source code
- Public static assets
- Supabase schema migrations
- Synthetic seed data
- Placeholder environment examples
- Setup and adapter documentation

## Maintainer Checklist

Before publishing a release or accepting a contribution:

- Run a sensitive string scan.
- Check that `.env` files are not tracked.
- Check that seed data and docs use synthetic names.
- Check screenshots for names, emails, prompt submissions, QR codes, and private URLs.
- Prefer fresh Git history for any repository that was originally private.
