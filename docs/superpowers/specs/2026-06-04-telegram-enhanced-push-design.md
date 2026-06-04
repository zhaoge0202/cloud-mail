# Telegram Enhanced Push Design

**Date:** 2026-06-04

**Goal**

Add the upstream Telegram enhanced display experience to the current `SMTP2GO-enhanced` branch without changing existing mail receiving behavior, API mode behavior, SMTP2GO behavior, or other non-Telegram flows.

**Scope**

- Add Telegram inline `View` button support for received-email notifications.
- Add a token-protected email detail page for Telegram users.
- Add Telegram message display options:
  - `customDomain`
  - `tgMsgFrom`
  - `tgMsgTo`
  - `tgMsgText`
- Move Telegram notification formatting/sending out of `mail-worker/src/email/email.js` into a dedicated service.
- Mask Telegram bot token in settings responses and only overwrite it when the admin enters a new value.

**Non-Goals**

- No changes to inbound mail processing rules or routing semantics.
- No changes to SMTP2GO sending flows.
- No changes to API-token mode behavior.
- No introduction of upstream OAuth, AI code extraction, blacklist, or other unrelated upstream features.
- No broad refactor of current mail receiving code outside the Telegram notification branch.

## Current State

The current branch already supports basic Telegram forwarding from `mail-worker/src/email/email.js`. The implementation sends a plain Telegram message directly inside the receive flow, uses only `tgBotToken`, `tgChatId`, and `tgBotStatus`, and has no Telegram email detail page.

The current admin UI has a Telegram settings dialog in `mail-vue/src/views/sys-setting/index.vue`, but it only manages:

- `tgBotToken`
- `tgChatId`
- `tgBotStatus`

## Target Design

### 1. Preserve Current Mail Pipeline

The existing receive pipeline in `mail-worker/src/email/email.js` remains the source of truth for:

- receive enable/disable checks
- account lookup
- role/domain checks
- attachment persistence
- mailbox persistence
- external email forwarding

The only Telegram-specific change in this file is:

- replace the inline Telegram `sendMessage` block with a call to `telegramService.sendEmailToBot(...)`

This keeps current behavior stable while isolating Telegram display logic in one place.

### 2. New Backend Units

Create the following backend files:

- `mail-worker/src/api/telegram-api.js`
- `mail-worker/src/service/telegram-service.js`
- `mail-worker/src/template/email-msg.js`
- `mail-worker/src/template/email-html.js`
- `mail-worker/src/template/email-text.js`

Responsibilities:

- `telegram-api.js`
  - expose `GET /telegram/getEmail/:token`
  - return rendered email detail HTML
  - set long-lived cache headers for immutable token pages

- `telegram-service.js`
  - generate Telegram inline keyboard
  - send Telegram messages using current settings
  - generate JWT token carrying `emailId`
  - load email content for Telegram detail view
  - choose HTML or text template based on stored email content

- `email-msg.js`
  - build Telegram message preview text
  - enforce consistent HTML escaping
  - enforce preview truncation
  - apply `tgMsgFrom`, `tgMsgTo`, `tgMsgText`

- `email-html.js`
  - render stored HTML email safely for Telegram detail view
  - remove `<script>` tags
  - isolate rendered content using Shadow DOM
  - restore `{{domain}}` image placeholder references using current `r2Domain`

- `email-text.js`
  - render stored plain text email safely in a minimal read-only page

### 3. Route and Auth Model

Add:

- `GET /telegram/getEmail/:token`

Design choices:

- Token is generated with the existing JWT utility.
- Token payload only needs `emailId`.
- Invalid token returns a plain rendered denial page, not JSON.
- Missing email returns a plain rendered "does not exist" page.

Security boundary:

- This route is intended for possession-based Telegram deep links.
- It should not require normal app login.
- It should remain excluded from the standard authenticated app flow.

### 4. Settings Model Changes

Extend `mail-worker/src/entity/setting.js` with:

- `customDomain`
- `tgMsgFrom`
- `tgMsgTo`
- `tgMsgText`

Recommended defaults aligned with upstream behavior:

- `customDomain`: `''`
- `tgMsgFrom`: `'only-name'`
- `tgMsgTo`: `'show'`
- `tgMsgText`: `'hide'`

Migration strategy:

- Add a new incremental migration function in `mail-worker/src/init/init.js`
- Each new column is added with `ALTER TABLE ... ADD COLUMN ... DEFAULT ...`
- Migration must be idempotent through existing try/catch style used in this repo

### 5. Settings Service Changes

Update `mail-worker/src/service/setting-service.js` to:

- include the new Telegram display fields in cached settings
- return masked `tgBotToken` from `get(...)`
- preserve existing token unless a new non-empty token is submitted
- expose new Telegram fields through `websiteConfig(...)`

Token-handling rule:

- When the UI opens Telegram settings, the token input is blank.
- The placeholder shows the masked stored token.
- Saving Telegram settings only updates `tgBotToken` if the admin typed a new value.

This avoids sending existing bot tokens back to the browser in clear text.

### 6. Telegram Notification Behavior

When Telegram push is enabled and `tgChatId` is configured:

- the receive pipeline calls `telegramService.sendEmailToBot(...)`
- the service builds an inline keyboard with:
  - one `View` button
  - one copyable verification-code button if the email row has `code`

`View` URL behavior:

- if `customDomain` is configured:
  - open `${customDomain}/api/telegram/getEmail/:token`
- if `customDomain` is empty:
  - use the same safe fallback placeholder behavior as upstream

Display rules:

- `tgMsgFrom`
  - `hide`
  - `only-name`
  - `show`
- `tgMsgTo`
  - `hide`
  - `show`
- `tgMsgText`
  - `hide`
  - `show`

Message preview rules:

- HTML-escape all user-derived values before sending to Telegram
- derive text preview from `email.text`, then fallback to HTML-to-text
- truncate preview to fit Telegram message limits

### 7. Frontend Changes

Update `mail-vue/src/views/sys-setting/index.vue` only, keeping the current dialog structure and surrounding settings page intact.

Add fields to the existing Telegram settings dialog:

- masked `tgBotToken` placeholder
- `customDomain`
- `tgMsgFrom` select
- `tgMsgTo` select
- `tgMsgText` select

Behavior:

- `openTgSetting()` loads current non-secret Telegram display settings
- `tgBotToken` input starts empty
- `tgBotSave()` only sends `tgBotToken` if the field is non-empty
- other Telegram display settings always persist normally

Update i18n files:

- `mail-vue/src/i18n/en.js`
- `mail-vue/src/i18n/zh.js`
- `mail-vue/src/i18n/zh-tw.js`

Add only the Telegram strings required for:

- custom domain label
- from/to/text display options
- option labels such as `show`, `hide`, `onlyName` if current files do not already expose the needed wording

### 8. Compatibility Constraints

This work must preserve:

- current `mail-worker/src/email/email.js` receive behavior outside Telegram push formatting
- current `mail-worker/src/service/inbound-service.js`
- current `mail-worker/src/service/smtp2go-service.js`
- current `mail-worker/src/service/api-token-service.js`
- current worker routing for app API and asset serving

Explicitly out of scope:

- rewriting `setting` semantics to match upstream
- switching current Telegram push trigger points to a different receive source
- changing existing mail row persistence structure except where the Telegram display feature consumes already-stored fields

## Testing Strategy

### Backend

Add focused tests for Telegram-specific logic only.

Preferred coverage:

- `email-msg` formatting
  - escapes HTML
  - respects `tgMsgFrom`
  - respects `tgMsgTo`
  - respects `tgMsgText`
  - truncates long previews

- `telegram-service`
  - builds `View` button URL from `customDomain`
  - falls back safely when `customDomain` is absent
  - includes code copy button only when `email.code` exists
  - returns text detail page for plain-text emails
  - returns HTML detail page for HTML emails
  - returns denial page for invalid token

Because the current worker Vitest setup is broken in this branch, tests should be added in a way that can run independently with minimal configuration friction. If needed, a lightweight Node-side Vitest path can be added for pure helper/template logic without requiring the worker pool.

### Frontend

Minimum verification:

- Telegram settings UI builds successfully
- saving Telegram settings does not require token re-entry when changing only display options
- existing settings page behavior remains intact

### Full Verification

Required commands before completion:

- backend targeted tests for new Telegram logic
- `pnpm build` in `mail-vue`
- `pnpm exec wrangler deploy --dry-run` in `mail-worker`

If full automated worker tests remain blocked by unrelated existing config issues, report that explicitly and do not claim broader test coverage than was actually achieved.

## Risks

- Current worker test harness is already broken; Telegram tests must avoid getting blocked on unrelated test infrastructure where possible.
- `customDomain` must be normalized consistently or generated Telegram links may be malformed.
- Rendering stored HTML in Telegram detail view must not allow active script execution.
- Masked token handling must avoid overwriting the real stored token with the masked placeholder.

## Acceptance Criteria

- Telegram push still triggers from the current receive pipeline.
- Telegram message now includes a `View` button.
- `View` opens a token-protected detail page showing the stored email content.
- Admin can configure `customDomain`, `tgMsgFrom`, `tgMsgTo`, and `tgMsgText`.
- Existing bot token is never sent back to the browser in clear text.
- Changing Telegram display options does not require re-entering the bot token.
- Current non-Telegram behavior remains unchanged.
