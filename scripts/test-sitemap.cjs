const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const php = process.env.PHP_BIN || 'php';
const source = path.resolve(__dirname, '../tools/update-sitemap.php');
const root = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'simfer-sitemap-test-'));
const write = (name, text) => { const p = path.join(root, name); fs.mkdirSync(path.dirname(p), {recursive: true}); fs.writeFileSync(p, text); };
const page = (head = '') => `<html><head>${head}</head><body>Fixture article must stay unchanged.</body></html>`;
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const run = (...options) => cp.spawnSync(php, ['-n', ...options, path.join(root, 'tools/update-sitemap.php')], {encoding: 'utf8'});
write('tools/update-sitemap.php', fs.readFileSync(source));
write('index.html', page('<link rel="canonical" href="https://simfer.com.ru/">'));
write('articles/index.html', page());
write('articles/example.html', page('<META CONTENT="INDEX, FOLLOW" NAME="ROBOTS">'));
write('articles/с & x.html', page());
write('articles/private.html', page("<META content='NOINDEX, follow' NaMe='RoBoTs'>"));
write('articles/private2.html', page('<meta content=noindex name=robots>'));
write('articles/private3.html', page('<meta name="robots" content="&#110;oindex">'));
write('articles/not-canonical.html', page('<link href="https://evil.example/articles/not-canonical.html" REL="canonical">'));
write('articles/duplicate.html', page('<link rel="canonical" href="https://simfer.com.ru/articles/example.html">'));
write('articles/comments.html', page('<!-- <meta name="robots" content="noindex"> --><script>const sample = \'<meta name="robots" content="noindex">\';</script>'));
write('nested/child/index.html', page("<link href='https://simfer.com.ru/nested/child/' rel='canonical'>"));
write('.hidden.html', page());
write('request.php', page());
for (const folder of ['archive', 'assets', 'docs', 'scripts', 'content', 'tools', '.private', 'articles/assets']) write(`${folder}/excluded.html`, page());
fs.symlinkSync(path.join(root, 'articles'), path.join(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
const articleFiles = fs.readdirSync(path.join(root, 'articles')).filter(n => n.endsWith('.html'));
const originalHashes = new Map(articleFiles.map(n => [n, hash(fs.readFileSync(path.join(root, 'articles', n)))]));
const first = run();
assert.equal(first.status, 0, first.stderr);
assert.match(first.stdout, /6 URLs written/);
assert.match(first.stderr, /Skipped mismatched canonical/);
const xmlPath = path.join(root, 'sitemap.xml');
const firstXml = fs.readFileSync(xmlPath, 'utf8');
const urls = [...firstXml.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => m[1]);
assert.deepEqual(urls, [
  'https://simfer.com.ru/',
  'https://simfer.com.ru/articles/',
  'https://simfer.com.ru/articles/%D1%81%20%26%20x.html',
  'https://simfer.com.ru/articles/comments.html',
  'https://simfer.com.ru/articles/example.html',
  'https://simfer.com.ru/nested/child/',
].sort());
assert.equal(new Set(urls).size, urls.length);
assert.doesNotMatch(firstXml, /lastmod|private|excluded|linked|duplicate|request\.php/);
for (const [name, expected] of originalHashes) assert.equal(hash(fs.readFileSync(path.join(root, 'articles', name))), expected);
assert.equal(run().status, 0);
assert.equal(fs.readFileSync(xmlPath, 'utf8'), firstXml);
// Failure after the temporary XML has been fully written must leave the old map intact.
const failure = run('-d', 'disable_functions=rename');
assert.notEqual(failure.status, 0);
assert.match(failure.stderr, /rename/);
assert.equal(fs.readFileSync(xmlPath, 'utf8'), firstXml);
assert.equal(fs.readdirSync(root).filter(n => n.startsWith('.sitemap-')).length, 0);

async function parallelRun() {
  return new Promise((resolve, reject) => {
    const child = cp.spawn(php, ['-n', path.join(root, 'tools/update-sitemap.php')]);
    let stderr = '';
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(stderr)));
  });
}

(async () => {
  await Promise.all([parallelRun(), parallelRun()]);
  assert.equal(fs.readFileSync(xmlPath, 'utf8'), firstXml);
  const net = require('node:net');
  const port = await new Promise(resolve => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)); });
  });
  fs.writeFileSync(xmlPath, 'WEB_SENTINEL');
  const server = cp.spawn(php, ['-n', '-S', `127.0.0.1:${port}`, '-t', root], {stdio: 'ignore'});
  try {
    let response;
    for (let attempt = 0; attempt < 30; attempt++) {
      try { response = await fetch(`http://127.0.0.1:${port}/tools/update-sitemap.php`); break; }
      catch { await new Promise(resolve => setTimeout(resolve, 50)); }
    }
    assert(response, 'PHP built-in server did not start');
    assert.equal(response.status, 404);
    assert.equal(await response.text(), '');
    assert.equal(fs.readFileSync(xmlPath, 'utf8'), 'WEB_SENTINEL');
  } finally {
    server.kill();
  }
  for (const [name, expected] of originalHashes) assert.equal(hash(fs.readFileSync(path.join(root, 'articles', name))), expected);
  console.log('PASS: recursive URLs, UTF-8/ampersand encoding, canonical validation, noindex attributes/case/entities, ignored comments/scripts, exclusions, symlink skip, unchanged articles, repeat runs, concurrent lock, atomic failure cleanup, HTTP 404 without writes.');
  console.log(`Sandbox retained for inspection: ${root}`);
})().catch(error => { console.error(error); process.exitCode = 1; });
