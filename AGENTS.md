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

## Tech Stack (Frontend)
- TO-DO

## Notes
- The entire codebase should be written in English, but messages that get shown to the user should be in Indonesian (eg. UI, error message, etc.)
- All errors should be handled in the backend and get formatted, so that errors that leaks important stuff (like database structure) don't get shown
- Use a database transaction when multiple queries must commit or roll back together to keep data consistent.
- NEVER make any assumptions. Always ask if you're missing information

Follow SPEC.md for detailed information about the project
