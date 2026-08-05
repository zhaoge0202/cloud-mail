import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('../src/service/api-token-service.js', () => ({
	default: {
		verifyToken: vi.fn(),
		getApiStatus: vi.fn(),
		checkAndUpdateApiAddAccountLimit: vi.fn(),
		generateToken: vi.fn(),
		revokeTokenByCredentials: vi.fn(),
	},
}));

vi.mock('../src/service/account-service.js', () => ({
	default: {
		addByApi: vi.fn(),
		deleteByApi: vi.fn(),
		addByAdmin: vi.fn(),
		selectByEmailIncludeDel: vi.fn(),
		countUserAccount: vi.fn(),
		selectById: vi.fn(),
		delete: vi.fn(),
		list: vi.fn(),
	},
}));

vi.mock('../src/service/user-service.js', () => ({
	default: {
		selectById: vi.fn(),
		updateUserInfo: vi.fn(),
	},
}));

vi.mock('../src/service/role-service.js', () => ({
	default: {
		selectById: vi.fn(),
		hasAvailDomainPerm: vi.fn(),
	},
}));

vi.mock('../src/service/setting-service.js', () => ({
	default: {
		query: vi.fn(),
	},
}));

vi.mock('../src/service/perm-service.js', () => ({
	default: {
		userPermKeys: vi.fn(),
	},
}));

vi.mock('../src/utils/jwt-utils.js', () => ({
	default: {
		verifyToken: vi.fn(),
	},
}));

vi.mock('../src/entity/orm.js', () => ({
	default: vi.fn(),
}));

async function loadApiApp() {
	await import('../src/security/security.js');
	await import('../src/api/api-user-api.js');
	return (await import('../src/hono/hono.js')).default;
}

async function apiRequest(app, path, init = {}) {
	const request = new Request(`http://example.com${path}`, {
		...init,
		headers: {
			Authorization: 'api-token',
			'Content-Type': 'application/json',
			...init.headers,
		},
	});
	return app.fetch(request, {
		admin: 'admin@example.com',
		domain: ['example.com'],
		orm_log: false,
	});
}

describe('用户 API 路由上下文复用', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
	});

	test('/user/api/status 复用鉴权得到的 user/role', async () => {
		const { default: apiTokenService } = await import('../src/service/api-token-service.js');
		const { default: roleService } = await import('../src/service/role-service.js');
		const { default: userService } = await import('../src/service/user-service.js');
		const userRow = { userId: 7, email: 'api@example.com', type: 2 };
		const roleRow = { roleId: 2, enableApi: 1 };
		const status = { hasToken: true, apiEnabled: true };
		apiTokenService.verifyToken.mockResolvedValue({ user: userRow, role: roleRow });
		apiTokenService.getApiStatus.mockResolvedValue(status);
		const app = await loadApiApp();

		const response = await apiRequest(app, '/user/api/status');

		expect(response.status).toBe(200);
		expect(apiTokenService.verifyToken).toHaveBeenCalledTimes(1);
		expect(apiTokenService.getApiStatus)
			.toHaveBeenCalledWith(expect.anything(), userRow, roleRow);
		expect(userService.selectById).not.toHaveBeenCalled();
		expect(roleService.selectById).not.toHaveBeenCalled();
	});

	test('/user/account/add 只调用一次 addByApi，不在路由重复读取', async () => {
		const { default: accountService } = await import('../src/service/account-service.js');
		const { default: apiTokenService } = await import('../src/service/api-token-service.js');
		const { default: roleService } = await import('../src/service/role-service.js');
		const { default: settingService } = await import('../src/service/setting-service.js');
		const { default: userService } = await import('../src/service/user-service.js');
		const userRow = { userId: 7, email: 'api@example.com', type: 2 };
		const roleRow = { roleId: 2, enableApi: 1 };
		const account = { accountId: 11, email: 'new@example.com', userId: 7 };
		apiTokenService.verifyToken.mockResolvedValue({ user: userRow, role: roleRow });
		accountService.addByApi.mockResolvedValue(account);
		const app = await loadApiApp();

		const response = await apiRequest(app, '/user/account/add', {
			method: 'POST',
			body: JSON.stringify({ email: 'new@example.com' }),
		});

		expect(response.status).toBe(200);
		expect(accountService.addByApi)
			.toHaveBeenCalledWith(expect.anything(), { email: 'new@example.com' }, userRow, roleRow);
		expect(accountService.addByApi).toHaveBeenCalledTimes(1);
		expect(accountService.addByAdmin).not.toHaveBeenCalled();
		expect(accountService.selectByEmailIncludeDel).not.toHaveBeenCalled();
		expect(accountService.countUserAccount).not.toHaveBeenCalled();
		expect(settingService.query).not.toHaveBeenCalled();
		expect(userService.selectById).not.toHaveBeenCalled();
		expect(roleService.selectById).not.toHaveBeenCalled();
		expect(apiTokenService.checkAndUpdateApiAddAccountLimit).not.toHaveBeenCalled();
	});

	test('/user/account/delete 只调用一次 deleteByApi，不在路由重复读取', async () => {
		const { default: accountService } = await import('../src/service/account-service.js');
		const { default: apiTokenService } = await import('../src/service/api-token-service.js');
		const { default: userService } = await import('../src/service/user-service.js');
		const userRow = { userId: 7, email: 'api@example.com', type: 2 };
		const roleRow = { roleId: 2, enableApi: 1 };
		apiTokenService.verifyToken.mockResolvedValue({ user: userRow, role: roleRow });
		accountService.deleteByApi.mockResolvedValue(undefined);
		const app = await loadApiApp();

		const response = await apiRequest(app, '/user/account/delete?accountId=11', {
			method: 'DELETE',
		});

		expect(response.status).toBe(200);
		expect(accountService.deleteByApi)
			.toHaveBeenCalledWith(expect.anything(), { accountId: '11' }, userRow);
		expect(accountService.deleteByApi).toHaveBeenCalledTimes(1);
		expect(accountService.selectById).not.toHaveBeenCalled();
		expect(accountService.delete).not.toHaveBeenCalled();
		expect(userService.selectById).not.toHaveBeenCalled();
	});
});
