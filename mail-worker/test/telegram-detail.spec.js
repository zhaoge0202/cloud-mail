import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('../src/utils/jwt-utils.js', () => ({
	default: {
		verifyToken: vi.fn(),
		generateToken: vi.fn(),
	},
}));

vi.mock('../src/entity/orm.js', () => ({
	default: vi.fn(),
}));

vi.mock('../src/service/setting-service.js', () => ({
	default: {
		query: vi.fn(),
	},
}));

describe('telegramService detail rendering', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
		global.fetch = vi.fn();
	});

	test('returns text page for text-only emails', async () => {
		const { default: jwtUtils } = await import('../src/utils/jwt-utils.js');
		const { default: orm } = await import('../src/entity/orm.js');
		const { default: telegramService } = await import('../src/service/telegram-service.js');

		jwtUtils.verifyToken.mockResolvedValue({ emailId: 7 });
		orm.mockReturnValue({
			select: () => ({
				from: () => ({
					where: () => ({
						get: async () => ({ emailId: 7, text: 'hello', content: '' }),
					}),
				}),
			}),
		});

		const html = await telegramService.getEmailContent({ env: {}, get: () => undefined }, { token: 'abc' });
		expect(html).toContain('hello');
	});

	test('sendEmailToBot builds view and copy buttons from settings', async () => {
		const { default: jwtUtils } = await import('../src/utils/jwt-utils.js');
		const { default: settingService } = await import('../src/service/setting-service.js');
		const { default: telegramService } = await import('../src/service/telegram-service.js');

		jwtUtils.generateToken.mockResolvedValue('jwt-token');
		settingService.query.mockResolvedValue({
			tgBotToken: 'bot-token',
			tgChatId: '1001,1002',
			customDomain: 'mail.example.com',
			tgMsgFrom: 'only-name',
			tgMsgTo: 'show',
			tgMsgText: 'hide',
		});
		global.fetch.mockResolvedValue({
			ok: true,
			text: async () => '',
		});

		await telegramService.sendEmailToBot({ env: {} }, {
			emailId: 88,
			subject: 'Code',
			name: 'Alice',
			sendEmail: 'alice@example.com',
			toEmail: 'team@example.com',
			text: 'Preview',
			content: '',
			code: '123456',
		});

		expect(jwtUtils.generateToken).toHaveBeenCalledWith({ env: {} }, { emailId: 88 });
		expect(global.fetch).toHaveBeenCalledTimes(2);

		const [, firstCall] = global.fetch.mock.calls[0];
		const payload = JSON.parse(firstCall.body);
		expect(payload.reply_markup.inline_keyboard[0][0]).toEqual({
			text: 'View',
			web_app: { url: 'https://mail.example.com/api/telegram/getEmail/jwt-token' },
		});
		expect(payload.reply_markup.inline_keyboard[1][0]).toEqual({
			text: '123456',
			copy_text: { text: '123456' },
		});
	});

	test('sendEmailToBot falls back when customDomain is missing', async () => {
		const { default: jwtUtils } = await import('../src/utils/jwt-utils.js');
		const { default: settingService } = await import('../src/service/setting-service.js');
		const { default: telegramService } = await import('../src/service/telegram-service.js');

		jwtUtils.generateToken.mockResolvedValue('jwt-token');
		settingService.query.mockResolvedValue({
			tgBotToken: 'bot-token',
			tgChatId: '1001',
			customDomain: '',
			tgMsgFrom: 'only-name',
			tgMsgTo: 'show',
			tgMsgText: 'hide',
		});
		global.fetch.mockResolvedValue({
			ok: true,
			text: async () => '',
		});

		await telegramService.sendEmailToBot({ env: {} }, {
			emailId: 89,
			subject: 'Hello',
			name: 'Alice',
			sendEmail: 'alice@example.com',
			toEmail: 'team@example.com',
			text: 'Preview',
			content: '',
		});

		const [, firstCall] = global.fetch.mock.calls[0];
		const payload = JSON.parse(firstCall.body);
		expect(payload.reply_markup.inline_keyboard[0][0].web_app.url).toBe('https://www.cloudflare.com/404');
		expect(payload.reply_markup.inline_keyboard).toHaveLength(1);
	});
});
