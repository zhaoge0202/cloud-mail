import BizError from '../error/biz-error';
import { t } from '../i18n/i18n';
import userService from './user-service';
import roleService from './role-service';
import adminUtils from '../utils/admin-utils';
import cryptoUtils from '../utils/crypto-utils';
import { isDel } from '../const/entity-const';
import { v4 as uuidv4 } from 'uuid';
import orm from '../entity/orm';
import user from '../entity/user';
import { eq } from 'drizzle-orm';

const apiTokenService = {
	/**
	 * 生成用户API Token
	 * @param {Object} c - Hono context
	 * @param {Object} params - { email, password }
	 * @returns {Object} { token, userId }
	 */
	async generateToken(c, params) {
		const { email, password } = params;

		if (!email || !password) {
			throw new BizError(t('emailAndPwdEmpty'));
		}

		// 验证用户
		const userRow = await userService.selectByEmailIncludeDel(c, email);

		if (!userRow || userRow.isDel === isDel.DELETE) {
			throw new BizError(t('notExistUser'));
		}

		if (!await cryptoUtils.verifyPassword(password, userRow.salt, userRow.password)) {
			throw new BizError(t('IncorrectPwd'));
		}

		// 检查用户角色的API权限
		const roleRow = await roleService.selectById(c, userRow.type);

		if (!roleRow) {
			throw new BizError(t('roleNotExist'));
		}

		// 非管理员需要检查API权限
		if (!adminUtils.isAdmin(c, userRow.email) && roleRow.enableApi !== 1) {
			console.log(`[API Permission Denied] User: ${userRow.email}, Role: ${roleRow.name}, EnableApi: ${roleRow.enableApi}`);
			throw new BizError(t('apiPermissionDenied'), 403);
		}

		// 【优化】检查用户是否已有 API Token，直接返回，不查询 KV
		if (userRow.apiToken) {
			return { 
				token: userRow.apiToken,
				userId: userRow.userId
			};
		}

		// 首次生成：创建新的 API Token
		const apiToken = uuidv4();

		// 只保存到数据库，不写入 KV
		await orm(c)
			.update(user)
			.set({ apiToken })
			.where(eq(user.userId, userRow.userId))
			.run();

		return { 
			token: apiToken,
			userId: userRow.userId
		};
	},

	/**
	 * 验证API Token
	 * 【优化】直接查询数据库，不使用 KV，减少 KV 读取次数
	 * @param {Object} c - Hono context
	 * @param {string} token - API Token
	 * @returns {Object|null} { userId, email } or null
	 */
	async verifyToken(c, token) {
		if (!token) {
			return null;
		}

		try {
			// 直接从数据库查询，不查 KV
			const userRow = await orm(c)
				.select()
				.from(user)
				.where(eq(user.apiToken, token))
				.get();

			if (!userRow || userRow.isDel === isDel.DELETE || !userRow.apiToken) {
				return null;
			}

			// 检查用户角色的API权限
			const roleRow = await roleService.selectById(c, userRow.type);

			// 非管理员需要检查API权限
			if (!adminUtils.isAdmin(c, userRow.email) && (!roleRow || roleRow.enableApi !== 1)) {
				console.log(`[API Token Verify Failed] User: ${userRow.email}, Role: ${roleRow?.name || 'N/A'}, EnableApi: ${roleRow?.enableApi || 'N/A'}`);
				return null;
			}

			return {
				userId: userRow.userId,
				email: userRow.email
			};
		} catch (error) {
			console.error('API Token verification error:', error);
			return null;
		}
	},

	/**
	 * 撤销用户的API Token
	 * 【优化】只操作数据库，不操作 KV
	 * @param {Object} c - Hono context
	 * @param {number} userId - 用户ID
	 */
	async revokeToken(c, userId) {
		// 直接从数据库中清除，不操作 KV
		await orm(c)
			.update(user)
			.set({ apiToken: null })
			.where(eq(user.userId, userId))
			.run();
	},

	/**
	 * 通过邮箱和密码撤销Token
	 * @param {Object} c - Hono context
	 * @param {Object} params - { email, password }
	 */
	async revokeTokenByCredentials(c, params) {
		const { email, password } = params;

		if (!email || !password) {
			throw new BizError(t('emailAndPwdEmpty'));
		}

		// 验证用户
		const userRow = await userService.selectByEmailIncludeDel(c, email);

		if (!userRow || userRow.isDel === isDel.DELETE) {
			throw new BizError(t('notExistUser'));
		}

		if (!await cryptoUtils.verifyPassword(password, userRow.salt, userRow.password)) {
			throw new BizError(t('IncorrectPwd'));
		}

		// 撤销Token
		await this.revokeToken(c, userRow.userId);
	},

	/**
	 * 检查并更新API创建邮箱次数限制
	 * @param {Object} c - Hono context
	 * @param {number} userId - 用户ID
	 * @throws {BizError} 如果超过限制
	 */
	async checkAndUpdateApiAddAccountLimit(c, userId) {
		// 获取用户信息
		const userRow = await userService.selectById(c, userId);

		if (!userRow) {
			throw new BizError(t('notExistUser'));
		}

		// 管理员不受限制
		if (adminUtils.isAdmin(c, userRow.email)) {
			return;
		}

		// 获取角色配置
		const roleRow = await roleService.selectById(c, userRow.type);

		if (!roleRow) {
			throw new BizError(t('roleNotExist'));
		}

		// 如果是ban类型或没有设置限制,不限制
		if (roleRow.apiAddAccountType === 'ban' || !roleRow.apiAddAccountCount) {
			return;
		}

		const now = new Date();
		const today = now.toISOString().split('T')[0]; // YYYY-MM-DD

		// 检查是否需要重置计数(day类型)
		if (roleRow.apiAddAccountType === 'day') {
			const resetTime = userRow.apiAddResetTime;

			// 如果是新的一天,重置计数
			if (!resetTime || resetTime !== today) {
				await orm(c)
					.update(user)
					.set({
						apiAddCount: 0,
						apiAddResetTime: today
					})
					.where(eq(user.userId, userId))
					.run();

				// 更新内存中的值
				userRow.apiAddCount = 0;
				userRow.apiAddResetTime = today;
			}
		}

		// 检查是否超过限制
		if (userRow.apiAddCount >= roleRow.apiAddAccountCount) {
			console.log(`[API Add Account Limit] User: ${userRow.email}, Type: ${roleRow.apiAddAccountType}, Count: ${userRow.apiAddCount}/${roleRow.apiAddAccountCount}`);
			if (roleRow.apiAddAccountType === 'day') {
				throw new BizError(t('apiAddAccountDayLimit'), 403);
			} else if (roleRow.apiAddAccountType === 'count') {
				throw new BizError(t('apiAddAccountTotalLimit'), 403);
			}
		}

		// 增加计数
		await orm(c)
			.update(user)
			.set({
				apiAddCount: userRow.apiAddCount + 1
			})
			.where(eq(user.userId, userId))
			.run();
	},

	/**
	 * 获取用户API使用情况
	 * @param {Object} c - Hono context
	 * @param {number} userId - 用户ID
	 * @returns {Object} API使用情况
	 */
	async getApiStatus(c, userId) {
		// 查询用户信息
		const userRow = await userService.selectById(c, userId);

		if (!userRow) {
			throw new BizError(t('notExistUser'));
		}

		// 查询角色信息
		const roleRow = await roleService.selectById(c, userRow.type);

		if (!roleRow) {
			throw new BizError(t('roleNotExist'));
		}

		// 检查是否是管理员
		const isAdmin = adminUtils.isAdmin(c, userRow.email);

		// 构建返回数据
		const status = {
			hasToken: !!userRow.apiToken,
			apiEnabled: isAdmin || roleRow.enableApi === 1,
			isAdmin: isAdmin,
			addAccountType: roleRow.apiAddAccountType || 'ban',
			addAccountLimit: roleRow.apiAddAccountCount || 0,
			addAccountUsed: userRow.apiAddCount || 0,
			addAccountResetTime: userRow.apiAddResetTime || null
		};

		// 如果是day类型,检查是否需要显示重置信息
		if (status.addAccountType === 'day' && status.addAccountResetTime) {
			const today = new Date().toISOString().split('T')[0];
			if (status.addAccountResetTime !== today) {
				// 已经是新的一天,但计数还没重置(等待下次API调用时重置)
				status.addAccountUsed = 0;
			}
		}

		// 计算剩余次数
		if (isAdmin || status.addAccountType === 'ban') {
			status.addAccountRemaining = -1; // -1表示无限制
		} else if (status.addAccountLimit > 0) {
			status.addAccountRemaining = Math.max(0, status.addAccountLimit - status.addAccountUsed);
		} else {
			status.addAccountRemaining = 0;
		}

		return status;
	}
};

export default apiTokenService;

