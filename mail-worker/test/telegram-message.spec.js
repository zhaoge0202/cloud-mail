import { describe, expect, test } from 'vitest';
import emailMsgTemplate from '../src/template/email-msg.js';

describe('emailMsgTemplate', () => {
	test('shows only sender name and text preview when configured', () => {
		const html = emailMsgTemplate({
			subject: '<Hello>',
			name: 'Alice <Admin>',
			sendEmail: 'alice@example.com',
			toEmail: 'team@example.com',
			text: 'Line 1',
			content: '',
		}, 'show', 'only-name', 'show');

		expect(html).toContain('&lt;Hello&gt;');
		expect(html).toContain('Alice &lt;Admin&gt;');
		expect(html).not.toContain('alice@example.com');
		expect(html).toContain('Line 1');
	});

	test('hides recipients and body when configured', () => {
		const html = emailMsgTemplate({
			subject: 'Subject',
			name: 'Alice',
			sendEmail: 'alice@example.com',
			toEmail: 'team@example.com',
			text: 'Body',
			content: '',
		}, 'hide', 'hide', 'hide');

		expect(html).toContain('Subject');
		expect(html).not.toContain('team@example.com');
		expect(html).not.toContain('Body');
	});
});
