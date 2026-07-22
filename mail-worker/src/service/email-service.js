import orm from '../entity/orm';
import email from '../entity/email';
import { attConst, emailConst, isDel, settingConst } from '../const/entity-const';
import { and, desc, eq, gt, inArray, lt, count, asc, sql, ne, or, like, lte, gte } from 'drizzle-orm';
import { star } from '../entity/star';
import settingService from './setting-service';
import accountService from './account-service';
import BizError from '../error/biz-error';
import emailUtils from '../utils/email-utils';
import { Resend } from 'resend';
import smtp2goService from './smtp2go-service';
import attService from './att-service';
import { parseHTML } from 'linkedom';
import userService from './user-service';
import roleService from './role-service';
import user from '../entity/user';
import starService from './star-service';
import dayjs from 'dayjs';
import kvConst from '../const/kv-const';
import { t } from '../i18n/i18n'
import r2Service from './r2-service';
import domainUtils from '../utils/domain-uitls';
import adminUtils from '../utils/admin-utils';
import permService from './perm-service';
import { buildContentLikePattern } from './all-email-filter';
import { applyReceiveDefaults } from './email-unread';

const emailService = {

	async list(c, params, userId) {

		let { emailId, type, accountId, size, timeSort } = params;

		size = Number(size);
		emailId = Number(emailId);
		timeSort = Number(timeSort);
		accountId = Number(accountId);
		type = Number(type);

		if (size > 30) {
			size = 30;
		}

		if (!emailId) {

			if (timeSort) {
				emailId = 0;
			} else {
				emailId = 9999999999;
			}

		}

		// 列表只返回展示字段：不读 content（整封 HTML），正文预览用 text 截断
		const query = orm(c)
			.select({
				emailId: email.emailId,
				sendEmail: email.sendEmail,
				envelopeFrom: email.envelopeFrom,
				name: email.name,
				accountId: email.accountId,
				userId: email.userId,
				subject: email.subject,
				// SQLite substr 截断，避免把整封纯文本带回列表
				text: sql`substr(coalesce(${email.text}, ''), 1, 200)`,
				toEmail: email.toEmail,
				toName: email.toName,
				type: email.type,
				status: email.status,
				message: email.message,
				unread: email.unread,
				createTime: email.createTime,
				isDel: email.isDel,
				starId: star.starId
			})
			.from(email)
			.leftJoin(
				star,
				and(
					eq(star.emailId, email.emailId),
					eq(star.userId, userId)
				)
			)
			.where(
				and(
					eq(email.userId, userId),
					eq(email.accountId, accountId),
					timeSort ? gt(email.emailId, emailId) : lt(email.emailId, emailId),
					eq(email.type, type),
					eq(email.isDel, isDel.NORMAL)
				)
			);

		if (timeSort) {
			query.orderBy(asc(email.emailId));
		} else {
			query.orderBy(desc(email.emailId));
		}

		const listQuery = query.limit(size).all();

		const totalQuery = orm(c).select({ total: count() }).from(email).where(
			and(
				eq(email.accountId, accountId),
				eq(email.userId, userId),
				eq(email.type, type),
				eq(email.isDel, isDel.NORMAL)
			)
		).get();

		// 水位只需要 emailId
		const latestEmailQuery = orm(c).select({
			emailId: email.emailId
		}).from(email).where(
			and(
				eq(email.accountId, accountId),
				eq(email.userId, userId),
				eq(email.type, type),
				eq(email.isDel, isDel.NORMAL)
			))
			.orderBy(desc(email.emailId)).limit(1).get();

		let [list, totalRow, latestEmail] = await Promise.all([listQuery, totalQuery, latestEmailQuery]);

		list = list.map(item => ({
			...item,
			content: '',
			cc: '[]',
			bcc: '[]',
			recipient: '',
			attList: [],
			isStar: item.starId != null ? 1 : 0
		}));

		return { list, total: totalRow.total, latestEmail };
	},

	async delete(c, params, userId) {
		const { emailIds } = params;
		const emailIdList = emailIds.split(',').map(Number);
		await orm(c).update(email).set({ isDel: isDel.DELETE }).where(
			and(
				eq(email.userId, userId),
				inArray(email.emailId, emailIdList)))
			.run();
	},

	receive(c, params, cidAttList, r2domain) {
		params.content = this.imgReplace(params.content, cidAttList, r2domain)
		applyReceiveDefaults(params, emailConst.type.RECEIVE, emailConst.unread.READ)
		return orm(c).insert(email).values({ ...params }).returning().get();
	},

	async send(c, params, userId) {

		let {
			accountId,
			name,
			sendType,
			emailId,
			receiveEmail,
			manyType,
			text,
			content,
			subject,
			attachments
		} = params;

		const { resendTokens, smtp2goTokens, r2Domain, send } = await settingService.query(c);

		let { attDataList, html } = await attService.toImageUrlHtml(c, content, r2Domain);

		if (send === settingConst.send.CLOSE) {
			throw new BizError(t('disabledSend'), 403);
		}

		const userRow = await userService.selectById(c, userId);
		const roleRow = await roleService.selectById(c, userRow.type);

		if (!adminUtils.isAdmin(c, userRow.email) && roleRow.sendType === 'ban') {
			throw new BizError(t('bannedSend'), 403);
		}

		if (!adminUtils.isAdmin(c, userRow.email) && roleRow.sendCount) {

			if (userRow.sendCount >= roleRow.sendCount) {
				if (roleRow.sendType === 'day') throw new BizError(t('daySendLimit'), 403);
				if (roleRow.sendType === 'count') throw new BizError(t('totalSendLimit'), 403);
			}

			if (userRow.sendCount + receiveEmail.length > roleRow.sendCount) {
				if (roleRow.sendType === 'day') throw new BizError(t('daySendLack'), 403);
				if (roleRow.sendType === 'count') throw new BizError(t('totalSendLack'), 403);
			}

		}


		if (attDataList.length > 0 && !r2Domain) {
			throw new BizError(t('noOsDomainSendPic'));
		}

		if (attDataList.length > 0 && !await r2Service.hasOSS(c)) {
			throw new BizError(t('noOsSendPic'));
		}

		if (attachments.length > 0 && !r2Domain) {
			throw new BizError(t('noOsDomainSendAtt'));
		}

		if (attachments.length > 0 && !await r2Service.hasOSS(c)) {
			throw new BizError(t('noOsSendAtt'));
		}

		if (attachments.length > 0 && manyType === 'divide') {
			throw new BizError(t('noSeparateSend'));
		}


		const accountRow = await accountService.selectById(c, accountId);

		if (!accountRow) {
			throw new BizError(t('senderAccountNotExist'));
		}

		if (accountRow.userId !== userId) {
			throw new BizError(t('sendEmailNotCurUser'));
		}

		if (!adminUtils.isAdmin(c, userRow.email)) {

			if(!roleService.hasAvailDomainPerm(roleRow.availDomain, accountRow.email)) {
				throw new BizError(t('noDomainPermSend'),403)
			}

		}

		const domain = emailUtils.getDomain(accountRow.email);
		const resendToken = resendTokens[domain];
		const smtp2goToken = smtp2goTokens[domain];

		// Determine which email service to use
		// Priority: Resend first, then SMTP2GO
		let useResend = false;
		let useSmtp2go = false;

		if (resendToken) {
			useResend = true;
		} else if (smtp2goToken) {
			useSmtp2go = true;
		} else {
			throw new BizError(t('noEmailToken'));
		}


		if (!name) {
			name = emailUtils.getName(accountRow.email);
		}

		let emailRow = {
			messageId: null
		};

		if (sendType === 'reply') {

			emailRow = await this.selectById(c, emailId);

			if (!emailRow) {
				throw new BizError(t('notExistEmailReply'));
			}

		}

		let emailResult = null;

		if (useResend) {
			// Use Resend service
			const resend = new Resend(resendToken);

			if (manyType === 'divide') {

				let sendFormList = [];

				receiveEmail.forEach(email => {
					const sendForm = {
						from: `${name} <${accountRow.email}>`,
						to: [email],
						subject: subject,
						text: text,
						html: html
					};

					if (sendType === 'reply') {
						sendForm.headers = {
							'in-reply-to': emailRow.messageId,
							'references': emailRow.messageId
						};
					}

					sendFormList.push(sendForm);
				});

				emailResult = await resend.batch.send(sendFormList);

			} else {

				const sendForm = {
					from: `${name} <${accountRow.email}>`,
					to: [...receiveEmail],
					subject: subject,
					text: text,
					html: html,
					attachments: attachments
				};

				if (sendType === 'reply') {
					sendForm.headers = {
						'in-reply-to': emailRow.messageId,
						'references': emailRow.messageId
					};
				}

				emailResult = await resend.emails.send(sendForm);

			}

		} else if (useSmtp2go) {
			// Use SMTP2GO service

			if (manyType === 'divide') {

				let emailList = [];

				receiveEmail.forEach(email => {
					const emailParams = {
						sender: `${name} <${accountRow.email}>`,
						to: [email],
						subject: subject,
						textBody: text,
						htmlBody: html
					};

					if (sendType === 'reply') {
						emailParams.headers = [
							{ header: 'In-Reply-To', value: emailRow.messageId },
							{ header: 'References', value: emailRow.messageId }
						];
					}

					emailList.push(emailParams);
				});

				emailResult = await smtp2goService.sendBatch(c, {
					apiKey: smtp2goToken,
					emails: emailList
				});

			} else {

				const emailParams = {
					apiKey: smtp2goToken,
					sender: `${name} <${accountRow.email}>`,
					to: Array.isArray(receiveEmail) ? receiveEmail : [receiveEmail],
					subject: subject,
					textBody: text,
					htmlBody: html,
					attachments: attachments
				};

				if (sendType === 'reply') {
					emailParams.headers = [
						{ header: 'In-Reply-To', value: emailRow.messageId },
						{ header: 'References', value: emailRow.messageId }
					];
				}

				emailResult = await smtp2goService.send(c, emailParams);

			}
		}

		// Handle different response formats
		let emailIds = [];

		if (useResend) {
			const { data, error } = emailResult;

			if (error) {
				throw new BizError(error.message);
			}

			if (manyType === 'divide') {
				emailIds = data.data.map(item => item.id);
			} else {
				emailIds = [data.id];
			}

		} else if (useSmtp2go) {

			if (manyType === 'divide') {
				if (emailResult.failed > 0) {
					const errorMessages = emailResult.errors.map(e => e.error).join(', ');
					throw new BizError(`SMTP2GO Batch Send Failed: ${errorMessages}`);
				}
				emailIds = emailResult.results.map(result => result.data.email_id);
			} else {
				if (!emailResult.data || !emailResult.data.email_id) {
					throw new BizError('SMTP2GO Send Failed: No email ID returned');
				}
				emailIds = [emailResult.data.email_id];
			}
		}

		html = this.imgReplace(html, null, r2Domain);

			const emailData = {};
			emailData.sendEmail = accountRow.email;
			emailData.name = name;
		emailData.subject = subject;
		emailData.content = html;
		emailData.text = text;
		emailData.accountId = accountId;
			emailData.type = emailConst.type.SEND;
			emailData.userId = userId;
			emailData.status = emailConst.status.SENT;
			emailData.unread = emailConst.unread.READ;

		const emailDataList = [];

		if (manyType === 'divide') {

			receiveEmail.forEach((item, index) => {
				const emailDataItem = { ...emailData };
				// Store email ID - use resendEmailId field for both services to maintain compatibility
				emailDataItem.resendEmailId = emailIds[index];
				emailDataItem.recipient = JSON.stringify([{ address: item, name: '' }]);
				emailDataList.push(emailDataItem);
			});

		} else {

			// Store email ID - use resendEmailId field for both services to maintain compatibility
			emailData.resendEmailId = emailIds[0];

			const recipient = [];

			receiveEmail.forEach(item => {
				recipient.push({ address: item, name: '' });
			});

			emailData.recipient = JSON.stringify(recipient);

			emailDataList.push(emailData);
		}

		if (sendType === 'reply') {
			emailDataList.forEach(emailData => {
				emailData.inReplyTo = emailRow.messageId;
				emailData.relation = emailRow.messageId;
			});
		}


		if (roleRow.sendCount) {
			await userService.incrUserSendCount(c, receiveEmail.length, userId);
		}

		const emailRowList = await Promise.all(
			emailDataList.map(async (emailData) => {
				const emailRow = await orm(c).insert(email).values(emailData).returning().get();

				if (attDataList.length > 0) {
					await attService.saveArticleAtt(c, attDataList, userId, accountId, emailRow.emailId);
				}

				if (attachments?.length > 0 && await r2Service.hasOSS(c)) {
					await attService.saveSendAtt(c, attachments, userId, accountId, emailRow.emailId);
				}

				const attsList = await attService.selectByEmailIds(c, [emailRow.emailId]);
				emailRow.attList = attsList;

				return emailRow;
			})
		);

		const dateStr = dayjs().format('YYYY-MM-DD');

		let daySendTotal = await c.env.kv.get(kvConst.SEND_DAY_COUNT + dateStr);

		if (!daySendTotal) {
			await c.env.kv.put(kvConst.SEND_DAY_COUNT + dateStr, JSON.stringify(receiveEmail.length), { expirationTtl: 60 * 60 * 24 });
		} else  {
			daySendTotal = Number(daySendTotal) + receiveEmail.length
			await c.env.kv.put(kvConst.SEND_DAY_COUNT + dateStr, JSON.stringify(daySendTotal), { expirationTtl: 60 * 60 * 24 });
		}

		return emailRowList;
	},

	imgReplace(content, cidAttList, r2domain) {

		if (!content) {
			return ''
		}

		const { document } = parseHTML(content);

		const images = Array.from(document.querySelectorAll('img'));

		const useAtts = []

		for (const img of images) {

			const src = img.getAttribute('src');
			if (src && src.startsWith('cid:') && cidAttList) {

				const cid = src.replace(/^cid:/, '');
				const attCidIndex = cidAttList.findIndex(cidAtt => cidAtt.contentId.replace(/^<|>$/g, '') === cid);

				if (attCidIndex > -1) {
					const cidAtt = cidAttList[attCidIndex];
					img.setAttribute('src', '{{domain}}' + cidAtt.key);
					useAtts.push(cidAtt)
				}

			}

			r2domain = domainUtils.toOssDomain(r2domain)

			if (src && src.startsWith(r2domain + '/')) {
				img.setAttribute('src', src.replace(r2domain + '/', '{{domain}}'));
			}

		}

		useAtts.forEach(att => {
			att.type = attConst.type.EMBED
		})

		return document.toString();
	},

	selectById(c, emailId) {
		return orm(c).select().from(email).where(
			and(eq(email.emailId, emailId),
				eq(email.isDel, isDel.NORMAL)))
			.get();
	},

	// 轮询专用：只取列表展示字段，不读正文/不查附件，显著降低 D1 读放大
	async latest(c, params, userId) {
		let { emailId, accountId } = params;
		emailId = Number(emailId) || 0;
		accountId = Number(accountId);

		const list = await orm(c).select({
			emailId: email.emailId,
			sendEmail: email.sendEmail,
			envelopeFrom: email.envelopeFrom,
			name: email.name,
			accountId: email.accountId,
			userId: email.userId,
			subject: email.subject,
			toEmail: email.toEmail,
			toName: email.toName,
			type: email.type,
			status: email.status,
			message: email.message,
			unread: email.unread,
			createTime: email.createTime,
			isDel: email.isDel
		}).from(email).where(
			and(
				eq(email.userId, userId),
				eq(email.isDel, isDel.NORMAL),
				eq(email.accountId, accountId),
				eq(email.type, emailConst.type.RECEIVE),
				gt(email.emailId, emailId)
			))
			.orderBy(desc(email.emailId))
			.limit(20)
			.all();

		// 列表摘要/详情打开时再补正文与附件
		return list.map(row => ({
			...row,
			text: '',
			content: '',
			cc: '[]',
			bcc: '[]',
			recipient: '',
			attList: []
		}));
	},

	// 详情：按需加载完整正文 + 附件（收件箱轻量列表 / 全部邮件轻量列表）
	async detail(c, params, userId) {
		const emailId = Number(params.emailId);
		if (!emailId) {
			throw new BizError(t('starNotExistEmail'));
		}

		const emailRow = await orm(c).select().from(email).where(
			eq(email.emailId, emailId)
		).get();

		if (!emailRow) {
			throw new BizError(t('starNotExistEmail'));
		}

		const isOwnerNormal = emailRow.userId === userId && emailRow.isDel === isDel.NORMAL;
		if (!isOwnerNormal) {
			// 全部邮件（含已删除）需要 all-email:query 或管理员
			const userRow = await userService.selectById(c, userId);
			const allowAll = userRow && (
				adminUtils.isAdmin(c, userRow.email) ||
				(await permService.userPermKeys(c, userId)).includes('all-email:query')
			);
			if (!allowAll) {
				throw new BizError(t('starNotExistEmail'));
			}
		}

		const attsList = await attService.selectByEmailIds(c, [emailId]);
		emailRow.attList = attsList;
		return emailRow;
	},

	async physicsDelete(c, params) {
		let { emailIds } = params;
		emailIds = emailIds.split(',').map(Number);
		await attService.removeByEmailIds(c, emailIds);
		await starService.removeByEmailIds(c, emailIds);
		await orm(c).delete(email).where(inArray(email.emailId, emailIds)).run();
	},

	async physicsDeleteUserIds(c, userIds) {
		await attService.removeByUserIds(c, userIds);
		await orm(c).delete(email).where(inArray(email.userId, userIds)).run();
	},

	updateEmailStatus(c, params) {
		const { status, resendEmailId, message } = params;
		return orm(c).update(email).set({
			status: status,
			message: message
		}).where(eq(email.resendEmailId, resendEmailId)).returning().get();
	},

	async selectUserEmailCountList(c, userIds, type, del = isDel.NORMAL) {
		const result = await orm(c)
			.select({
				userId: email.userId,
				count: count(email.emailId)
			})
			.from(email)
			.where(and(
				inArray(email.userId, userIds),
				eq(email.type, type),
				eq(email.isDel, del)
			))
			.groupBy(email.userId);
		return result;
	},

	async allList(c, params) {

		let { emailId, size, name, subject, content, accountEmail, userEmail, type, timeSort } = params;

		size = Number(size);

		emailId = Number(emailId);
		timeSort = Number(timeSort);

		if (size > 30) {
			size = 30;
		}

		if (!emailId) {

			if (timeSort) {
				emailId = 0;
			} else {
				emailId = 9999999999;
			}

		}

		const conditions = [];


		if (type === 'send') {
			conditions.push(eq(email.type, emailConst.type.SEND));
		}

		if (type === 'receive') {
			conditions.push(eq(email.type, emailConst.type.RECEIVE));
		}

		if (type === 'delete') {
			conditions.push(eq(email.isDel, isDel.DELETE));
		}

		if (type === 'noone') {
			conditions.push(eq(email.status, emailConst.status.NOONE));
		}

		if (userEmail) {
			conditions.push(sql`${user.email} COLLATE NOCASE LIKE ${userEmail + '%'}`);
		}

		if (accountEmail) {
			conditions.push(
				or(
					sql`${email.toEmail} COLLATE NOCASE LIKE ${accountEmail + '%'}`,
					sql`${email.sendEmail} COLLATE NOCASE LIKE ${accountEmail + '%'}`,
				)
			)
		}

		if (name) {
			conditions.push(sql`${email.name} COLLATE NOCASE LIKE ${name + '%'}`);
		}

		if (subject) {
			conditions.push(sql`${email.subject} COLLATE NOCASE LIKE ${subject + '%'}`);
		}

		if (content) {
			conditions.push(sql`${email.text} COLLATE NOCASE LIKE ${buildContentLikePattern(content)}`);
		}

		conditions.push(ne(email.status, emailConst.status.SAVING));

		if (timeSort) {
			conditions.push(gt(email.emailId, emailId));
		} else {
			conditions.push(lt(email.emailId, emailId));
		}

		// 列表轻量化：不返回 content/全文，text 截断；附件详情再查
		// 方案 A：LIMIT size+1 判断 hasMore，彻底不做 COUNT(*)
		const query = orm(c).select({
			emailId: email.emailId,
			sendEmail: email.sendEmail,
			envelopeFrom: email.envelopeFrom,
			name: email.name,
			accountId: email.accountId,
			userId: email.userId,
			subject: email.subject,
			text: sql`substr(coalesce(${email.text}, ''), 1, 200)`,
			toEmail: email.toEmail,
			toName: email.toName,
			type: email.type,
			status: email.status,
			message: email.message,
			unread: email.unread,
			createTime: email.createTime,
			isDel: email.isDel,
			userEmail: user.email
		})
			.from(email)
			.leftJoin(user, eq(email.userId, user.userId))
			.where(and(...conditions));

		if (timeSort) {
			query.orderBy(asc(email.emailId));
		} else {
			query.orderBy(desc(email.emailId));
		}

		const rows = await query.limit(size + 1).all();
		const hasMore = rows.length > size;
		const pageRows = hasMore ? rows.slice(0, size) : rows;

		const lightList = pageRows.map(item => ({
			...item,
			content: '',
			cc: '[]',
			bcc: '[]',
			recipient: '',
			attList: []
		}));

		// 不返回精确 total；前端用 hasMore + 已加载条数
		return { list: lightList, hasMore };
	},

	async restoreByUserId(c, userId) {
		await orm(c).update(email).set({ isDel: isDel.NORMAL }).where(eq(email.userId, userId)).run();
	},

	async completeReceive(c, status, emailId) {
		return await orm(c).update(email).set({
			isDel: isDel.NORMAL,
			status: status
		}).where(eq(email.emailId, emailId)).returning().get();
	},

	async read(c, params, userId) {
		const emailIds = Array.isArray(params.emailIds) ? params.emailIds.map(Number).filter((id) => !Number.isNaN(id)) : [];
		if (emailIds.length === 0) {
			return;
		}

		await orm(c).update(email).set({
			unread: emailConst.unread.READ
		}).where(and(
			eq(email.userId, userId),
			eq(email.type, emailConst.type.RECEIVE),
			inArray(email.emailId, emailIds)
		)).run();
	},

	async readAll(c, params, userId) {
		const accountId = Number(params.accountId);
		if (Number.isNaN(accountId) || accountId <= 0) {
			return;
		}

		await orm(c).update(email).set({
			unread: emailConst.unread.READ
		}).where(and(
			eq(email.userId, userId),
			eq(email.accountId, accountId),
			eq(email.type, emailConst.type.RECEIVE),
			eq(email.isDel, isDel.NORMAL),
			eq(email.unread, emailConst.unread.UNREAD)
		)).run();
	},

	async batchDelete(c, params) {
		let { sendName, sendEmail, toEmail, subject, startTime, endTime, type  } = params

		let right = type === 'left' || type === 'include'
		let left = type === 'include'

		const conditions = []

		if (sendName) {
			conditions.push(like(email.name,`${left ? '%' : ''}${sendName}${right ? '%' : ''}`))
		}

		if (subject) {
			conditions.push(like(email.subject,`${left ? '%' : ''}${subject}${right ? '%' : ''}`))
		}

		if (sendEmail) {
			conditions.push(like(email.sendEmail,`${left ? '%' : ''}${sendEmail}${right ? '%' : ''}`))
		}

		if (toEmail) {
			conditions.push(like(email.toEmail,`${left ? '%' : ''}${toEmail}${right ? '%' : ''}`))
		}

		if (startTime && endTime) {
			conditions.push(gte(email.createTime,`${startTime}`))
			conditions.push(lte(email.createTime,`${endTime}`))
		}

		if (conditions.length === 0) {
			return;
		}

		const emailIdsRow = await orm(c).select({emailId: email.emailId}).from(email).where(conditions.length > 1 ? and(...conditions) : conditions[0]).all();

		const emailIds = emailIdsRow.map(row => row.emailId);

		if (emailIds.length === 0){
			return;
		}

		await attService.removeByEmailIds(c, emailIds);

		await orm(c).delete(email).where(conditions.length > 1 ? and(...conditions) : conditions[0]).run();
	}
};

export default emailService;
