# Database Setup (Supabase)

## Steps

1. Go to [supabase.com](https://supabase.com) and create a free project
2. Navigate to **SQL Editor** in your Supabase dashboard
3. Run `schema.sql` first — creates the `courts` table with RLS policies
4. Run `seed.sql` — inserts sample court data for development
5. Copy your credentials from **Settings → API**:
   - `SUPABASE_URL` → your project URL (e.g. `https://xxxx.supabase.co`)
   - `SUPABASE_ANON_KEY` → anon / public key
   - `SUPABASE_SERVICE_ROLE_KEY` → service role key (keep secret!)
6. Paste these into `backend/.env`

## Courts Table Schema

| Column      | Type    | Description                                         |
|-------------|---------|-----------------------------------------------------|
| id          | UUID    | Primary key (auto-generated)                        |
| name        | TEXT    | Court display name                                  |
| address     | TEXT    | Full street address                                 |
| latitude    | FLOAT8  | GPS latitude                                        |
| longitude   | FLOAT8  | GPS longitude                                       |
| website     | TEXT    | Booking website URL (nullable)                      |
| phone       | TEXT    | Contact phone (nullable)                            |
| facebook    | TEXT    | Facebook page URL (nullable)                        |
| image       | TEXT    | Photo URL (nullable)                                |
| active      | BOOLEAN | Whether to include in searches                      |
| parser_name | TEXT    | Key from `backend/src/parsers/index.ts` (nullable)  |

## Adding a New Court

1. Insert a row in Supabase with the court details
2. Set `parser_name` to the key you'll use in the parser registry
3. Create the parser file (see backend docs)
4. Register it in `backend/src/parsers/index.ts`
