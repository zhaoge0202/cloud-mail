import BizError from '../error/biz-error';
import verifyUtils from '../utils/verify-utils';
import emailUtils from '../utils/email-utils';
import userService from './user-service';
import emailService from './email-service';
import orm from '../entity/orm';
import account from '../entity/account';
import user from '../entity/user';
import { and, asc, eq, gt, inArray, count, sql } from 'drizzle-orm';
import { isDel, settingConst } from '../const/entity-const';
import settingService from './setting-service';
import turnstileService from './turnstile-service';
import roleService from './role-service';
import { t } from '../i18n/i18n';
import verifyRecordService from './verify-record-service';
import adminUtils from '../utils/admin-utils';

const accountService = {

	async add(c, params, userId) {

		const {addEmailVerify , addEmail, manyEmail, addVerifyCount} = await settingService.query(c);

		let { email, token } = params;


		if (!(addEmail === settingConst.addEmail.OPEN && manyEmail === settingConst.manyEmail.OPEN)) {
			throw new BizError(t('addAccountDisabled'));
		}


		if (!email) {
			throw new BizError(t('emptyEmail'));
		}

		if (!verifyUtils.isEmail(email)) {
			throw new BizError(t('notEmail'));
		}

		if (!c.env.domain.includes(emailUtils.getDomain(email))) {
			throw new BizError(t('notExistDomain'));
		}


		let accountRow = await this.selectByEmailIncludeDel(c, email);

		if (accountRow && accountRow.isDel === isDel.DELETE) {
			// 只允许原用户恢复自己删除的邮箱
			if (accountRow.userId === userId) {
				await this.restoreByEmail(c, email);
				accountRow.isDel = isDel.NORMAL;
				return accountRow;
			} else {
				// 如果是其他用户删除的邮箱，仍然提示已被注销
				throw new BizError(t('isDelAccount'));
			}
		}

		if (accountRow) {
			throw new BizError(t('isRegAccount'));
		}

		const userRow = await userService.selectById(c, userId);
		const roleRow = await roleService.selectById(c, userRow.type);

		if (!adminUtils.isAdmin(c, userRow.email)) {

			if (roleRow.accountCount > 0) {
				const userAccountCount = await accountService.countUserAccount(c, userId)
				if(userAccountCount >= roleRow.accountCount) throw new BizError(t('accountLimit'), 403);
			}

			if(!roleService.hasAvailDomainPerm(roleRow.availDomain, email)) {
				throw new BizError(t('noDomainPermAdd'),403)
			}

		}

		let addVerifyOpen = false

		if (addEmailVerify === settingConst.addEmailVerify.OPEN) {
			addVerifyOpen = true
			await turnstileService.verify(c, token);
		}

		if (addEmailVerify === settingConst.addEmailVerify.COUNT) {
			addVerifyOpen = await verifyRecordService.isOpenAddVerify(c, addVerifyCount);
			if (addVerifyOpen) {
				await turnstileService.verify(c,token)
			}
		}


		accountRow = await orm(c).insert(account).values({ email: email, userId: userId, name: emailUtils.getName(email) }).returning().get();

		if (addEmailVerify === settingConst.addEmailVerify.COUNT && !addVerifyOpen) {
			const row = await verifyRecordService.increaseAddCount(c);
			addVerifyOpen = row.count >= addVerifyCount
		}

		accountRow.addVerifyOpen = addVerifyOpen
		return accountRow;
	},

	selectByEmailIncludeDel(c, email) {
		return orm(c).select().from(account).where(sql`${account.email} COLLATE NOCASE = ${email}`).get();
	},

	list(c, params, userId) {

		let { accountId, size } = params;

		accountId = Number(accountId);
		size = Number(size);
		if (!size || Number.isNaN(size) || size < 1) {
			size = 30;
		}

		if (size > 30) {
			size = 30;
		}

		if (!accountId) {
			accountId = 0;
		}
		return orm(c).select().from(account).where(
			and(
				eq(account.userId, userId),
				eq(account.isDel, isDel.NORMAL),
				gt(account.accountId, accountId)))
			.orderBy(asc(account.accountId))
			.limit(size)
			.all();
	},

	async delete(c, params, userId) {

		let { accountId } = params;

		const user = await userService.selectById(c, userId);
		const accountRow = await this.selectById(c, accountId);

		if (accountRow.email === user.email) {
			throw new BizError(t('delMyAccount'));
		}

		if (accountRow.userId !== user.userId) {
			throw new BizError(t('noUserAccount'));
		}

		await orm(c).update(account).set({ isDel: isDel.DELETE }).where(
			and(eq(account.userId, userId),
				eq(account.accountId, accountId)))
			.run();
	},

	async deleteByApi(c, params, userRow) {
		const accountId = Number(params.accountId);

		if (!accountId) {
			throw new BizError(t('emptyAccountId'));
		}

		const accountRow = await this.selectById(c, accountId);

		if (!accountRow) {
			throw new BizError(t('accountNotExist'));
		}

		if (accountRow.userId !== userRow.userId) {
			throw new BizError(t('noPermission'), 403);
		}

		if (accountRow.email === userRow.email) {
			throw new BizError(t('delMyAccount'));
		}

		await orm(c).update(account).set({ isDel: isDel.DELETE }).where(
			and(
				eq(account.userId, userRow.userId),
				eq(account.accountId, accountId)
			)
		).run();
	},

	selectById(c, accountId) {
		return orm(c).select().from(account).where(
			and(eq(account.accountId, accountId),
				eq(account.isDel, isDel.NORMAL)))
			.get();
	},

	selectByIdIncludeDel(c, accountId) {
		return orm(c).select().from(account).where(eq(account.accountId, accountId)).get();
	},

	async insert(c, params) {
		await orm(c).insert(account).values({ ...params }).returning();
	},

	async insertList(c, list) {
		await orm(c).insert(account).values(list).run();
	},

	async physicsDeleteByUserIds(c, userIds) {
		await emailService.physicsDeleteUserIds(c, userIds);
		await orm(c).delete(account).where(inArray(account.userId,userIds)).run();
	},


	async countUserAccount(c, userId) {
		const { num } = await orm(c).select({num: count()}).from(account).where(and(eq(account.userId, userId),eq(account.isDel, isDel.NORMAL))).get();
		return num;
	},

	async restoreByEmail(c, email) {
		await orm(c).update(account).set({isDel: isDel.NORMAL}).where(eq(account.email, email)).run();
	},

	async restoreByUserId(c, userId) {
		await orm(c).update(account).set({isDel: isDel.NORMAL}).where(eq(account.userId, userId)).run();
	},

	async addByAdmin(c, params) {
		const { userId, email } = params;
		const targetUserId = Number(userId);

		const userRow = await userService.selectById(c, targetUserId);

		if (!userRow) {
			throw new BizError(t('notExistUser'));
		}

		const roleRow = await roleService.selectById(c, userRow.type);

		if (!roleRow) {
			throw new BizError(t('roleNotExist'));
		}

		return this.addForUser(c, { email }, userRow, roleRow, { deletedAccountMessage: 'isDelAccount' });
	},

	async addByApi(c, params, userRow, roleRow) {
		return this.addForUser(c, params, userRow, roleRow, { checkApiLimit: true });
	},

	async addForUser(c, params, userRow, roleRow, options = {}) {
		const { email } = params;

		if (!email) {
			throw new BizError(t('emptyEmail'));
		}

		if (!verifyUtils.isEmail(email)) {
			throw new BizError(t('notEmail'));
		}

		const { addEmail, manyEmail } = await settingService.query(c);

		if (!(addEmail === settingConst.addEmail.OPEN && manyEmail === settingConst.manyEmail.OPEN)) {
			throw new BizError(t('addAccountDisabled'));
		}

		if (!c.env.domain.includes(emailUtils.getDomain(email))) {
			throw new BizError(t('notExistDomain'));
		}

		const existingAccount = await this.selectByEmailIncludeDel(c, email);

		if (existingAccount) {
			if (existingAccount.isDel === isDel.DELETE && options.deletedAccountMessage) {
				throw new BizError(t(options.deletedAccountMessage));
			}
			throw new BizError(t('isRegAccount'));
		}

		const isAdmin = adminUtils.isAdmin(c, userRow.email);

		if (!roleRow && !isAdmin) {
			throw new BizError(t('roleNotExist'));
		}

		if (!isAdmin) {
			if (roleRow.accountCount > 0) {
				const userAccountCount = await this.countUserAccount(c, userRow.userId);
				if (userAccountCount >= roleRow.accountCount) {
					throw new BizError(t('accountLimit'), 403);
				}
			}

			if (!roleService.hasAvailDomainPerm(roleRow.availDomain, email)) {
				throw new BizError(t('noDomainPermAdd'), 403);
			}

			if (options.checkApiLimit) {
				await this.checkAndUpdateApiAddAccountLimit(c, userRow, roleRow);
			}
		}

		return orm(c).insert(account).values({
			email,
			userId: userRow.userId,
			name: emailUtils.getName(email)
		}).returning().get();
	},

	async checkAndUpdateApiAddAccountLimit(c, userRow, roleRow) {
		if (roleRow.apiAddAccountType === 'ban' || !roleRow.apiAddAccountCount) {
			return;
		}

		const today = new Date().toISOString().split('T')[0];
		const isNewDay = roleRow.apiAddAccountType === 'day' && userRow.apiAddResetTime !== today;
		const currentCount = isNewDay ? 0 : Number(userRow.apiAddCount || 0);

		if (currentCount >= roleRow.apiAddAccountCount) {
			console.log(`[API Add Account Limit] User: ${userRow.email}, Type: ${roleRow.apiAddAccountType}, Count: ${currentCount}/${roleRow.apiAddAccountCount}`);
			if (roleRow.apiAddAccountType === 'day') {
				throw new BizError(t('apiAddAccountDayLimit'), 403);
			}
			if (roleRow.apiAddAccountType === 'count') {
				throw new BizError(t('apiAddAccountTotalLimit'), 403);
			}
		}

		const nextCount = currentCount + 1;
		const updateValues = { apiAddCount: nextCount };
		if (roleRow.apiAddAccountType === 'day') {
			updateValues.apiAddResetTime = today;
		}

		await orm(c).update(user).set(updateValues).where(eq(user.userId, userRow.userId)).run();
		userRow.apiAddCount = nextCount;
		if (updateValues.apiAddResetTime) {
			userRow.apiAddResetTime = updateValues.apiAddResetTime;
		}
	},

	async deleteByAdmin(c, params) {

		const targetUserId = Number(params && params.userId);
		const targetAccountId = Number(params && params.accountId);

		if (!targetUserId || !targetAccountId) {
			return;
		}

		const userRow = await userService.selectById(c, targetUserId);

		if (!userRow) {
			throw new BizError(t('notExistUser'));
		}

		const accountRow = await this.selectByIdIncludeDel(c, targetAccountId);

		if (!accountRow) {
			return;
		}

		if (accountRow.userId !== targetUserId) {
			throw new BizError(t('noUserAccount'));
		}

		if (accountRow.isDel === isDel.DELETE) {
			return;
		}

		if (accountRow.email === userRow.email) {
			throw new BizError(t('delMyAccount'));
		}

		await orm(c)
			.update(account)
			.set({ isDel: isDel.DELETE })
			.where(eq(account.accountId, targetAccountId))
			.run();
	},

	async setName(c, params, userId) {
		const { name, accountId } = params;

		if (name.length > 30) {
			throw new BizError(t('usernameLengthLimit'));
		}

		await orm(c)
			.update(account)
			.set({ name })
			.where(and(eq(account.userId, userId), eq(account.accountId, accountId)))
			.run();
	}
};

export default accountService;
