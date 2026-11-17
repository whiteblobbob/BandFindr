# BandFindr backend

Bun, Elysia, Drizzle, Supabase Auth/Postgres, and Cloudinary. All API error messages and notifications are in Indonesian.

## Local development

1. Install Bun and Docker, then start Docker.
2. Run `bun install` and `bun run db:start` in this directory. Supabase applies migrations and seeds on its first start.
3. Copy `.env.development.example` to `.env.development`. Run `bunx supabase status` and fill in its local anon key. The template already contains the local database and API URLs.
4. Add Cloudinary credentials to enable image uploads.
5. Run `bun run dev`. The API listens on port 3000. Studio uses port 55423 and the local email inbox uses port 55424.

Use `bun run db:reset` to recreate the **local development database**, apply migrations, and seed catalogs. This deletes its existing data.

## Authentication and requests

Send JSON bodies and `Authorization: Bearer <access_token>` on protected endpoints. Signup requires `email`, `password`, `name`, `province`, `city`, and `date_of_birth` (`YYYY-MM-DD`). Passwords must contain 8–128 characters. Birth dates must be between 1900-01-01 and today.

Read the signup code from the local email inbox and send it with the email to `/auth/verify`. Verification returns a message. Login and refresh return Supabase session objects containing access and refresh tokens. Logout revokes the current refresh session. Supabase access tokens can remain valid until their expiry.

JSON request and response fields use snake_case. Drizzle uses camelCase. Lists return arrays and accept `limit` (1–100, default 20) and `offset` (default 0). Errors use `{ "error": { "code": "...", "message": "..." } }`.

## Endpoints

| Method | Path | Access and input |
| --- | --- | --- |
| GET | `/health` | Public |
| POST | `/auth/signup` | Public, registration fields above |
| POST | `/auth/verify` | Public, `email`, `token` |
| POST | `/auth/login` | Public, `email`, `password` |
| POST | `/auth/refresh` | Public, `refresh_token` |
| POST | `/auth/logout` | Signed in |
| GET | `/users/:id` | Public, excludes birth date |
| PATCH | `/users/me` | Signed in, optional `name`, `bio`, `province`, `city`, `date_of_birth`, `social_medias`, `role_ids` |
| POST | `/users/me/image` | Signed in, multipart `image` |
| GET | `/catalog/roles` | Public |
| GET | `/catalog/genres` | Public |
| GET | `/bands` | Public, optional `name`, `genre` UUID, `role` UUID, `is_open`, pagination |
| GET | `/bands/:id` | Public |
| POST | `/bands` | Signed in, `name`, optional `description`, `genre_ids`, `leader_role_id`, `open_roles` |
| PATCH | `/bands/:id` | Leader, optional `name`, `description`, `genre_ids`, `open_roles`, `is_open` |
| POST | `/bands/:id/logo` | Leader, multipart `image` |
| POST | `/applications` | Signed in, `band_id`, `role_id` |
| GET | `/applications/:id` | Applicant or band leader |
| GET | `/applications/band/:id` | Leader, pagination |
| POST | `/applications/:id/accept` | Leader |
| POST | `/applications/:id/reject` | Leader |
| GET | `/notifications` | Recipient, pagination |
| PATCH | `/notifications/:id/read` | Recipient, repeatable |

`open_roles` contains `{ "role_id": "uuid", "slot_left": 1 }` objects. Band responses include each role's name and the leader's current province and city. `leader_id` remains a UUID and `leader` contains the name and profile image ID. Profile responses additionally include catalog roles for onboarding.

Updates replace supplied role, genre, social-link, and vacancy lists. Omitted fields keep their current value. Use `null` to clear bio or description. A selected profile role list must have at least one entry. Social links must use HTTP(S).

Recruitment slots count additional members. The creator is inserted as a member using `leader_role_id`, which must be in their profile. Removing a vacancy automatically rejects pending applications for that band and role. Reducing a positive vacancy count retains pending applications. Adding vacancies to a closed band requires `is_open: true` to reopen it. Acceptance checks the applicant's current profile role again. Manual closure retains pending applications until rejection or reopening. Rejected applicants can reapply while a matching vacancy is open.

Images accept JPEG, PNG, and WebP up to 5 MB. Cloudinary decodes the image after MIME and signature validation. New assets use unique IDs. Failed database updates trigger cleanup of the new asset, and successful replacement triggers cleanup of the old asset. Cleanup failures are logged for retry by an operator. Development uses `bandfindr/dev`, production uses `bandfindr`.

## Checks

- `bun run typecheck`
- `bun run test:unit`
- `bun run test:integration` with local Supabase running and `SUPABASE_SERVICE_ROLE_KEY` set in `.env.development` from `bunx supabase status`. This key is only needed by test fixtures.

Integration tests create isolated users and remove them afterward. They verify signup rollback, real email-code verification, authorization, privacy, filtering, vacancies, notifications, concurrent decisions, and rollback after a deliberately failed notification insert. Tests refuse non-local database and auth URLs. A test failure may leave test users or test database objects requiring a local reset.

## Migrations and production

Supabase migrations are the executable migration history. Drizzle schema and snapshots generate future table changes with `bun run db:diff`. Copy each new generated SQL migration into `supabase/migrations` with a new timestamp. Keep auth triggers, grants, and security changes in explicit Supabase SQL migrations. Apply the reviewed migrations and repeatable seed before starting the API against a new database.

Copy `.env.production.example` to `.env.production` and fill in the hosted database, Supabase, and Cloudinary values. Use a server-only database connection with permission to access the application tables, and require TLS for hosted Postgres. Application tables enable RLS and revoke direct `anon` and `authenticated` access. Authorization is enforced in the API.

In hosted Supabase, enable email confirmations, configure production SMTP, and install the supplied Indonesian confirmation template. Local CLI settings do not automatically configure hosted Auth. Keep production Auth rate limits appropriate for deployment. Run `bun run start` behind an HTTPS reverse proxy, with the frontend proxying API requests from the same origin. Frontend deployment and hosting are outside this backend implementation.

## Demo data

With local Supabase running and its service role key set as
`SUPABASE_SERVICE_ROLE_KEY` in `.env.development`, run `bun run db:seed:demo`.
This adds two sample bands, a vacancy, a pending application, and an acceptance
notification. Re-running the script leaves existing sample bands in their current
state.

Sign in as `leader@bandfindr.example`, `applicant@bandfindr.example`, or
`member@bandfindr.example` with the local demo password `BandFindr-Demo-123!`.
