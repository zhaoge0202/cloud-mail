import app from '../hono/hono';
import result from '../model/result';

// 分析页已下线：保留路由避免旧前端 404/权限报错，固定空数据且不查 D1
app.get('/analysis/echarts', async (c) => {
	return c.json(result.ok({
		numberCount: {},
		userDayCount: [],
		receiveRatio: { nameRatio: [] },
		emailDayCount: { receiveDayCount: [], sendDayCount: [] },
		daySendTotal: 0,
		disabled: true
	}));
});
