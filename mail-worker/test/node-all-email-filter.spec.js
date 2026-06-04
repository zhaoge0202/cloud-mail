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
