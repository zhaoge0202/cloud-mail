# All Email Content Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `Content` filter option to the All Mail admin page and search `email.text` with contains matching.

**Architecture:** Keep the feature narrow: add one new frontend search type and one backend query parameter. Reuse the existing All Mail filter flow rather than introducing new endpoints or search infrastructure.

**Tech Stack:** Vue 3, Hono, Drizzle ORM, Vitest

---

## File Structure

**Create**

- `mail-worker/vitest.node.config.js`
- `mail-worker/test/node-all-email-filter.spec.js`
- `mail-vue/src/views/all-email/search-utils.js`
- `mail-worker/src/service/all-email-filter.js`

**Modify**

- `mail-vue/src/views/all-email/index.vue`
- `mail-vue/src/i18n/en.js`
- `mail-vue/src/i18n/zh.js`
- `mail-vue/src/i18n/zh-tw.js`
- `mail-worker/src/service/email-service.js`

---

### Task 1: Add Search Mapping Helpers With Failing Tests

**Files:**
- Create: `mail-worker/vitest.node.config.js`
- Create: `mail-worker/test/node-all-email-filter.spec.js`
- Create: `mail-vue/src/views/all-email/search-utils.js`
- Create: `mail-worker/src/service/all-email-filter.js`

- [ ] **Step 1: Write the failing tests**

```js
import { describe, expect, test } from 'vitest';
import { applyAllEmailSearchType } from '../../mail-vue/src/views/all-email/search-utils.js';
import { buildContentLikePattern } from '../src/service/all-email-filter.js';

describe('all-email content filter helpers', () => {
	test('maps content search type to params.content', () => {
		const params = {
			userEmail: 'u',
			accountEmail: 'a',
			name: 'n',
			subject: 's',
			content: null,
		};

		applyAllEmailSearchType(params, 'content', 'hello');

		expect(params.userEmail).toBeNull();
		expect(params.accountEmail).toBeNull();
		expect(params.name).toBeNull();
		expect(params.subject).toBeNull();
		expect(params.content).toBe('hello');
	});

	test('builds contains-like pattern for content search', () => {
		expect(buildContentLikePattern('hello')).toBe('%hello%');
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run -c vitest.node.config.js test/node-all-email-filter.spec.js`

Expected: FAIL because the helper files do not exist yet.

- [ ] **Step 3: Write minimal implementation**

```js
// mail-vue/src/views/all-email/search-utils.js
export function applyAllEmailSearchType(params, searchType, searchValue) {
	params.userEmail = null;
	params.accountEmail = null;
	params.name = null;
	params.subject = null;
	params.content = null;

	if (searchType === 'user') params.userEmail = searchValue;
	if (searchType === 'account') params.accountEmail = searchValue;
	if (searchType === 'name') params.name = searchValue;
	if (searchType === 'subject') params.subject = searchValue;
	if (searchType === 'content') params.content = searchValue;
}
```

```js
// mail-worker/src/service/all-email-filter.js
export function buildContentLikePattern(value) {
	return `%${value}%`;
}
```

```js
// mail-worker/vitest.node.config.js
import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		environment: 'node',
		include: ['test/node-*.spec.js'],
	},
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run -c vitest.node.config.js test/node-all-email-filter.spec.js`

Expected: PASS

---

### Task 2: Wire Frontend Content Search Type

**Files:**
- Modify: `mail-vue/src/views/all-email/index.vue`
- Modify: `mail-vue/src/i18n/en.js`
- Modify: `mail-vue/src/i18n/zh.js`
- Modify: `mail-vue/src/i18n/zh-tw.js`

- [ ] **Step 1: Update the search selector**

Add the new option:

```vue
<el-option key="5" :label="$t('content')" :value="'content'"/>
```

- [ ] **Step 2: Extend params state**

Add:

```js
content: null,
```

to the `params` reactive object.

- [ ] **Step 3: Reuse helper in search/reset logic**

Import and use:

```js
import { applyAllEmailSearchType } from './search-utils.js';
```

Replace manual branching in `search()` with:

```js
applyAllEmailSearchType(params, params.searchType, searchValue.value);
sysEmailScroll.value.refreshList();
```

Also clear `params.content` in `refreshBefore()`.

- [ ] **Step 4: Update selected-title logic**

Add:

```js
if (params.searchType === 'content') return t('content');
```

- [ ] **Step 5: Add i18n strings**

Add `content` to:

- `mail-vue/src/i18n/en.js`
- `mail-vue/src/i18n/zh.js`
- `mail-vue/src/i18n/zh-tw.js`

Suggested values:

```js
// en
content: 'Content'

// zh
content: '内容'

// zh-tw
content: '內容'
```

---

### Task 3: Add Backend Content Filter Condition

**Files:**
- Modify: `mail-worker/src/service/email-service.js`
- Create: `mail-worker/src/service/all-email-filter.js`

- [ ] **Step 1: Accept the new query param**

Change:

```js
let { emailId, size, name, subject, accountEmail, userEmail, type, timeSort } = params;
```

to:

```js
let { emailId, size, name, subject, content, accountEmail, userEmail, type, timeSort } = params;
```

- [ ] **Step 2: Add contains condition**

Import:

```js
import { buildContentLikePattern } from './all-email-filter';
```

Then append:

```js
if (content) {
	conditions.push(sql`${email.text} COLLATE NOCASE LIKE ${buildContentLikePattern(content)}`);
}
```

- [ ] **Step 3: Run targeted helper tests**

Run: `pnpm exec vitest run -c vitest.node.config.js test/node-all-email-filter.spec.js`

Expected: PASS

---

### Task 4: Verify Feature End-to-End

**Files:**
- Modify: none unless verification finds issues

- [ ] **Step 1: Run targeted helper tests**

Run: `cd mail-worker && pnpm exec vitest run -c vitest.node.config.js test/node-all-email-filter.spec.js`

Expected: PASS

- [ ] **Step 2: Run existing Telegram node-side tests to guard recent work**

Run: `cd mail-worker && pnpm exec vitest run -c vitest.telegram.config.js test/telegram-message.spec.js test/telegram-detail.spec.js`

Expected: PASS

- [ ] **Step 3: Run frontend build**

Run: `cd mail-vue && pnpm build`

Expected: PASS

- [ ] **Step 4: Run worker dry-run build**

Run: `cd mail-worker && pnpm exec wrangler deploy --dry-run`

Expected: PASS

---

## Self-Review

- Spec coverage: frontend search type, backend `content` param, `email.text` contains match, i18n, and verification are all covered.
- Placeholder scan: no `TODO` or unspecified commands.
- Type consistency: uses `content` consistently in frontend params, request params, and backend destructuring.
