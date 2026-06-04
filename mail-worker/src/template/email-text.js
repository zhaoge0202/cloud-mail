function escapeHtml(text = '') {
	return String(text)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}

export default function emailTextTemplate(text) {
	return `<!DOCTYPE html>
<html lang='en'>
<head>
    <meta charset='UTF-8'>
    <meta name='viewport' content='width=device-width, initial-scale=1.0'>
    <style>
        html {
            margin: 0;
            padding: 0;
            background: #FFF;
        }

        body {
            box-sizing: border-box;
            margin: 0;
            padding: 10px;
            width: 100%;
            height: 100%;
            overflow: auto;
            font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        span {
            white-space: pre-wrap;
            word-break: break-word;
            line-height: 1.5;
        }
    </style>
</head>
<body>
<span>${escapeHtml(text)}</span>
</body>
</html>`;
}
