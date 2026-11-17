<!-- SPEC.md -->
# BandFindr
A website-based platform for finding band members.

## User Roles
- Band seeker: actively looks for a band on the platform.
- Member seeker: posts a band they are forming, with details (such as positions and location), and passively looks for members.

Roles are not separate. A single account type is used, and only the actions are categorized.

## Main Flows

### Member Seeker Side
Request email code -> Register with code -> Login -> Complete profile -> Fill at least one role -> Post band with details -> Review join requests (reject/accept) -> Finish

### Band Seeker Side
Visit -> Browse home page -> Request email code -> Register with code -> Login -> Complete profile -> Fill at least one role -> View band details & its creator -> Send join request to a band -> Receive acceptance or rejection notification -> Finish

## Database Schema
IDs use UIDs.

### User
id (non-null, matches Auth), name nullable, bio nullable, profile_public_id nullable (contains Cloudinary image id), province nullable, city nullable, date_of_birth nullable, social_medias[] nullable, is_profile_complete (non-null, default false)

A completed profile must contain name, province, city, and date_of_birth.

### RegistrationCode
registration_codes: email (normalized primary key), code_hash (email-bound Argon2id), expires_at, sent_at, failed_attempts (default 0). All fields are non-null; direct client access is denied.

### Role
id, name (as in the role name, eg. guitarist)

### RoleUser
many-to-many pivot table, the role and user combination should be unique, and this table cascades

### Genre
id, name (genre name). This table is seeded before runtime

### Band
id, name, description nullable, is_open default true (automatically closes when all roles have been filled), logo_public_id nullable (contains cloudinary image id), leader_id (many-to-one with user)

### BandGenre
many-to-many pivot table for band and genre, combination should be unique, and it cascades

### BandRole
many-to-many pivot table with extra "slotLeft" integer field, the role and band combination should be unique, the slotLeft counter should go down after the leader accepts an application, and this table cascades. When counter reaches 0, delete the row entirely, and automatically reject all other applications with the same role. The leader does not count in the BandRole table, so this table is purely for open positions only

### Application
many-to-many pivot table for user and band with extra "roleId" field, band and user combination should be unique, application record should be deleted after it's been accepted/rejected, and this table cascades. After being accepted, the user should become a member of the band

### BandMember
many-to-many pivot table for user and band with extra "roleId" field, band and user combination should be unique, and this table cascades. The leader should be a band member too

### Notification
id, user_id (references the recipient user), message, is_read default false

Create a notification for the applicant whenever their application is accepted or rejected, including automatic rejections. Notification messages are in Indonesian.

## Images
Cloud image storing will be handled by Cloudinary

## Authentication
Authentication is handled by Supabase. Public Supabase signup is disabled to require the backend email-code flow.

1. `POST /auth/send-code` accepts an email, trims and lowercases it, and sends six random digits through Resend. Codes expire in ten minutes, allow five wrong attempts, and require sixty seconds between sends. Successful resend replaces the previous code; failed delivery preserves it. Existing accounts receive the same success message without an email.
2. `POST /auth/signup` accepts only email, password (8–128 characters), and code. The backend verifies ownership and creates an email-confirmed Auth account using the server-only service-role credential. A database trigger creates the empty profile and consumes the code atomically with Auth creation. Invalid, expired, exhausted, or existing-account registrations return a generic auth error. Signup returns an Indonesian message, not a session. `/auth/verify` is removed.
3. The user logs in separately. Protected actions check authentication, then `is_profile_complete`; incomplete profiles receive HTTP 403 (`PROFILE_INCOMPLETE`). Login, refresh, logout, profile completion, and current public reads remain available.
4. `POST /users/me/complete-profile` requires authentication and exactly name, province, city, date_of_birth. It bypasses the completion gate, validates the existing name/location rules and birth-date range (1900-01-01 through today), and atomically sets the fields and completion flag. Concurrent or repeated completion permits one success and returns HTTP 409 for subsequent attempts. Roles are selected separately through profile updates.

Profile responses expose `is_profile_complete` but omit birth dates. Registration and completion cannot set roles, optional profile fields, or the completion flag directly. All profile columns are nullable; the primary key and completion flag remain non-null. Auth metadata does not initialize the profile.

Resend uses `RESEND_API_KEY` and `RESEND_FROM_EMAIL` in each environment. `SUPABASE_SERVICE_ROLE_KEY` is server-only. Development sends real Resend email; automated tests mock email delivery while testing against local Supabase. The database reset and demo seeder target local development only.

## Services
Session should be checked before running each action (with some exceptions)

### User
- completeProfile (authenticated user only, incomplete profile required)
- updateProfile (only the user itself is authorized, completed profile required)
- fetchProfile (no need to check for session) shows: name, bio, profile_public_id, province, city, social_medias[], is_profile_complete

### Band
Both `queryBands` and `fetchBand` return `province` and `city` from the leader's profile and an `open_roles` list. Each open role includes `role_id`, `name`, and `slot_left`.

- queryBands (no need to check for session, also add filters based on name, genre, is_open, roles) shows: id, name, description, is_open, logo_public_id, leader_id (includes profile_public_id, name)
- createBand
- fetchBand (no need to check for session), shows: name, description, is_open, logo_public_id, leader_id (includes profile_public_id, name)
- updateBand (only leader is authorized)

### Application
- createApplication (check whether the application role matches the user's role or not)
- fetchApplicationsFromBand (only leader of the band is authorized)
- fetchApplication (only sender and leader of the band is authorized)
- acceptApplication (only leader is authorized)
- rejectApplication (only leader is authorized)

### Notification
- fetchNotifications returns the signed-in user's notifications, each with `id`, `message`, and `is_read`.
- markNotificationAsRead sets `is_read` to true for the specified notification if it belongs to the signed-in user.

### Catalog
No need to check for session

- fetchRoles
- fetchGenres

## Out-of-Scope
- Chatting feature
