import BizError from '../error/biz-error';
import orm from '../entity/orm';
import { v4 as uuidv4 } from 'uuid';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import saltHashUtils from '../utils/crypto-utils';
import cryptoUtils from '../utils/crypto-utils';
import emailUtils from '../utils/email-utils';
import roleService from './role-service';
import verifyUtils from '../utils/verify-utils';
import { t } from '../i18n/i18n';
import reqUtils from '../utils/req-utils';
import dayjs from 'dayjs';
import { isDel, roleConst, settingConst } from '../const/entity-const';
import email from '../entity/email';
import userService from './user-service';
import KvConst from '../const/kv-const';
import adminUtils from '../utils/admin-utils';
import accountService from './account-service';
import settingService from './setting-service';

const publicService = {

	async emailList(c, params) {

		let { toEmail, content, subject, sendName, sendEmail, timeSort, num, size, type , isDel } = params

		const query = orm(c).select({
				emailId: email.emailId,
				sendEmail: email.sendEmail,
				sendName: email.name,
				subject: email.subject,
				toEmail: email.toEmail,
				toName: email.toName,
				type: email.type,
				createTime: email.createTime,
				content: email.content,
				text: email.text,
				isDel: email.isDel,
		}).from(email)

		if (!size) {
			size = 20
		}

		if (!num) {
			num = 1
		}

		size = Number(size);
		num = Number(num);

		num = (num - 1) * size;

		let conditions = []

		if (toEmail) {
			conditions.push(sql`${email.toEmail} COLLATE NOCASE LIKE ${toEmail}`)
		}

		if (sendEmail) {
			conditions.push(sql`${email.sendEmail} COLLATE NOCASE LIKE ${sendEmail}`)
		}

		if (sendName) {
			conditions.push(sql`${email.name} COLLATE NOCASE LIKE ${sendName}`)
		}

		if (subject) {
			conditions.push(sql`${email.subject} COLLATE NOCASE LIKE ${subject}`)
		}

		if (content) {
			conditions.push(sql`${email.content} COLLATE NOCASE LIKE ${content}`)
		}

		if (type || type === 0) {
			conditions.push(eq(email.type, type))
		}

		if (isDel || isDel === 0) {
			conditions.push(eq(email.isDel, isDel))
		}

		if (conditions.length === 1) {
			query.where(...conditions)
		} else if (conditions.length > 1) {
			query.where(and(...conditions))
		}

		if (timeSort === 'asc') {
			query.orderBy(asc(email.emailId));
		} else {
			query.orderBy(desc(email.emailId));
		}

		return query.limit(size).offset(num);

	},

	async addUser(c, params) {
		const { list } = params || {};

		if (!Array.isArray(list) || list.length === 0) return;

		const { register } = await settingService.query(c);
		if (register === settingConst.register.CLOSE) {
			throw new BizError(t('regDisabled'), 403);
		}

		for (const emailRow of list) {
			if (!verifyUtils.isEmail(emailRow.email)) {
				throw new BizError(t('notEmail'));
			}

			if (!c.env.domain.includes(emailUtils.getDomain(emailRow.email))) {
				throw new BizError(t('notEmailDomain'));
			}

			const password = emailRow.password || cryptoUtils.genRandomPwd();
			if (typeof password !== 'string') {
				throw new BizError(t('pwdMinLengthLimit'));
			}

			if (password.length > 30) {
				throw new BizError(t('pwdLengthLimit'));
			}

			if (password.length < 6) {
				throw new BizError(t('pwdMinLengthLimit'));
			}

			const { salt, hash } = await saltHashUtils.hashPassword(password);

			emailRow.salt = salt;
			emailRow.hash = hash;
		}


		const activeIp = reqUtils.getIp(c);
		const { os, browser, device } = reqUtils.getUserAgent(c);
		const activeTime = dayjs().format('YYYY-MM-DD HH:mm:ss');

		const roleList = await roleService.roleSelectUse(c);
		const defRole = roleList.find(roleRow => roleRow.isDefault === roleConst.isDefault.OPEN);

		const userList = [];

		for (const emailRow of list) {
			let { email, hash, salt, roleName } = emailRow;
			let type = defRole.roleId;

			if (roleName) {
				const roleRow = roleList.find(role => role.name === roleName);
				type = roleRow ? roleRow.roleId : type;
			}

			userList.push(c.env.db.prepare(`
				INSERT INTO user (email, password, salt, type, os, browser, active_ip, create_ip, device, active_time, create_time)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			`).bind(email, hash, salt, type, os, browser, activeIp, activeIp, device, activeTime, activeTime));

			userList.push(c.env.db.prepare(`
				INSERT INTO account (email, name, user_id)
				VALUES (?, ?, (SELECT user_id FROM user WHERE email = ?))
			`).bind(email, emailUtils.getName(email), email));
		}

		try {
			await c.env.db.batch(userList);
		} catch (e) {
			if(e.message.includes('SQLITE_CONSTRAINT')) {
				throw new BizError(t('emailExistDatabase'))
			} else {
				throw e
			}
		}

	},

	async genToken(c, params) {

		await this.verifyUser(c, params)

		const uuid = uuidv4();

		await c.env.kv.put(KvConst.PUBLIC_KEY, uuid);

		return {token: uuid}
	},

	async verifyUser(c, params) {

		const { email, password } = params

		const userRow = await userService.selectByEmailIncludeDel(c, email);

		if (!adminUtils.isAdmin(c, email)) {
			throw new BizError(t('notAdmin'));
		}

		if (!userRow || userRow.isDel === isDel.DELETE) {
			throw new BizError(t('notExistUser'));
		}

		if (!await cryptoUtils.verifyPassword(password, userRow.salt, userRow.password)) {
			throw new BizError(t('IncorrectPwd'));
		}
	},

	/**
	 * 为指定用户添加邮箱账户
	 */
	async addUserAccount(c, params) {
		const { userId, email } = params;
		const targetUserId = Number(userId);

		if (!targetUserId) {
			throw new BizError(t('emptyUserId'));
		}

		if (!email) {
			throw new BizError(t('emptyEmail'));
		}

		return await accountService.addByAdmin(c, { userId: targetUserId, email });
	},

	/**
	 * 删除指定用户的邮箱账户
	 */
	async deleteUserAccount(c, params) {
		const { userId, accountId } = params;
		const targetUserId = Number(userId);
		const targetAccountId = Number(accountId);

		if (!targetUserId || !targetAccountId) {
			throw new BizError(t('emptyParams'));
		}

		return await accountService.deleteByAdmin(c, { userId: targetUserId, accountId: targetAccountId });
	},

	/**
	 * 查询指定用户的邮箱账户列表
	 */
	async listUserAccount(c, params) {
		const { userId, accountId, size } = params;
		const targetUserId = Number(userId);

		if (!targetUserId) {
			throw new BizError(t('emptyUserId'));
		}

		// 使用现有的list方法，但需要传入目标用户ID
		return await accountService.list(c, { accountId, size }, targetUserId);
	}

}

export default publicService
