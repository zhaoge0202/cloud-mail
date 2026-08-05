import app from '../hono/hono';
import result from '../model/result';
import apiTokenService from '../service/api-token-service';
import accountService from '../service/account-service';
import userContext from '../security/user-context';
import orm from '../entity/orm';
import email from '../entity/email';
import { and, asc, desc, eq, gt, lt, sql } from 'drizzle-orm';

/**
 * 生成用户API Token
 * POST /user/token/generate
 * Body: { email, password }
 */
app.post('/user/token/generate', async (c) => {
	const data = await apiTokenService.generateToken(c, await c.req.json());
	return c.json(result.ok(data));
});

/**
 * 撤销用户API Token
 * POST /user/token/revoke
 * Body: { email, password }
 */
app.post('/user/token/revoke', async (c) => {
	await apiTokenService.revokeTokenByCredentials(c, await c.req.json());
	return c.json(result.ok());
});

/**
 * 获取API使用情况
 * GET /user/api/status
 * Header: Authorization: <api-token>
 */
app.get('/user/api/status', async (c) => {
	const status = apiTokenService.getApiStatus(c, userContext.getUser(c), c.get('apiRole'));
	return c.json(result.ok(status));
});

/**
 * 添加邮箱账户（用户只能为自己添加）
 * POST /user/account/add
 * Header: Authorization: <api-token>
 * Body: { email }
 */
app.post('/user/account/add', async (c) => {
	const account = await accountService.addByApi(
		c,
		await c.req.json(),
		userContext.getUser(c),
		c.get('apiRole')
	);
	
	return c.json(result.ok(account));
});

/**
 * 删除邮箱账户（用户只能删除自己的）
 * DELETE /user/account/delete
 * Header: Authorization: <api-token>
 * Query: accountId=123
 */
app.delete('/user/account/delete', async (c) => {
	await accountService.deleteByApi(c, c.req.query(), userContext.getUser(c));
	
	return c.json(result.ok());
});

/**
 * 查询用户的邮箱账户列表
 * GET /user/account/list
 * Header: Authorization: <api-token>
 */
app.get('/user/account/list', async (c) => {
	const userId = userContext.getUserId(c);

	// 使用现有的list方法
	const list = await accountService.list(c, {}, userId);

	return c.json(result.ok(list));
});

/**
 * 查询用户的邮件列表（支持高级筛选）
 * POST /user/email/list
 * Header: Authorization: <api-token>
 * Body: {
 *   toEmail?: string,      // 收件人邮箱，支持模糊
 *   sendName?: string,     // 发件人名字，支持模糊
 *   sendEmail?: string,    // 发件人邮箱，支持模糊
 *   subject?: string,      // 邮件主题，支持模糊
 *   content?: string,      // 邮件html，支持模糊
 *   timeSort?: string,     // 时间排序（asc 最旧，desc 最新）默认desc
 *   type?: integer,        // 邮件类型 （0 收件，1发件，空 全部）
 *   isDel?: integer,       // 是否删除 （0 正常，1删除，空 全部）
 *   emailId?: integer,     // 游标分页水位，desc 查小于该ID，asc 查大于该ID
 *   num?: integer,         // 页码，默认1
 *   size?: integer         // 每页数量，默认20
 * }
 */
app.post('/user/email/list', async (c) => {
	const userId = userContext.getUserId(c);
	let { toEmail, content, subject, sendName, sendEmail, timeSort, num, size, type, isDel, emailId } = await c.req.json();

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
	}).from(email);

	if (!size) {
		size = 20;
	}

	if (!num) {
		num = 1;
	}

	size = Number(size);
	num = Number(num);
	emailId = Number(emailId);

	if (!size || Number.isNaN(size) || size < 1) {
		size = 20;
	}

	if (size > 30) {
		size = 30;
	}

	if (!num || Number.isNaN(num) || num < 1) {
		num = 1;
	}

	num = (num - 1) * size;

	let conditions = [];

	// 重要：只查询当前用户的邮件
	conditions.push(eq(email.userId, userId));

	if (toEmail) {
		// 使用精确匹配，走索引 idx_email_to_email，避免全表扫描
		conditions.push(eq(email.toEmail, toEmail));
	}

	if (sendEmail) {
		conditions.push(sql`${email.sendEmail} COLLATE NOCASE LIKE ${sendEmail}`);
	}

	if (sendName) {
		conditions.push(sql`${email.name} COLLATE NOCASE LIKE ${sendName}`);
	}

	if (subject) {
		conditions.push(sql`${email.subject} COLLATE NOCASE LIKE ${subject}`);
	}

	if (content) {
		conditions.push(sql`${email.content} COLLATE NOCASE LIKE ${content}`);
	}

	if (type || type === 0) {
		conditions.push(eq(email.type, type));
	}

	if (isDel || isDel === 0) {
		conditions.push(eq(email.isDel, isDel));
	}

	if (emailId) {
		if (timeSort === 'asc') {
			conditions.push(gt(email.emailId, emailId));
		} else {
			conditions.push(lt(email.emailId, emailId));
		}
	}

	if (conditions.length === 1) {
		query.where(...conditions);
	} else if (conditions.length > 1) {
		query.where(and(...conditions));
	}

	if (timeSort === 'asc') {
		query.orderBy(asc(email.emailId));
	} else {
		query.orderBy(desc(email.emailId));
	}

	const pagedQuery = emailId ? query.limit(size) : query.limit(size).offset(num);
	const list = await pagedQuery.all();

	return c.json(result.ok(list));
});

export default app;
