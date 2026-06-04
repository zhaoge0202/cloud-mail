# Email Unread Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a minimal inbox unread/read flow without changing any non-inbox behavior.

**Architecture:** Keep the feature narrow by adding one email schema field, one read API, and focused frontend unread state handling. Reuse existing inbox list/detail navigation and avoid broader mailbox UX changes.

**Tech Stack:** Vue 3, Pinia, Hono, Drizzle ORM, Vitest

---

## File Structure

**Create**

- `mail-worker/test/node-email-unread.spec.js`
- `mail-worker/src/service/email-unread.js`
- `mail-vue/src/enums/email-enum.js`
- `mail-vue/src/components/email-scroll/unread-utils.js`

**Modify**

- `mail-worker/src/const/entity-const.js`
- `mail-worker/src/entity/email.js`
- `mail-worker/src/init/init.js`
- `mail-worker/src/service/email-service.js`
- `mail-worker/src/api/email-api.js`
- `mail-vue/src/request/email.js`
- `mail-vue/src/store/email.js`
- `mail-vue/src/views/email/index.vue`
- `mail-vue/src/views/content/index.vue`
- `mail-vue/src/components/email-scroll/index.vue`

---

### Task 1: Add unread helper tests and minimal helpers

**Files:**
- Create: `mail-worker/test/node-email-unread.spec.js`
- Create: `mail-worker/src/service/email-unread.js`
- Create: `mail-vue/src/components/email-scroll/unread-utils.js`
- Create: `mail-vue/src/enums/email-enum.js`

- [ ] **Step 1: Write the failing tests**

```js
import { describe, expect, test } from 'vitest';
import { resolveUnreadValue } from '../src/service/email-unread.js';
import { shouldAutoMarkRead, markEmailListReadLocally } from '../../mail-vue/src/components/email-scroll/unread-utils.js';

describe('email unread helpers', () => {
	test('marks received emails unread by default', () => {
		expect(resolveUnreadValue(0, 0, 1)).toBe(0);
		expect(resolveUnreadValue(1, 0, 1)).toBe(1);
	});

	test('auto marks only unread inbox emails', () => {
		expect(shouldAutoMarkRead(true, 0, 0)).toBe(true);
		expect(shouldAutoMarkRead(false, 0, 0)).toBe(false);
		expect(shouldAutoMarkRead(true, 1, 0)).toBe(false);
	});

	test('marks selected list items read locally', () => {
		const list = [{ emailId: 1, unread: 0, checked: true }, { emailId: 2, unread: 0, checked: true }];
		markEmailListReadLocally(list, [1], 1);
		expect(list[0].unread).toBe(1);
		expect(list[0].checked).toBe(false);
		expect(list[1].unread).toBe(0);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run -c vitest.node.config.js test/node-email-unread.spec.js`

Expected: FAIL because helper files do not exist yet.

- [ ] **Step 3: Write minimal implementation**

```js
// mail-worker/src/service/email-unread.js
export function resolveUnreadValue(type, receiveType, readType) {
	return type === receiveType ? receiveType : readType;
}
```

```js
// mail-vue/src/components/email-scroll/unread-utils.js
export function shouldAutoMarkRead(showUnread, unread, unreadValue) {
	return showUnread && unread === unreadValue;
}

export function markEmailListReadLocally(emailList, emailIds, readValue) {
	emailIds.forEach((emailId) => {
		const index = emailList.findIndex((email) => email.emailId === emailId);
		if (index > -1) {
			emailList[index].unread = readValue;
			emailList[index].checked = false;
		}
	});
}
```

```js
// mail-vue/src/enums/email-enum.js
export const EmailUnreadEnum = {
	UNREAD: 0,
	READ: 1,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run -c vitest.node.config.js test/node-email-unread.spec.js`

Expected: PASS

---

### Task 2: Add backend unread schema and read API

**Files:**
- Modify: `mail-worker/src/const/entity-const.js`
- Modify: `mail-worker/src/entity/email.js`
- Modify: `mail-worker/src/init/init.js`
- Modify: `mail-worker/src/service/email-service.js`
- Modify: `mail-worker/src/api/email-api.js`

- [ ] **Step 1: Add unread enum and schema field**

Add:

```js
unread: {
	UNREAD: 0,
	READ: 1,
}
```

to `emailConst`, and:

```js
unread: integer('unread').default(0).notNull(),
```

to the `email` entity.

- [ ] **Step 2: Add migration**

Append a new migration in `mail-worker/src/init/init.js` that:

```sql
ALTER TABLE email ADD COLUMN unread INTEGER NOT NULL DEFAULT 0;
UPDATE email SET unread = 1;
```

Run each statement separately with the repo's existing tolerant migration style.

- [ ] **Step 3: Set unread state on inserts**

Import `resolveUnreadValue` and set unread when receiving mail:

```js
params.unread = resolveUnreadValue(params.type, emailConst.type.RECEIVE, emailConst.unread.READ);
```

Also set sent mail rows explicitly to `READ`.

- [ ] **Step 4: Add read API**

Add route:

```js
app.put('/email/read', async (c) => {
	await emailService.read(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok());
});
```

And service method:

```js
async read(c, params, userId) {
	const { emailIds } = params;
	await orm(c)
		.update(email)
		.set({ unread: emailConst.unread.READ })
		.where(and(
			eq(email.userId, userId),
			eq(email.type, emailConst.type.RECEIVE),
			inArray(email.emailId, emailIds)
		))
		.run();
}
```

---

### Task 3: Wire inbox unread UI and detail auto-read

**Files:**
- Modify: `mail-vue/src/request/email.js`
- Modify: `mail-vue/src/store/email.js`
- Modify: `mail-vue/src/views/email/index.vue`
- Modify: `mail-vue/src/views/content/index.vue`
- Modify: `mail-vue/src/components/email-scroll/index.vue`

- [ ] **Step 1: Add frontend request and store flags**

Add:

```js
export function emailRead(emailIds) {
	return http.put('/email/read', { emailIds });
}
```

And add `showUnread: false` to `emailStore.contentData`.

- [ ] **Step 2: Pass unread props from inbox**

In `mail-vue/src/views/email/index.vue`:

- import `emailRead`
- pass `:email-read="emailRead"` and `:show-unread="true"` to `emailScroll`
- when jumping into details, set `emailStore.contentData.showUnread = true`

- [ ] **Step 3: Auto-read in detail page**

In `mail-vue/src/views/content/index.vue`:

- import `onMounted`, `onUnmounted`, `emailRead`, `EmailUnreadEnum`, `shouldAutoMarkRead`
- on mount:

```js
if (shouldAutoMarkRead(emailStore.contentData.showUnread, email.unread, EmailUnreadEnum.UNREAD)) {
	email.unread = EmailUnreadEnum.READ;
	emailRead([email.emailId]);
}
```

- on unmount reset `emailStore.contentData.showUnread = false`

- [ ] **Step 4: Extend emailScroll**

In `mail-vue/src/components/email-scroll/index.vue`:

- add props:
  - `emailRead: Function`
  - `showUnread: Boolean = false`
- show a mark-read icon in the header only when:
  - `showUnread`
  - selected ids exist
- apply unread styling to sender, subject, and time when `item.unread === EmailUnreadEnum.UNREAD`
- add dot indicators for unread on mobile/desktop
- add:

```js
const handleRead = () => {
	const emailIds = getSelectedMailsIds();
	props.emailRead(emailIds);
	markEmailListReadLocally(emailList, emailIds, EmailUnreadEnum.READ);
}
```

and a single-item helper using the same local updater.

---

### Task 4: Verify

**Files:**
- Modify: none unless fixes are needed

- [ ] **Step 1: Run node-side tests**

Run:

```bash
cd mail-worker && pnpm exec vitest run -c vitest.node.config.js test/node-email-unread.spec.js test/node-shadow-html-scale.spec.js test/node-all-email-filter.spec.js
```

Expected: PASS

- [ ] **Step 2: Run Telegram regression tests**

Run:

```bash
cd mail-worker && pnpm exec vitest run -c vitest.telegram.config.js test/telegram-message.spec.js test/telegram-detail.spec.js
```

Expected: PASS

- [ ] **Step 3: Run frontend build**

Run: `cd mail-vue && pnpm build`

Expected: PASS

- [ ] **Step 4: Run worker dry-run**

Run: `cd mail-worker && pnpm exec wrangler deploy --dry-run`

Expected: PASS
