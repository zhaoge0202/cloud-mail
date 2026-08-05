import { describe, expect, test, vi } from 'vitest';
import init from '../src/init/init.js';

describe('用户 API Token 索引初始化', () => {
	test('初始化流程会创建 api_token 部分唯一索引', async () => {
		const migration = Object.entries(init).find(([, action]) => (
			typeof action === 'function' && action.toString().includes('idx_user_api_token')
		));

		expect(migration, '缺少 idx_user_api_token 初始化迁移').toBeDefined();
		const [migrationName, migrationAction] = migration;
		expect(init.init.toString()).toContain(`this.${migrationName}(c)`);

		const run = vi.fn().mockResolvedValue(undefined);
		const prepare = vi.fn(() => ({ run }));
		await migrationAction.call(init, { env: { db: { prepare } } });

		const sql = prepare.mock.calls
			.map(([statement]) => statement.replace(/\s+/g, ' ').trim())
			.find(statement => statement.includes('idx_user_api_token'));
		expect(sql).toBe(
			'CREATE UNIQUE INDEX IF NOT EXISTS idx_user_api_token '
			+ 'ON user(api_token) WHERE api_token IS NOT NULL;',
		);
		expect(run).toHaveBeenCalledTimes(1);
	});
});
