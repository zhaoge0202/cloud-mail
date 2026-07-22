import app from './hono/webs';
import { email } from './email/email';
import userService from './service/user-service';
import verifyRecordService from './service/verify-record-service';
import analysisService from './service/analysis-service';

export default {
	async fetch(req, env, ctx) {
		const url = new URL(req.url)

		if (url.pathname.startsWith('/api/')) {
			url.pathname = url.pathname.replace('/api', '')
			req = new Request(url.toString(), req)
			return app.fetch(req, env, ctx);
		}

		return env.assets.fetch(req);
	},
	email: email,
	async scheduled(c, env, ctx) {
		// 半小时只刷分析缓存，避免和每日任务叠在一起
		if (c.cron === '*/30 * * * *') {
			await analysisService.refreshEchartsCache({ env })
			return
		}

		await verifyRecordService.clearRecord({ env })
		await userService.resetDaySendCount({ env })
		await analysisService.refreshEchartsCache({ env })
	},
};
