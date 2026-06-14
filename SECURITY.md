# Security Policy

## Reporting a Vulnerability

Please do not open a public issue for security vulnerabilities.

Send a private report to the maintainer through the author links in `README.md`. Include:

- What happened
- Affected version or commit
- Minimal reproduction steps
- Impact and any known workaround

## Sensitive Data Rules

- Never commit API keys, service-role keys, tokens, database URLs, or admin passwords.
- Never commit real learner rosters, classroom exports, prompt submissions, screenshots, or evaluation reports.
- Use `apps/api/.env.example` and `apps/web/.env.example` only for placeholders.
