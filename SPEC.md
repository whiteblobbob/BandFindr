<!-- SPEC.md -->
# BandFindr
A website-based platform for finding band members.

## User Roles
- Band seeker: actively looks for a band on the platform.
- Member seeker: posts a band they are forming, with details (such as positions and location), and passively looks for members.

Roles are not separate. A single account type is used, and only the actions are categorized.

## Main Flows

### Member Seeker Side
Register -> Verify -> Login -> Fill at least one role -> Post band with details -> Review join requests (reject/accept) -> Finish

### Band Seeker Side
Visit -> Browse home page -> Register -> Verify -> Login -> Fill at least one role -> View band details & its creator -> Send join request to a band -> Receive acceptance or rejection notification -> Finish

## Database Schema
IDs use UIDs.

### User
id, name, bio nullable, profile_public_id nullable (contains cloudinary image id), province, city, date_of_birth, social_medias[]

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
Authentication will be handled by Supabase. The user record should be automatically created via trigger since both DB and the auth lives in supabase. The registration data should be stored in the metadata. Both signup and row creation should run atomically, so if the metadata is missing a required field, the signup should roll back entirely and return an error

Mandatory user fields:
id (matches the supabase user id), name, province, city, date_of_birth

## Services
Session should be checked before running each action (with some exceptions)

### User
- updateProfile (only the user itself is authorized)
- fetchProfile (no need to check for session) shows: name, bio, profile_public_id, province, city, social_medias[]

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
