# Prompt Benchmark

> An open-source teaching event tool for collecting learner prompts, running AI evaluations, and showing a live leaderboard.

![License](https://img.shields.io/badge/license-MIT-green)
![Node](https://img.shields.io/badge/node-%3E%3D20-blue)
![Data Source](https://img.shields.io/badge/data%20source-Supabase%20or%20custom%20API-purple)

[简体中文](README_CN.md)

## Features

- Create training activities and route learners through numbered join links.
- Support allowlist or anonymous participation modes.
- Collect prompt drafts, publish submissions, and export learner work.
- Run AI scoring with a configurable OpenAI-compatible chat completions endpoint.
- Show a live dashboard with status, ranking, scores, strengths, and improvement notes.
- Keep the backend data layer behind a replaceable data-source boundary.
- Ship Supabase migrations and a synthetic seed roster for quick setup.

## Tech Stack

| Layer | Technology |
| --- | --- |
| Web | Next.js, React, TypeScript |
| API | NestJS, TypeScript |
| Default storage | Supabase Postgres via `@supabase/supabase-js` |
| AI evaluation | OpenAI-compatible chat completions API |

## Quick Start

### Prerequisites

- Node.js 20 or newer
- npm 10 or newer
- A Supabase project, or your own API adapter
- An AI provider key for an OpenAI-compatible chat completions endpoint

### Install

```bash
npm install
```

### Configure

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
```

Fill in `apps/api/.env` with your own Supabase and AI provider values. Do not commit `.env` files.

### Prepare Supabase

Run the SQL files in `supabase/migrations/` on your Supabase database, then optionally run `supabase/seed.sql`. The seed file contains only synthetic learner names.

### Run Locally

```bash
npm run dev
```

- Web: `http://localhost:3000`
- API: `http://localhost:3001/api`

## Data Source Adapters

The default backend data source is Supabase. The public extension point is `apps/api/src/common/data-source/`.

- Use `DATA_SOURCE_PROVIDER=supabase` for the included Supabase adapter.
- Use `DATA_SOURCE_PROVIDER=custom_api` as the reserved switch for your own adapter.
- See [docs/data-source-adapters.md](docs/data-source-adapters.md) for the contract and migration notes.

## Privacy

This public copy is built with a fresh Git history and excludes private workflow artifacts, local build output, deployment state, screenshots, historical review reports, and real learner rosters. The included seed data is synthetic.

## Project Structure

```text
apps/web     Next.js frontend
apps/api     NestJS backend
supabase     Database migrations and synthetic seed data
scripts      Local development helpers
docs         Setup, adapter, and privacy notes
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Security

Please report vulnerabilities privately. See [SECURITY.md](SECURITY.md).

## License

MIT

## Author

- SoulCard: [超级峰](https://soulcard.me/card/chaojifeng)
- X: [Mileson07](https://x.com/Mileson07)
- rednote: [超级峰](https://www.xiaohongshu.com/user/profile/58b798d050c4b4193c8111c7)
- Douyin: [超级峰](https://www.douyin.com/user/MS4wLjABAAAA2I1fDroAQZrM8Tdz6MZfd28MCaRizKmD2-lr7UQP-a0)
- Kuaishou: [超级峰](https://www.kuaishou.com/profile/3xeqsssav5aif84)
- Jike: [超级峰](https://web.okjike.com/u/E769500F-3283-4BAE-B2F3-D1F0E944CB70)
