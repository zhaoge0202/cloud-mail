# Email Unread Flow Design

**Date:** 2026-06-04

**Goal**

Add a minimal unread/read flow for inbox emails only: new received emails start unread, inbox rows show unread state, opening a message marks it read, and the inbox supports batch mark-as-read.

## Scope

- Add `unread` to `email` records.
- Add `PUT /email/read`.
- Show unread styling and batch mark-as-read in inbox only.
- Auto-mark inbox emails as read when entering the message detail page.

## Non-Goals

- No unread flow for sent, draft, starred, or all-email pages.
- No other `document` branch UX changes like forward button or code tags.
- No changes to TG, SMTP2GO, API token, or attachment behavior.

## Design

- Backend:
  - `email.unread` enum: `UNREAD = 0`, `READ = 1`
  - migration adds column and backfills existing rows to `READ`
  - receive path sets inbox mail to `UNREAD`
  - read API marks only current user's received emails as `READ`

- Frontend:
  - inbox page passes `emailRead` and `showUnread`
  - `emailStore.contentData.showUnread` flags navigation coming from inbox
  - detail page marks current email read on mount if needed
  - `emailScroll` renders unread dot/bold state and batch read action only when `showUnread` is true

## Acceptance Criteria

- Existing inbox emails are read after migration.
- Newly received inbox emails are unread.
- Inbox rows visually distinguish unread emails.
- Opening an unread inbox email marks it read locally and via API.
- Selecting inbox emails allows batch mark-as-read.
