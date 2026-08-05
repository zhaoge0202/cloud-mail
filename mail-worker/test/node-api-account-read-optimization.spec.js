import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('../src/entity/orm.js', () => ({
	default: vi.fn(),
}));

vi.mock('../src/service/user-service.js', () => ({
	default: {
		selectById: vi.fn(),
	},
}));

vi.mock('../src/service/role-service.js', () => ({
	default: {
		selectById: vi.fn(),
		hasAvailDomainPerm: vi.fn(() => true),
	},
}));

vi.mock('../src/service/setting-service.js', () => ({
	default: {
		query: vi.fn(),
	},
}));

import orm from '../src/entity/orm.js';
import accountService from '../src/service/account-service.js';
import roleService from '../src/service/role-service.js';
import settingService from '../src/service/setting-service.js';
import userService from '../src/service/user-service.js';

describe('用户 API 创建邮箱读取优化', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		vi.clearAllMocks();
		vi.useRealTimers();
	});

	test('addByApi 复用 user/role，账户存在性只读取一次', async () => {
		const c = {
			env: {
				admin: 'admin@example.com',
				domain: ['example.com'],
			},
		};
		const userRow = {
			userId: 7,
			email: 'owner@example.com',
			type: 2,
			apiAddCount: 0,
		};
		const roleRow = {
			roleId: 2,
			accountCount: 5,
			availDomain: 'example.com',
			apiAddAccountType: 'count',
			apiAddAccountCount: 10,
		};
		const createdAccount = {
			accountId: 11,
			email: 'new@example.com',
			userId: 7,
		};

		settingService.query.mockResolvedValue({ addEmail: 0, manyEmail: 0 });
		const selectByEmail = vi
			.spyOn(accountService, 'selectByEmailIncludeDel')
			.mockResolvedValue(null);
		const countUserAccount = vi
			.spyOn(accountService, 'countUserAccount')
			.mockResolvedValue(1);
		const checkLimit = vi
			.spyOn(accountService, 'checkAndUpdateApiAddAccountLimit')
			.mockResolvedValue(undefined);
		const get = vi.fn().mockResolvedValue(createdAccount);
		const returning = vi.fn(() => ({ get }));
		const values = vi.fn(() => ({ returning }));
		const insert = vi.fn(() => ({ values }));
		orm.mockReturnValue({ insert });

		const result = await accountService.addByApi(
			c,
			{ email: 'new@example.com' },
			userRow,
			roleRow,
		);

		expect(result).toEqual(createdAccount);
		expect(settingService.query).toHaveBeenCalledTimes(1);
		expect(selectByEmail).toHaveBeenCalledTimes(1);
		expect(countUserAccount).toHaveBeenCalledTimes(1);
		expect(userService.selectById).not.toHaveBeenCalled();
		expect(roleService.selectById).not.toHaveBeenCalled();
		expect(checkLimit).toHaveBeenCalledWith(c, userRow, roleRow);
		expect(orm).toHaveBeenCalledTimes(1);
		expect(insert).toHaveBeenCalledTimes(1);
	});

	test('日限额跨日重置和计数合并为一次 UPDATE', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-08-05T08:00:00.000Z'));
		const c = { env: { admin: 'admin@example.com' } };
		const userRow = {
			userId: 7,
			email: 'owner@example.com',
			apiAddCount: 9,
			apiAddResetTime: '2026-08-04',
		};
		const roleRow = {
			apiAddAccountType: 'day',
			apiAddAccountCount: 3,
		};
		const run = vi.fn().mockResolvedValue(undefined);
		const where = vi.fn(() => ({ run }));
		const set = vi.fn(() => ({ where }));
		const update = vi.fn(() => ({ set }));
		orm.mockReturnValue({ update });

		await accountService.checkAndUpdateApiAddAccountLimit(c, userRow, roleRow);

		expect(userService.selectById).not.toHaveBeenCalled();
		expect(roleService.selectById).not.toHaveBeenCalled();
		expect(orm).toHaveBeenCalledTimes(1);
		expect(update).toHaveBeenCalledTimes(1);
		expect(set).toHaveBeenCalledWith({
			apiAddCount: 1,
			apiAddResetTime: '2026-08-05',
		});
		expect(run).toHaveBeenCalledTimes(1);
	});

	test('deleteByApi 账户只读取一次且复用鉴权用户', async () => {
		const c = { env: { admin: 'admin@example.com' } };
		const userRow = {
			userId: 7,
			email: 'owner@example.com',
		};
		const accountRow = {
			accountId: 11,
			email: 'alias@example.com',
			userId: 7,
		};
		const selectById = vi
			.spyOn(accountService, 'selectById')
			.mockResolvedValue(accountRow);
		const run = vi.fn().mockResolvedValue(undefined);
		const where = vi.fn(() => ({ run }));
		const set = vi.fn(() => ({ where }));
		const update = vi.fn(() => ({ set }));
		orm.mockReturnValue({ update });

		await accountService.deleteByApi(c, { accountId: '11' }, userRow);

		expect(selectById).toHaveBeenCalledTimes(1);
		expect(selectById).toHaveBeenCalledWith(c, 11);
		expect(userService.selectById).not.toHaveBeenCalled();
		expect(orm).toHaveBeenCalledTimes(1);
		expect(update).toHaveBeenCalledTimes(1);
		expect(run).toHaveBeenCalledTimes(1);
	});
});
