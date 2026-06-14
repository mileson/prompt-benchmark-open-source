# Data Source Adapters

Prompt Benchmark ships with a Supabase adapter and a reserved custom API switch.

## Default: Supabase

Use this mode when you want the included database migrations and query code:

```env
DATA_SOURCE_PROVIDER=supabase
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

Run the SQL files in `supabase/migrations/` before starting the API.

## Reserved: Custom API

Use this mode when you want to connect the backend to your own storage or service:

```env
DATA_SOURCE_PROVIDER=custom_api
CUSTOM_DATA_API_BASE_URL=https://api.example.com
CUSTOM_DATA_API_TOKEN=
```

The extension point is `apps/api/src/common/data-source/`. Business modules call `BackendDataSourceService` instead of importing Supabase directly. To finish a custom adapter, replace the current placeholder with methods that provide the same activity, participant, submission, evaluation, dashboard, and AI configuration operations used by the modules.

## Suggested Adapter Shape

Start with these groups:

- Activities: list, create, read by slug or ID, update settings
- Participants: import roster, login, read session, update product link
- Submissions: save draft, publish latest version
- Evaluations: create jobs, update participant states, write results
- Dashboard: read ranked participants and latest public submissions
- AI config: read and store per-activity model settings

Keep real learner data outside fixtures, issues, and screenshots.
