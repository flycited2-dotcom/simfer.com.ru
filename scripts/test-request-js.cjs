const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const code = fs.readFileSync(require('node:path').join(__dirname, '../assets/request.js'), 'utf8');
const token = 'a'.repeat(64);
const response = (status, data) => ({ ok: status >= 200 && status < 300, status, json: async () => data });

function setup(fetchImplementation) {
  const fields = { csrf: { value: '' }, message: { value: 'Исходная спецификация' } };
  const button = { disabled: false };
  const status = { textContent: '', attributes: {}, setAttribute(key, value) { this.attributes[key] = value; } };
  const attributes = {};
  let submit;
  let resets = 0;
  let valid = true;
  const calls = [];
  const form = {
    querySelector: (selector) => selector === '[role="status"]' ? status : fields.csrf,
    querySelectorAll: () => [button],
    addEventListener: (event, listener) => { submit = listener; },
    setAttribute: (key, value) => { attributes[key] = value; },
    removeAttribute: (key) => { delete attributes[key]; },
    reportValidity: () => valid,
    reset: () => { resets++; fields.message.value = ''; fields.csrf.value = ''; },
  };
  vm.runInNewContext(code, {
    document: { querySelectorAll: () => [form] },
    fetch: async (url, options) => { calls.push({ url, ...options }); return fetchImplementation(url, options); },
    FormData: class { constructor() { this.message = fields.message.value; this.csrf = fields.csrf.value; } },
  });
  return {
    fields, button, status, attributes, calls,
    get resets() { return resets; },
    setValid(value) { valid = value; },
    submit: () => submit({ preventDefault() {} }),
  };
}

(async () => {
  const success = setup(async (_, options) => options.method === 'GET'
    ? response(200, { csrf: token }) : response(200, { ok: true, message: 'Письмо передано серверу.' }));
  await success.submit();
  assert.equal(success.calls.length, 2);
  assert.equal(success.calls[1].body.csrf, token);
  assert.equal(success.calls[1].body.message, 'Исходная спецификация');
  assert.equal(success.resets, 1);
  assert.equal(success.fields.csrf.value, token);
  assert.equal(success.button.disabled, false);
  assert.equal(success.attributes['aria-busy'], undefined);
  assert.equal(success.status.attributes['data-state'], 'success');

  const failure = setup(async (_, options) => options.method === 'GET'
    ? response(200, { csrf: token }) : response(503, { ok: false, message: 'Сервер не принял письмо.' }));
  await failure.submit();
  assert.equal(failure.fields.message.value, 'Исходная спецификация');
  assert.equal(failure.resets, 0);
  assert.equal(failure.status.textContent, 'Сервер не принял письмо.');
  assert.equal(failure.status.attributes['data-state'], 'error');

  const csrfFailure = setup(async (_, options) => options.method === 'GET'
    ? response(200, { csrf: token }) : response(403, { ok: false, message: 'Повторите отправку.' }));
  await csrfFailure.submit();
  assert.equal(csrfFailure.calls.filter((call) => call.method === 'POST').length, 1);
  assert.equal(csrfFailure.calls.filter((call) => call.method === 'GET').length, 2);
  assert.equal(csrfFailure.resets, 0);

  const noToken = setup(async () => response(503, { ok: false, message: 'Нет сессии.' }));
  await noToken.submit();
  assert.equal(noToken.calls.filter((call) => call.method === 'POST').length, 0);
  assert.equal(noToken.fields.message.value, 'Исходная спецификация');
  assert.match(noToken.status.textContent, /Не удалось подготовить/);

  const connection = setup(async (_, options) => {
    if (options.method === 'GET') return response(200, { csrf: token });
    throw new Error('network');
  });
  await connection.submit();
  assert.match(connection.status.textContent, /могло быть принято/);
  assert.equal(connection.resets, 0);
  assert.equal(connection.button.disabled, false);

  let finishPost;
  const duplicate = setup(async (_, options) => {
    if (options.method === 'GET') return response(200, { csrf: token });
    return await new Promise((resolve) => { finishPost = resolve; });
  });
  const first = duplicate.submit();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(duplicate.button.disabled, true);
  assert.equal(duplicate.status.attributes['data-state'], 'pending');
  await duplicate.submit();
  assert.equal(duplicate.calls.filter((call) => call.method === 'POST').length, 1);
  finishPost(response(200, { ok: true, message: 'Принято сервером.' }));
  await first;

  const invalid = setup(async () => response(200, { csrf: token }));
  invalid.setValid(false);
  await invalid.submit();
  assert.equal(invalid.calls.filter((call) => call.method === 'POST').length, 0);
  console.log('PASS: 7 scenarios — success, mail failure, CSRF refresh, CSRF unavailable, network failure, duplicate submit, invalid form.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
