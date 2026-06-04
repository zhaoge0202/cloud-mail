import { describe, expect, test } from 'vitest';
import { applyReceiveDefaults, resolveUnreadValue } from '../src/service/email-unread.js';
import { shouldAutoMarkRead, markEmailListReadLocally, markAllEmailListReadLocally } from '../../mail-vue/src/components/email-scroll/unread-utils.js';

describe('email unread helpers', () => {
	test('marks received emails unread by default', () => {
		expect(resolveUnreadValue(0, 0, 1)).toBe(0);
		expect(resolveUnreadValue(1, 0, 1)).toBe(1);
	});

	test('defaults missing receive type to unread receive email', () => {
		const params = { subject: 'hello' };
		applyReceiveDefaults(params, 0, 1);
		expect(params.type).toBe(0);
		expect(params.unread).toBe(0);
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

	test('marks all loaded list items read locally', () => {
		const list = [{ emailId: 1, unread: 0, checked: true }, { emailId: 2, unread: 0, checked: false }];
		markAllEmailListReadLocally(list, 1);
		expect(list[0].unread).toBe(1);
		expect(list[0].checked).toBe(false);
		expect(list[1].unread).toBe(1);
		expect(list[1].checked).toBe(false);
	});
});
