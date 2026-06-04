import { eq } from 'drizzle-orm';
import orm from '../entity/orm';
import email from '../entity/email';
import jwtUtils from '../utils/jwt-utils';
import domainUtils from '../utils/domain-uitls';
import settingService from './setting-service';
import emailMsgTemplate from '../template/email-msg';
import emailHtmlTemplate from '../template/email-html';
import emailTextTemplate from '../template/email-text';

const TELEGRAM_FALLBACK_URL = 'https://www.cloudflare.com/404';

const telegramService = {
	async getEmailContent(c, params) {
		const { token } = params;

		const result = await jwtUtils.verifyToken(c, token);
		if (!result) {
			return emailTextTemplate('Access denied');
		}

		const emailRow = await orm(c).select().from(email).where(eq(email.emailId, result.emailId)).get();
		if (!emailRow) {
			return emailTextTemplate('The email does not exist');
		}

		if (emailRow.content) {
			const { r2Domain } = await settingService.query(c);
			return emailHtmlTemplate(emailRow.content || '', r2Domain);
		}

		return emailTextTemplate(emailRow.text || '');
	},

	async sendEmailToBot(c, emailRow) {
		const { tgBotToken, tgChatId, customDomain, tgMsgTo, tgMsgFrom, tgMsgText } = await settingService.query(c);

		if (!tgBotToken || !tgChatId) {
			return;
		}

		const tgChatIds = tgChatId.split(',').map((item) => item.trim()).filter(Boolean);
		if (tgChatIds.length === 0) {
			return;
		}

		const jwtToken = await jwtUtils.generateToken(c, { emailId: emailRow.emailId });
		const baseUrl = domainUtils.toOssDomain(customDomain);
		const webAppUrl = baseUrl ? `${baseUrl}/api/telegram/getEmail/${jwtToken}` : TELEGRAM_FALLBACK_URL;
		const inlineKeyboard = [[{ text: 'View', web_app: { url: webAppUrl } }]];

		if (emailRow.code) {
			inlineKeyboard.push([{ text: emailRow.code, copy_text: { text: emailRow.code } }]);
		}

		await Promise.all(tgChatIds.map(async (chatId) => {
			try {
				const res = await fetch(`https://api.telegram.org/bot${tgBotToken}/sendMessage`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({
						chat_id: chatId,
						parse_mode: 'HTML',
						text: emailMsgTemplate(emailRow, tgMsgTo, tgMsgFrom, tgMsgText),
						reply_markup: {
							inline_keyboard: inlineKeyboard,
						},
					}),
				});

				if (!res.ok) {
					console.error(`转发 Telegram 失败 status: ${res.status} response: ${await res.text()}`);
				}
			} catch (e) {
				console.error('转发 Telegram 失败:', e.message);
			}
		}));
	},
};

export default telegramService;
