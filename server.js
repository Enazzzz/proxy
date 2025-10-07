const express = require('express');
const puppeteer = require('puppeteer');
const url = require('url');

const app = express();
const PORT = process.env.PORT || 8080;

// === CONFIG ===
// Allowed hosts - change to your own domains ONLY for safety
const ALLOWED_HOSTS = [
  'your-site.example',
  'localhost'
];

// Optional Basic Auth (set via env vars on Render)
const BASIC_AUTH_USER = process.env.BASIC_USER || '';
const BASIC_AUTH_PASS = process.env.BASIC_PASS || '';

// Helper to check if target URL host is allowed
function isAllowedTarget(targetUrl) {
  try {
    const u = new URL(targetUrl);
    return ALLOWED_HOSTS.includes(u.hostname);
  } catch (e) {
    return false;
  }
}

// Basic Auth middleware (optional)
function basicAuth(req, res, next) {
  if (!BASIC_AUTH_USER) return next(); // disabled if no env var set
  const auth = req.headers.authorization;
  if (!auth) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Restricted"');
    return res.status(401).send('Authentication required');
  }
  const match = auth.match(/^Basic\s+(.+)$/);
  if (!match) return res.status(401).send('Authentication required');
  const creds = Buffer.from(match[1], 'base64').toString().split(':');
  if (creds[0] === BASIC_AUTH_USER && creds[1] === BASIC_AUTH_PASS) return next();
  res.setHeader('WWW-Authenticate', 'Basic realm="Restricted"');
  return res.status(401).send('Invalid credentials');
}

// Serve the UI page
app.get('/', basicAuth, (req, res) => {
  const target = req.query.target || 'https://your-site.example/';
  if (!isAllowedTarget(target)) {
    return res.status(400).send('Target not allowed. Update ALLOWED_HOSTS.');
  }
  const encoded = encodeURIComponent(target);
  res.send(`<!doctype html>
  <html>
    <head>
      <meta charset="utf-8"/>
      <title>Embedded Viewer</title>
      <style>
        body{font-family:Arial,sans-serif;margin:0;display:flex;flex-direction:column;height:100vh;}
        header{background:#0b5cff;color:#fff;padding:10px;display:flex;align-items:center;gap:8px;}
        #controls{margin-left:auto;}
        .btn{padding:8px 10px;border-radius:6px;border:none;background:#fff;color:#0b5cff;cursor:pointer;}
        #viewport{flex:1;display:flex;align-items:center;justify-content:center;background:#222;}
        img{max-width:100%;max-height:100%;}
      </style>
    </head>
    <body>
      <header>
        <div>Embedded Viewer</div>
        <div id="controls">
          <button class="btn" id="back">Back</button>
          <button class="btn" id="forward">Forward</button>
          <button class="btn" id="refresh">Refresh</button>
          <button class="btn" id="open">Open in new tab</button>
        </div>
      </header>
      <div id="viewport">
        <img id="shot" src="/screenshot?url=${encoded}&_t=${Date.now()}" alt="screenshot"/>
      </div>
      <script>
        const target = "${target}";
        const shot = document.getElementById('shot');
        document.getElementById('refresh').addEventListener('click', ()=> {
          shot.src = '/screenshot?url=' + encodeURIComponent(target) + '&_t=' + Date.now();
        });
        document.getElementById('open').addEventListener('click', ()=> window.open(target,'_blank','noopener'));
        // Back and forward not implemented for screenshot proxy
        document.getElementById('back').addEventListener('click', ()=> alert('Back not implemented.'));
        document.getElementById('forward').addEventListener('click', ()=> alert('Forward not implemented.'));
      </script>
    </body>
  </html>`);
});

// Screenshot endpoint
app.get('/screenshot', basicAuth, async (req, res) => {
  const target = req.query.url;
  if (!target || !isAllowedTarget(target)) {
    return res.status(400).send('Invalid or disallowed target');
  }

  let browser;
  try {
    browser = await puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      headless: 'new',
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto(target, { waitUntil: 'networkidle2', timeout: 15000 });
    const buffer = await page.screenshot({ fullPage: false, type: 'png' });
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'no-store');
    res.send(buffer);
  } catch (err) {
    console.error('Screenshot error:', err.message || err);
    res.status(500).send('Failed to capture screenshot');
  } finally {
    if (browser) await browser.close();
  }
});

app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
