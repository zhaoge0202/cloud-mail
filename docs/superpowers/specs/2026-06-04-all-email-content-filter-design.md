# All Email Content Filter Design

**Date:** 2026-06-04

**Goal**

Add a new `内容 / Content` filter option to the admin `全部邮件 / All Mail` page so operators can search mail body text in addition to sender, subject, user, and mailbox.

## Scope

- Add a new `searchType = 'content'` option in the All Mail filter selector.
- Add a new `content` request parameter to `/allEmail/list`.
- Filter against `email.text` only, using case-insensitive contains matching.

## Non-Goals

- No full-text search engine.
- No HTML-body (`email.content`) matching.
- No changes to batch delete filters.
- No changes to other pages or APIs.

## Current State

Frontend `mail-vue/src/views/all-email/index.vue` supports four search types:

- sender (`name`)
- subject (`subject`)
- user (`userEmail`)
- mailbox (`accountEmail`)

Backend `mail-worker/src/service/email-service.js#allList()` receives those params and adds SQL conditions with prefix matching.

## Design

### Frontend

In `mail-vue/src/views/all-email/index.vue`:

- Add a fifth select option labeled `content`.
- Extend `params` with `content: null`.
- Update `selectTitle` so `searchType === 'content'` displays the new label.
- Update `refreshBefore()` and `search()` to clear/set `params.content`.

Behavior:

- Selecting `内容 / Content` and entering a keyword sends `content=<keyword>` to `/allEmail/list`.
- Existing four filter types keep current behavior.

### Backend

In `mail-worker/src/service/email-service.js#allList()`:

- Accept `content` from params.
- If present, add a case-insensitive condition on `email.text`.
- Matching mode is contains matching:
  - `LIKE '%keyword%'`

Reasoning:

- `email.text` is cleaner than `email.content`.
- avoids HTML tags, CSS, and noisy markup matches
- gives the expected operator experience for body-text search

### Query Semantics

- `name`, `subject`, `userEmail`, `accountEmail` keep current prefix semantics.
- `content` uses contains semantics.
- `content` participates in the same combined condition list as the other filters.

## Acceptance Criteria

- All Mail filter dropdown shows a new `内容 / Content` option.
- Searching with that option returns emails whose `email.text` contains the keyword.
- Existing filter options still work unchanged.
- Frontend build passes.
- Targeted tests for the new search mapping/filter behavior pass.
