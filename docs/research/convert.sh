#!/usr/bin/env bash
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

# Generate navigation links for a given active file
nav_links() {
  local active="$1"
  for f in objectionjs-lessons sutandojs-lessons orchidorm-lessons; do
    local label
    label=$(echo "$f" | sed 's/-lessons//' | sed 's/-/ /g' | sed 's/\b\(.\)/\u\1/g')
    if [ "$f" = "$active" ]; then
      printf '<a href="%s.html" class="active">%s</a>' "$f" "$label"
    else
      printf '<a href="%s.html">%s</a>' "$f" "$label"
    fi
  done
}

STYLE=$(cat << 'STYLEEOF'
  :root {
    --bg: #fafafa;
    --fg: #1a1a2e;
    --accent: #6c5ce7;
    --accent-light: #a29bfe;
    --border: #e2e2e2;
    --code-bg: #f4f4f8;
    --code-fg: #2d2d2d;
    --heading: #2d2d2d;
    --link: #6c5ce7;
    --link-hover: #5a4bd1;
    --table-bg: #ffffff;
    --table-alt: #f8f8fc;
    --blockquote-border: #6c5ce7;
    --blockquote-bg: #f0eeff;
    --max-width: 880px;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #0f0f1a;
      --fg: #e0e0e0;
      --accent: #a29bfe;
      --accent-light: #6c5ce7;
      --border: #2a2a3e;
      --code-bg: #1a1a2e;
      --code-fg: #d4d4d4;
      --heading: #ffffff;
      --link: #a29bfe;
      --link-hover: #b8b2ff;
      --table-bg: #1a1a2e;
      --table-alt: #222240;
      --blockquote-bg: #1a1a2e;
    }
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;
    background: var(--bg); color: var(--fg); line-height: 1.7; font-size: 16px;
    -webkit-font-smoothing: antialiased;
  }
  .nav-bar {
    position: sticky; top: 0; z-index: 100;
    background: var(--bg); border-bottom: 1px solid var(--border);
    padding: 12px 24px;
    display: flex; align-items: center; gap: 16px; flex-wrap: wrap;
  }
  .nav-bar .brand {
    font-weight: 700; font-size: 15px; color: var(--accent);
    text-decoration: none; white-space: nowrap;
  }
  .nav-bar .brand:hover { color: var(--accent-light); }
  .nav-links { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .nav-links a {
    color: var(--fg); text-decoration: none; font-size: 13px;
    padding: 4px 12px; border-radius: 6px; border: 1px solid var(--border);
    transition: background 0.15s, border-color 0.15s;
  }
  .nav-links a:hover { background: var(--accent); color: #fff; border-color: var(--accent); }
  .nav-links a.active { background: var(--accent); color: #fff; border-color: var(--accent); }
  .nav-spacer { flex: 1; }
  .source-link {
    font-size: 12px; color: #888; text-decoration: none; white-space: nowrap;
    border: 1px solid var(--border); padding: 4px 10px; border-radius: 6px;
  }
  .source-link:hover { color: var(--accent); border-color: var(--accent); }
  .container { max-width: var(--max-width); margin: 0 auto; padding: 32px 24px 80px; }
  h1 { font-size: 2.2em; margin: 0 0 12px; color: var(--heading); line-height: 1.3; }
  h2 { font-size: 1.6em; margin: 32px 0 12px; padding-bottom: 6px; border-bottom: 2px solid var(--accent); color: var(--heading); }
  h3 { font-size: 1.25em; margin: 28px 0 10px; color: var(--heading); }
  h4 { font-size: 1.05em; margin: 20px 0 8px; color: var(--heading); }
  p { margin: 0 0 16px; }
  a { color: var(--link); text-decoration: none; }
  a:hover { color: var(--link-hover); text-decoration: underline; }
  code {
    font-family: 'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;
    font-size: 0.9em; background: var(--code-bg); color: var(--code-fg);
    padding: 2px 6px; border-radius: 4px;
  }
  pre {
    background: var(--code-bg); border: 1px solid var(--border);
    border-radius: 8px; padding: 16px 20px; margin: 0 0 20px;
    overflow-x: auto; line-height: 1.5; font-size: 0.9em;
  }
  pre code { background: none; padding: 0; border-radius: 0; font-size: 1em; }
  blockquote {
    border-left: 4px solid var(--blockquote-border); background: var(--blockquote-bg);
    padding: 12px 20px; margin: 0 0 20px; border-radius: 0 8px 8px 0;
  }
  blockquote p:last-child { margin-bottom: 0; }
  ul, ol { margin: 0 0 16px; padding-left: 24px; }
  li { margin-bottom: 6px; }
  li > ul, li > ol { margin-bottom: 0; margin-top: 4px; }
  table {
    width: 100%; border-collapse: collapse; margin: 0 0 24px;
    background: var(--table-bg); border-radius: 8px; overflow: hidden;
    border: 1px solid var(--border);
  }
  th {
    background: var(--accent); color: #fff; font-weight: 600;
    text-align: left; padding: 10px 14px; font-size: 0.9em;
  }
  td { padding: 8px 14px; border-top: 1px solid var(--border); font-size: 0.95em; }
  tr:nth-child(even) td { background: var(--table-alt); }
  hr { border: none; border-top: 1px solid var(--border); margin: 32px 0; }
  strong { color: var(--heading); }
  img { max-width: 100%; height: auto; border-radius: 6px; }
  @media (max-width: 600px) {
    .container { padding: 20px 16px 60px; }
    h1 { font-size: 1.6em; }
    h2 { font-size: 1.3em; }
    .nav-bar { padding: 10px 16px; gap: 10px; }
    table { font-size: 0.85em; }
    th, td { padding: 6px 10px; }
  }
  @media print { .nav-bar { display: none; } body { font-size: 12px; } }
STYLEEOF
)

wrap_html() {
  local title="$1"
  local active_slug="$2"
  local body_file="$3"
  local output_file="$4"
  local source_md="${active_slug}.md"

  local nav
  nav=$(nav_links "$active_slug")

  {
    cat << HEADEREOF
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${title} — peta-orm Research</title>
<style>
${STYLE}
</style>
</head>
<body>
<nav class="nav-bar">
  <a href="index.html" class="brand">⬅ peta-orm Research</a>
  <span class="nav-spacer"></span>
  <div class="nav-links">
    ${nav}
  </div>
  <a href="${source_md}" class="source-link">📄 MD</a>
</nav>
<main class="container">
HEADEREOF

    cat "$body_file"

    echo '</main></body></html>'
  } > "$output_file"

  echo "✅ Created: $output_file"
}

# Convert each markdown file to HTML
for f in objectionjs-lessons sutandojs-lessons orchidorm-lessons; do
  md="${f}.md"
  body=$(mktemp)
  title=$(echo "$f" | sed 's/-lessons//' | sed 's/-/ /g' | sed 's/\b\(.\)/\u\1/g')

  echo "Converting $md..."
  marked -o "$body" --gfm "$md"

  wrap_html "$title" "$f" "$body" "${f}.html"

  rm -f "$body"
done

# Create index.html
echo "Creating index.html..."
cat > index.html << 'INDEXEOF'
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>peta-orm ORM Research — Overview</title>
<style>
  :root {
    --bg: #fafafa; --fg: #1a1a2e; --accent: #6c5ce7; --accent-light: #a29bfe;
    --border: #e2e2e2; --card-bg: #ffffff;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #0f0f1a; --fg: #e0e0e0; --accent: #a29bfe; --accent-light: #6c5ce7;
      --border: #2a2a3e; --card-bg: #1a1a2e;
    }
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;
    background: var(--bg); color: var(--fg); line-height: 1.7; font-size: 16px;
    -webkit-font-smoothing: antialiased;
  }
  .container { max-width: 800px; margin: 0 auto; padding: 48px 24px; }
  h1 { font-size: 2.5em; margin-bottom: 8px; color: var(--accent); }
  .subtitle { font-size: 1.1em; color: #888; margin-bottom: 40px; }
  .cards {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 20px; margin-bottom: 40px;
  }
  .card {
    background: var(--card-bg); border: 1px solid var(--border);
    border-radius: 12px; padding: 24px;
    transition: transform 0.15s, box-shadow 0.15s;
    text-decoration: none; color: inherit; display: flex; flex-direction: column;
  }
  .card:hover {
    transform: translateY(-3px);
    box-shadow: 0 8px 24px rgba(108,92,231,0.12);
    border-color: var(--accent);
  }
  .card h2 { font-size: 1.3em; margin-bottom: 8px; color: var(--accent); }
  .card .meta { font-size: 0.85em; color: #888; margin-bottom: 12px; }
  .card .desc { font-size: 0.95em; flex: 1; }
  .card .lines {
    margin-top: 12px; font-size: 0.85em; color: #888;
    border-top: 1px solid var(--border); padding-top: 10px;
  }
  .summary {
    background: var(--card-bg); border: 1px solid var(--border);
    border-radius: 12px; padding: 24px;
  }
  .summary h3 { font-size: 1.1em; margin-bottom: 12px; color: var(--accent); }
  .summary ul { padding-left: 20px; }
  .summary li { margin-bottom: 6px; }
  hr { border: none; border-top: 1px solid var(--border); margin: 32px 0; }
  @media (max-width: 600px) {
    h1 { font-size: 1.8em; }
    .container { padding: 24px 16px; }
  }
</style>
</head>
<body>
<div class="container">
  <h1>🧪 peta-orm ORM Research</h1>
  <p class="subtitle">Comparative analysis of three Node.js ORMs to inform peta-orm improvements</p>

  <div class="cards">
    <a href="objectionjs-lessons.html" class="card">
      <h2>Objection.js</h2>
      <div class="meta">7.3k⭐ · Knex-based</div>
      <div class="desc">A relational query builder giving full SQL power while making common tasks easy.</div>
      <div class="lines">477 lines · Graph inserts, static hooks, relation queries</div>
    </a>
    <a href="sutandojs-lessons.html" class="card">
      <h2>Sutando.js</h2>
      <div class="meta">301⭐ · Knex-based</div>
      <div class="desc">A modern Node.js ORM, heavily inspired by Laravel Eloquent.</div>
      <div class="lines">779 lines · Attach/detach/sync, withCount, firstOrCreate</div>
    </a>
    <a href="orchidorm-lessons.html" class="card">
      <h2>Orchid ORM</h2>
      <div class="meta">540⭐ · PostgreSQL-only</div>
      <div class="desc">A TypeScript ORM with a custom query builder, focused on Postgres depth.</div>
      <div class="lines">833 lines · Nested selects, chain(), computed columns, repos</div>
    </a>
  </div>

  <div class="summary">
    <h3>📋 Design Philosophy Spectrum</h3>
    <ul>
      <li><strong>Objection.js</strong> — "Relational Query Builder" on Knex. Thenable QB, graph operations (<code>insertGraph</code>/<code>upsertGraph</code>), static hooks with <code>asFindQuery()</code>, <code>allowGraph</code> security.</li>
      <li><strong>Sutando.js</strong> — "Eloquent for Node.js" on Knex. Active Record classes, <code>attach/detach/sync</code>, <code>withCount</code>/<code>loadCount</code>, <code>firstOrCreate</code>, scopes, plugin system via <code>compose()</code>.</li>
      <li><strong>Orchid ORM</strong> — "Data Mapper for PostgreSQL" on custom <code>pqb</code>. Nested relation selects, <code>chain()</code> cross-relation queries, computed columns, repository pattern, lifecycle hooks with column requirements, mutation safety guards.</li>
    </ul>
  </div>
  <hr>
  <p style="text-align:center;color:#888;font-size:0.9em;">Generated from analysis of official documentation and source code · June 2026</p>
</div>
</body>
</html>
INDEXEOF
echo "✅ Created: index.html"
