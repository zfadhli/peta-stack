export interface ScalarUIOptions {
  specUrl: string
  title?: string
  theme?: string
  showSidebar?: boolean
  cdnUrl?: string
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function generateScalarHTML(options: ScalarUIOptions): string {
  const specUrl = escapeHtml(options.specUrl)
  const title = options.title ?? "API Reference"
  const theme = options.theme ?? "purple"
  const showSidebar = options.showSidebar ?? true
  const cdnUrl = options.cdnUrl ?? "https://cdn.jsdelivr.net/npm/@scalar/api-reference"
  const config = escapeHtml(JSON.stringify({ theme, showSidebar }))

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { height: 100%; }
  </style>
</head>
<body>
  <div id="api-reference" data-url="${specUrl}" data-configuration="${config}"></div>
  <script src="${escapeHtml(cdnUrl)}" crossorigin></script>
</body>
</html>`
}

export function serveScalarUI(
  options: ScalarUIOptions,
): (c: { html(html: string): Response | Promise<Response> }) => Response | Promise<Response> {
  const html = generateScalarHTML(options)
  return (c) => c.html(html)
}
