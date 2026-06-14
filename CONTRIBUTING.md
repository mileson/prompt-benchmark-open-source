# Contributing

Thanks for helping improve Prompt Benchmark.

## Local Setup

1. Install dependencies with `npm install`.
2. Copy `apps/api/.env.example` to `apps/api/.env`.
3. Copy `apps/web/.env.example` to `apps/web/.env.local`.
4. Configure your own Supabase and AI provider values.
5. Run `npm run dev`.

## Before Opening a Pull Request

- Run `npm run lint`.
- Run `npm run build`.
- Do not commit `.env` files, private credentials, exported learner data, screenshots with real names, or historical classroom records.
- Keep user-facing copy understandable for teachers and learners.

## Data and Privacy

Use synthetic examples in tests, docs, seeds, screenshots, and issue reports. Replace names, prompts, URLs, IDs, and logs that came from a real event.
