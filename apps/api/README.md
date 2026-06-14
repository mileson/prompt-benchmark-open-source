# Prompt Benchmark API

NestJS backend scaffold for the training-event prompt benchmark product.

## What is included
- NestJS REST API with global `ValidationPipe`
- Supabase adapter for the default business tables
- Data-source boundary for future custom API adapters
- Core modules: activities, participants, submissions, dashboard, evaluations
- Async-in-process AI evaluation trigger for MVP validation

## Local setup
1. Install dependencies:
   ```bash
   cd apps/api
   npm install
   ```
2. Copy `.env.example` to `.env` and fill in your own Supabase and AI provider values.
3. Start the API:
   ```bash
   npm run start:dev
   ```

## Notes
- The evaluation worker currently runs in-process for MVP speed.
- Production can later swap this for a queue / worker service without changing the public API shape.
