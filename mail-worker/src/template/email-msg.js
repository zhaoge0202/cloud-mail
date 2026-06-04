import emailUtils from '../utils/email-utils';

const TELEGRAM_MESSAGE_LIMIT = 3500;
const TRUNCATED_SUFFIX = '...';

function escapeHtml(text = '') {
	return String(text).replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function normalizeText(text = '') {
	return String(text)
		.split('\n')
		.map((line) => line.replace(/[\u200B-\u200F\uFEFF\u034F\u00A0\u3000\u00AD]/g, '').replace(/\s+/g, ' ').trim())
		.join('\n')
		.replace(/\n{3,}/g, '\n')
		.trim();
}

function truncateText(text, maxLength) {
	if (!text || text.length <= maxLength) {
		return text || '';
	}

	if (maxLength <= TRUNCATED_SUFFIX.length) {
		return TRUNCATED_SUFFIX.slice(0, maxLength);
	}

	return text.slice(0, maxLength - TRUNCATED_SUFFIX.length) + TRUNCATED_SUFFIX;
}

export default function emailMsgTemplate(email, tgMsgTo, tgMsgFrom, tgMsgText) {
	let template = `<b>${escapeHtml(email.subject || '')}</b>`;

	if (tgMsgFrom === 'only-name') {
		template += `\n\nFrom\u200B：${escapeHtml(email.name || '')}`;
	}

	if (tgMsgFrom === 'show') {
		template += `\n\nFrom\u200B：${escapeHtml(email.name || '')}  &lt;${escapeHtml(email.sendEmail || '')}&gt;`;
	}

	if (tgMsgTo === 'show') {
		template += `${tgMsgFrom === 'hide' ? '\n\n' : '\n'}To：\u200B${escapeHtml(email.toEmail || '')}`;
	}

	const text = normalizeText(email.text || '') || normalizeText(emailUtils.htmlToText(email.content || ''));

	if (tgMsgText === 'show') {
		const prefix = `${template}\n\n`;
		const maxTextLength = Math.max(0, TELEGRAM_MESSAGE_LIMIT - prefix.length);
		template += `\n\n${escapeHtml(truncateText(text, maxTextLength))}`;
	}

	return template;
}
