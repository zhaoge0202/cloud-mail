import { parseHTML } from 'linkedom';
import domainUtils from '../utils/domain-uitls';

export default function emailHtmlTemplate(html, domain) {
	const { document } = parseHTML(html || '');
	document.querySelectorAll('script').forEach((script) => script.remove());
	html = document.toString();

	const baseDomain = domainUtils.toOssDomain(domain);
	html = html.replace(/{{domain}}/g, baseDomain ? `${baseDomain}/` : '');
	const safeHtmlJson = JSON.stringify(html).replace(/</g, '\\u003C');

	return `<!DOCTYPE html>
<html lang='en'>
<head>
    <meta charset='UTF-8'>
    <meta name='viewport' content='width=device-width, initial-scale=1.0'>
    <style>
        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
            background: #FFF;
        }

        .content-box {
            padding: 15px 10px;
            width: 100%;
            height: 100%;
            overflow: auto;
            font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        .content-html {
            width: 100%;
            height: 100%;
        }
    </style>
</head>
<body>
    <div class='content-box'>
        <div id='container' class='content-html'></div>
    </div>

    <script>
        function renderHTML(html) {
            const container = document.getElementById('container');
            const shadowRoot = container.attachShadow({ mode: 'open' });

            const bodyStyleRegex = /<body[^>]*style="([^"]*)"[^>]*>/i;
            const bodyStyleMatch = html.match(bodyStyleRegex);
            const bodyStyle = bodyStyleMatch ? bodyStyleMatch[1] : '';

            const cleanedHtml = html.replace(/<\\/?body[^>]*>/gi, '');

            shadowRoot.innerHTML = \`
                <style>
                    :host {
                        all: initial;
                        width: 100%;
                        height: 100%;
                        font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                        font-size: 14px;
                        line-height: 1.5;
                        color: #13181D;
                        word-break: break-word;
                        overflow: auto;
                    }

                    h1, h2, h3, h4 {
                        font-size: 18px;
                        font-weight: 700;
                    }

                    p {
                        margin: 0;
                    }

                    a {
                        text-decoration: none;
                        color: #0E70DF;
                    }

                    .shadow-content {
                        background: #FFFFFF;
                        width: fit-content;
                        height: fit-content;
                        min-width: 100%;
                        \${bodyStyle ? bodyStyle : ''}
                    }

                    img:not(table img) {
                        max-width: 100% !important;
                        height: auto !important;
                    }
                </style>
                <div class="shadow-content">
                    \${cleanedHtml}
                </div>
            \`;

            autoScale(shadowRoot, container);
        }

        function autoScale(shadowRoot, container) {
            if (!shadowRoot || !container) return;

            const shadowContent = shadowRoot.querySelector('.shadow-content');
            if (!shadowContent) return;

            const parentWidth = container.offsetWidth;
            const childWidth = shadowContent.scrollWidth;
            if (!childWidth) return;

            shadowRoot.host.style.zoom = parentWidth / childWidth;
        }

        const exampleHtml = ${safeHtmlJson};
        renderHTML(exampleHtml);
    </script>
</body>
</html>`;
}
