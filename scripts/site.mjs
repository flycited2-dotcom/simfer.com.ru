import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const site = JSON.parse(fs.readFileSync(path.join(root, 'content/site.json'), 'utf8'));
export const directions = JSON.parse(fs.readFileSync(path.join(root, 'content/directions.json'), 'utf8'));
export const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export const write = (file, text) => {
  const target = path.join(root, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, text, 'utf8');
};

export function organization() {
  const schema = {
    '@context': 'https://schema.org', '@type': 'Organization',
    '@id': `${site.url}/#organization`, name: site.name, legalName: site.legalName,
    url: `${site.url}/`, logo: `${site.url}/logo.png`, taxID: site.inn,
    telephone: site.telephone, email: site.email,
    address: { '@type': 'PostalAddress', ...site.address }
  };
  if (site.ogrn) schema.identifier = { '@type': 'PropertyValue', propertyID: 'ОГРН', value: site.ogrn };
  return schema;
}

export function seo(title, description, route) {
  const url = site.url + route;
  return `<!-- SEO:START -->
  <link rel="canonical" href="${escape(url)}">
  <meta name="robots" content="index, follow">
  <meta property="og:title" content="${escape(title)}">
  <meta property="og:description" content="${escape(description)}">
  <meta property="og:url" content="${escape(url)}">
  <meta property="og:image" content="${site.url}/logo.png">
  <meta property="og:image:alt" content="Логотип ТЕХНОЛАЙН ТРЕЙД">
  <meta property="og:type" content="website">
  <meta property="og:locale" content="ru_RU">
  <meta property="og:site_name" content="${escape(site.name)}">
  <script type="application/ld+json">${JSON.stringify(organization()).replace(/</g, '\\u003c')}</script>
  <!-- SEO:END -->`;
}

export function directionsMenu() {
  return `<details class="directions-menu"><summary>Направления</summary><div class="directions-dropdown">${directions.map(item => `<a href="/${item.slug}/">${escape(item.h1)}</a>`).join('')}</div></details>`;
}

export function form() {
  return `<section id="request" class="request-section"><div class="container">
    <div class="request-layout"><div>
      <p class="section-kicker">Запрос на поставку</p>
      <h2 class="section-title">Пришлите спецификацию или ссылку на закупку</h2>
      <p>Укажите товары, количество, характеристики и адрес получения — подготовим коммерческое предложение. Спецификацию можно вставить в поле сообщения или прислать ссылкой.</p>
      <p class="request-alternative">Файл можно отправить по почте: <a href="mailto:${site.email}">${site.email}</a>.<br>Телефон: <a href="tel:+79785792995">${site.telephone}</a>.</p>
    </div>
    <form class="request-form ym-disable-keys" action="/request.php" method="post">
      <label>Организация <span class="field-hint">(необязательно)</span><input name="company" autocomplete="organization" maxlength="200"></label>
      <label>Ваш email<input type="email" name="email" autocomplete="email" maxlength="254" required></label>
      <label>Спецификация или ссылка на закупку<textarea name="message" minlength="10" maxlength="10000" rows="6" required placeholder="Что нужно поставить, количество, характеристики, адрес. Или ссылка на закупку."></textarea></label>
      <div class="form-trap" aria-hidden="true"><label>Не заполняйте это поле<input name="website" tabindex="-1" autocomplete="off"></label></div>
      <input type="hidden" name="csrf" value="">
      <label class="consent"><input type="checkbox" name="consent" value="1" required><span>Разрешаю использовать указанный email и сведения из заявки для ответа на мой запрос.</span></label>
      <p class="field-hint">Не включайте в заявку сведения, которые не нужны для обсуждения поставки.</p>
      <button class="btn request-submit" type="submit">Запросить коммерческое предложение</button>
      <p class="form-status" role="status" aria-live="polite"></p>
      <noscript><p>Для отправки без JavaScript <a href="/request.php">откройте форму запроса</a>.</p></noscript>
    </form></div>
  </div></section>`;
}

export function requisites() {
  const rows = [['Организация', site.legalName], ['ИНН', site.inn], ['Город', site.address.addressLocality]];
  if (site.ogrn) rows.push(['ОГРН', site.ogrn]);
  if (site.address.streetAddress) rows.push(['Адрес', [site.address.postalCode, site.address.addressLocality, site.address.streetAddress].filter(Boolean).join(', ')]);
  rows.push(['Телефон', site.telephone], ['Email', site.email]);
  return `<section id="requisites"><div class="container"><h2 class="section-title">Реквизиты</h2><dl class="requisites">${rows.map(([label,value]) => `<div><dt>${escape(label)}</dt><dd>${escape(value)}</dd></div>`).join('')}</dl></div></section>`;
}
