const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const php = process.env.PHP_BIN || 'php';
const site = path.resolve(__dirname, '..');
const sessions = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'simfer-request-sessions-'));
const harness = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'simfer-request-harness-'));
fs.mkdirSync(sessions, { recursive: true });
fs.mkdirSync(harness, { recursive: true });
const source = fs.readFileSync(path.join(site, 'request.php'), 'utf8');
// mail() is disabled in both servers. Only this isolated fixture defines a fake.
const fakeMail = `
function mail($to, $subject, $body, $headers): bool {
    if ($to !== 'info@simfer.com.ru' || $headers['From'] !== 'no-reply@simfer.com.ru'
        || $headers['Reply-To'] !== 'buyer@example.com'
        || $headers['Content-Type'] !== 'text/plain; charset=UTF-8'
        || $headers['Content-Transfer-Encoding'] !== 'base64'
        || !str_contains(base64_decode($body), 'Тестовая спецификация')) {
        throw new RuntimeException('Unexpected mail arguments in test');
    }
    return true;
}
`;
fs.writeFileSync(path.join(harness, 'request.php'), source.replace('declare(strict_types=1);', 'declare(strict_types=1);' + fakeMail));

function startServer(root, port) {
  const server = spawn(php, ['-n', '-d', 'disable_functions=mail', '-d', `session.save_path=${sessions}`, '-S', `127.0.0.1:${port}`, '-t', root], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  server.stdout.on('data', (data) => { output += data; });
  server.stderr.on('data', (data) => { output += data; });
  server.on('error', (error) => { output += error.message; });
  return { server, output: () => output };
}

async function ready(url, process) {
  for (let index = 0; index < 40; index++) {
    if (process.server.exitCode !== null) throw new Error(process.output());
    try { await fetch(url); return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('PHP test server did not start: ' + process.output());
}

function client(base) {
  let cookie = '';
  return async (method = 'GET', data = null, json = true, extras = {}) => {
    const headers = { Accept: json ? 'application/json' : 'text/html', ...extras };
    if (cookie) headers.Cookie = cookie;
    if (data) headers['Content-Type'] = 'application/x-www-form-urlencoded';
    const response = await fetch(base + '/request.php', { method, headers, body: data ? new URLSearchParams(data) : undefined });
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    return { status: response.status, headers: response.headers, text: await response.text() };
  };
}

(async () => {
  const normal = startServer(site, 18873);
  const success = startServer(harness, 18874);
  try {
    await Promise.all([ready('http://127.0.0.1:18873/request.php', normal), ready('http://127.0.0.1:18874/request.php', success)]);
    const call = client('http://127.0.0.1:18873');
    const first = await call();
    assert.equal(first.status, 200);
    const csrf = JSON.parse(first.text).csrf;
    assert.match(csrf, /^[a-f0-9]{64}$/);
    assert.match(first.headers.get('cache-control'), /no-store/);
    assert.match(first.headers.get('x-robots-tag'), /noindex/);
    assert.equal(first.headers.get('x-content-type-options'), 'nosniff');
    assert.match(first.headers.get('set-cookie'), /HttpOnly/i);
    assert.match(first.headers.get('set-cookie'), /SameSite=Lax/i);
    assert.equal(JSON.parse((await call()).text).csrf, csrf);
    const secure = await client('http://127.0.0.1:18873')('GET', null, true, { 'X-Forwarded-Proto': 'https' });
    assert.match(secure.headers.get('set-cookie'), /; secure/i);
    const htmlGet = await call('GET', null, false);
    assert.equal(htmlGet.status, 200);
    assert.match(htmlGet.text, /\/assets\/site.css/);
    assert.match(htmlGet.text, /ym-disable-keys/);

    const valid = { csrf, company: 'Компания', email: 'buyer@example.com', message: 'Тестовая спецификация оборудования', consent: '1', website: '' };
    const noCsrf = await call('POST', { ...valid, csrf: '', company: '<script>alert(1)</script>' }, false);
    assert.equal(noCsrf.status, 403);
    assert.match(noCsrf.text, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.match(noCsrf.text, /Тестовая спецификация оборудования/);
    assert.match(noCsrf.text, new RegExp(`name="csrf" value="${csrf}"`));
    assert.match(noCsrf.text, /повторите отправку/);
    assert.equal((await call('POST', { ...valid, csrf: 'b'.repeat(64) })).status, 403);
    assert.equal((await call('POST', { ...valid, email: 'not-email' })).status, 422);
    const arrayData = new URLSearchParams(valid);
    arrayData.delete('email');
    arrayData.set('email[]', 'buyer@example.com');
    assert.equal((await call('POST', arrayData)).status, 422);
    assert.equal((await call('POST', { ...valid, email: 'buyer@example.com\r\nBcc: x@example.com' })).status, 422);
    assert.equal((await call('POST', { ...valid, website: 'bot.example' })).status, 422);
    assert.equal((await call('POST', { ...valid, consent: '' })).status, 422);
    assert.equal((await call('POST', { ...valid, message: 'short' })).status, 422);
    assert.equal((await call('POST', { ...valid, message: 'x'.repeat(10001) })).status, 422);
    assert.equal((await call('POST', { ...valid, company: 'я'.repeat(201) })).status, 422);
    assert.equal((await call('POST', { ...valid, message: 'x'.repeat(70000) })).status, 413);
    assert.equal((await call('PUT')).status, 405);
    const failure = await call('POST', valid);
    assert.equal(failure.status, 503);
    assert.equal(JSON.parse(failure.text).ok, false);
    assert.match(JSON.parse(failure.text).message, /info@simfer.com.ru/);
    const rate = await call('POST', valid);
    assert.equal(rate.status, 429);
    assert.ok(Number(rate.headers.get('retry-after')) > 0);

    const happy = client('http://127.0.0.1:18874');
    const happyToken = JSON.parse((await happy()).text).csrf;
    const accepted = await happy('POST', { ...valid, csrf: happyToken });
    assert.equal(accepted.status, 200);
    assert.equal(JSON.parse(accepted.text).ok, true);
    assert.match(JSON.parse(accepted.text).message, /не подтверждает доставку/);
    console.log('PASS: HTTP token/cache/cookies, secure proxy cookie, HTML fallback+escaping+preserved values, CSRF, invalid email+array+CRLF, honeypot, consent, min/max length, company length, oversize413, method405, disabled mail503, rate429, isolated fake-mail success200+headers+UTF8 body. No real mail sent.');
  } finally {
    normal.server.kill();
    success.server.kill();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
