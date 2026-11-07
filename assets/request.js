(() => {
  'use strict';

  document.querySelectorAll('form.request-form').forEach((form) => {
    const endpoint = '/request.php';
    let status = form.querySelector('[role="status"]');
    if (!status) {
      status = document.createElement('p');
      status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'polite');
      status.tabIndex = -1;
      form.append(status);
    }
    let csrf = form.querySelector('input[name="csrf"]');
    if (!csrf) {
      csrf = document.createElement('input');
      csrf.type = 'hidden';
      csrf.name = 'csrf';
      form.append(csrf);
    }

    const show = (message, state = 'error') => {
      status.textContent = message;
      status.setAttribute('data-state', state);
    };

    const loadToken = async () => {
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
        cache: 'no-store',
      });
      const data = await response.json();
      if (!response.ok || typeof data.csrf !== 'string' || !/^[a-f0-9]{64}$/.test(data.csrf)) {
        throw new Error('csrf');
      }
      csrf.value = data.csrf;
    };

    let tokenReady = loadToken().then(() => true).catch(() => false);
    let submitting = false;

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (submitting || !form.reportValidity()) return;
      submitting = true;
      const buttons = Array.from(form.querySelectorAll('button[type="submit"], button:not([type]), input[type="submit"]'));
      const disabled = buttons.map((button) => button.disabled);
      buttons.forEach((button) => { button.disabled = true; });
      form.setAttribute('aria-busy', 'true');
      show('Отправляем запрос…', 'pending');
      let postStarted = false;
      try {
        if (!(await tokenReady)) {
          tokenReady = loadToken().then(() => true).catch(() => false);
          if (!(await tokenReady)) throw new Error('csrf');
        }
        // Take the current values after loading the token; never clear data on errors.
        const body = new FormData(form);
        postStarted = true;
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { Accept: 'application/json' },
          credentials: 'same-origin',
          cache: 'no-store',
          body,
        });
        const data = await response.json();
        if (typeof data.message !== 'string' || typeof data.ok !== 'boolean') {
          throw new Error('response');
        }
        show(data.message, response.ok && data.ok ? 'success' : 'error');
        if (response.ok && data.ok) {
          const token = csrf.value;
          form.reset();
          csrf.value = token;
        } else if (response.status === 403) {
          tokenReady = loadToken().then(() => true).catch(() => false);
        }
      } catch (error) {
        show(postStarted
          ? 'Не удалось получить подтверждение отправки. Письмо могло быть принято сервером. Текст сохранён; уточните результат по info@simfer.com.ru или +7 (978) 579-29-95.'
          : 'Не удалось подготовить форму. Текст сохранён. Обновите страницу или откройте /request.php; также можно написать на info@simfer.com.ru.');
      } finally {
        submitting = false;
        form.removeAttribute('aria-busy');
        buttons.forEach((button, index) => { button.disabled = disabled[index]; });
      }
    });
  });
})();
