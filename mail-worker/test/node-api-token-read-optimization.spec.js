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
	},
}));

vi.mock('../src/utils/admin-utils.js', () => ({
	default: {
		isAdmin: vi.fn(() => false),
	},
}));

import orm from '../src/entity/orm.js';
import roleService from '../src/service/role-service.js';
import userService from '../src/service/user-service.js';
import apiTokenService from '../src/service/api-token-service.js';

const userRow = {
	userId: 7,
	email: 'api@example.com',
	type: 2,
	status: 0,
	isDel: 0,
	apiToken: 'token-7',
	apiAddCount: 1,
	apiAddResetTime: '2026-08-05',
};

const roleRow = {
	roleId: 2,
	name: 'API 用户',
	enableApi: 1,
	apiAddAccountType: 'count',
	apiAddAccountCount: 10,
};

describe('用户 API Token 读取优化', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	test('verifyToken 只执行一次 JOIN 查询并返回完整用户和角色', async () => {
		const get = vi.fn().mockResolvedValue({ user: userRow, role: roleRow });
		const where = vi.fn(() => ({ get }));
		const leftJoin = vi.fn(() => ({ where }));
		const from = vi.fn(() => ({ leftJoin, where }));
		const select = vi.fn(() => ({ from }));
		orm.mockReturnValue({ select });

		const result = await apiTokenService.verifyToken(
			{ env: { admin: 'admin@example.com' } },
			'token-7',
		);

		expect(result).toEqual({ user: userRow, role: roleRow });
		expect(orm).toHaveBeenCalledTimes(1);
		expect(select).toHaveBeenCalledTimes(1);
		expect(get).toHaveBeenCalledTimes(1);
		expect(userService.selectById).not.toHaveBeenCalled();
		expect(roleService.selectById).not.toHaveBeenCalled();
	});

	test('verifyToken 对已封禁用户立即返回 null', async () => {
		const bannedUser = { ...userRow, status: 1 };
		const get = vi.fn().mockResolvedValue({ user: bannedUser, role: roleRow });
		const where = vi.fn(() => ({ get }));
		const leftJoin = vi.fn(() => ({ where }));
		const from = vi.fn(() => ({ leftJoin }));
		const select = vi.fn(() => ({ from }));
		orm.mockReturnValue({ select });

		const result = await apiTokenService.verifyToken(
			{ env: { admin: 'admin@example.com' } },
			'token-7',
		);

		expect(result).toBeNull();
		expect(orm).toHaveBeenCalledTimes(1);
		expect(get).toHaveBeenCalledTimes(1);
		expect(userService.selectById).not.toHaveBeenCalled();
		expect(roleService.selectById).not.toHaveBeenCalled();
	});

	test('getApiStatus 复用传入上下文，不再读取 user 和 role', async () => {
		const result = await apiTokenService.getApiStatus(
			{ env: { admin: 'admin@example.com' } },
			userRow,
			roleRow,
		);

		expect(result).toMatchObject({
			hasToken: true,
			apiEnabled: true,
			addAccountLimit: 10,
			addAccountUsed: 1,
			addAccountRemaining: 9,
		});
		expect(userService.selectById).not.toHaveBeenCalled();
		expect(roleService.selectById).not.toHaveBeenCalled();
		expect(orm).not.toHaveBeenCalled();
	});

});
