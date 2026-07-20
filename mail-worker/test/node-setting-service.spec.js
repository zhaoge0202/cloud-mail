import { describe, expect, test } from 'vitest';
import { pickSettingUpdateParams } from '../src/service/setting-service.js';

describe('setting update params', () => {
	test('keeps only persisted setting fields', () => {
		const params = {
			register: 1,
			title: 'Cloud Mail',
			regKey: 0,
			domainList: ['@example.com'],
			regVerifyOpen: true,
			addVerifyOpen: true,
			hasR2: true,
		};

		expect(pickSettingUpdateParams(params)).toEqual({
			register: 1,
			title: 'Cloud Mail',
			regKey: 0,
		});
	});
});
