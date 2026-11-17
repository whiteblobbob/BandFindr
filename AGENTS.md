<!-- AGENTS.md -->
# BandFindr

## Tech Stack (Backend)
- TypeScript
- Bun
- ElysiaJS
- TypeBox (Elysia.t)
- Supabase (Auth & Postgres DB)
- Cloudinary (under a folder named "bandfindr")
- Drizzle ORM

## Backend Notes
- Make a test script for every possible case in the backend. If some tests become repetitive (like checking whether the validation works or not), only make it once
- For development mode, host a local Supabase instance for DB and auth. Use separate .env files to achieve this
- For development mode, every cloudinary file/folder should be stored under a sub-folder named "dev" (full path is "bandfindr/dev"). Use separate .env files to achieve this
- In the database, everything should use snake_case. But in the ORM (Drizzle), everything should use camelCase
- The codebase should use a modular structure. Each service should get its own folder (eg. auth, user, band, etc.). Each of those folders should contain their own router, controller, and service (or business logic), so that the root file will be clean and only imports from those modules

## Registration and Profile Onboarding
- Registration is `POST /auth/send-code` followed by `POST /auth/signup` with email, password, and code; `/auth/verify` is removed. Normalize emails by trimming and lowercasing.
- Use Resend (`RESEND_API_KEY`, `RESEND_FROM_EMAIL`) in development and production. Mock delivery in automated tests; never send live test emails or log plaintext codes.
- Store email-bound Argon2id hashes in `registration_codes`. Codes use six random digits, ten-minute expiry, five wrong attempts, and a sixty-second resend interval. Serialize operations per email; persist failed attempts even when returning an error.
- Disable direct public Supabase signup. Only the backend uses `SUPABASE_SERVICE_ROLE_KEY` to create email-confirmed users after code validation. Never expose this credential to clients.
- The Auth trigger creates an empty profile and consumes its registration code in the same transaction. Do not hold a registration-code row lock across the Auth admin request.
- All profile columns are nullable; `users.id` and `is_profile_complete` remain non-null. Completed profiles must contain name, province, city, and date_of_birth.
- Protected routes check authentication before completion. Only completion and logout bypass the completion check; login, refresh, and existing public reads remain available.
- `POST /users/me/complete-profile` accepts only the four required fields, sets completion atomically, and rejects repeated completion with HTTP 409. Select roles separately afterward.
- Keep Drizzle schema/snapshots and forward Supabase migrations aligned. Local reset deletes Auth and application data; run demo seeding after catalog seeds. Never reset a hosted database as part of the development reset.

## Tech Stack (Frontend)
- TO-DO

## Notes
- The entire codebase should be written in English, but messages that get shown to the user should be in Indonesian (eg. UI, error message, etc.)
- All errors should be handled in the backend and get formatted, so that errors that leaks important stuff (like database structure) don't get shown
- Use a database transaction when multiple queries must commit or roll back together to keep data consistent.
- NEVER make any assumptions. Always ask if you're missing information

Follow SPEC.md for detailed information about the project
