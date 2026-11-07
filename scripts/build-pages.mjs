import fs from 'node:fs';
import path from 'node:path';
import { root, site, directions, escape, write, seo, form, requisites, directionsMenu } from './site.mjs';

let home = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const title = home.match(/<title>([^<]+)<\/title>/)[1];
const description = home.match(/<meta name="description" content="([^"]+)"/)[1];
home = home.replace(/\s*<!-- SEO:START -->[\s\S]*?<!-- SEO:END -->/, '');
home = home.replace('</head>', `  ${seo(title, description, '/')}\n</head>`);
home = home.replace(/<!-- REQUISITES:START -->[\s\S]*?<!-- REQUISITES:END -->/, `<!-- REQUISITES:START -->${requisites()}<!-- REQUISITES:END -->`);
write('index.html', home);
const tracking = home.match(/<!-- Yandex\.Metrika counter -->[\s\S]*?<!-- \/Yandex\.Metrika counter -->/)[0];
const pixel = home.match(/<noscript>[\s\S]*?<\/noscript>/)[0];

for (const page of directions) {
  const body = page.sections.map(section => `<section class="seo-prose"><h2>${escape(section.heading)}</h2>${section.paragraphs.map(p => `<p>${escape(p)}</p>`).join('')}${section.items.length ? `<ul>${section.items.map(item => `<li>${escape(item)}</li>`).join('')}</ul>` : ''}</section>`).join('\n');
  write(`${page.slug}/index.html`, `<!DOCTYPE html>
<html lang="ru"><head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escape(page.title)}</title><meta name="description" content="${escape(page.description)}">
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/assets/site.css"><link rel="stylesheet" href="/assets/seo.css">
  ${seo(page.title, page.description, `/${page.slug}/`)}
  ${tracking}
</head><body>${pixel}<div class="page-wrap">
  <header><div class="container"><div class="header-inner">
    <a class="logo-block" href="/" aria-label="ТЕХНОЛАЙН ТРЕЙД — главная"><span class="logo-mark"><img src="/logo.png" alt="" width="44" height="44"></span><span>ТЕХНОЛАЙН ТРЕЙД</span></a>
    <nav aria-label="Основное меню"><a href="/">Главная</a>${directionsMenu()}<a href="/#requisites">Реквизиты</a><a href="#request">Отправить запрос</a></nav>
    <a href="tel:+79785792995">${site.telephone}</a>
  </div></div></header>
  <main><div class="container"><div class="landing-hero"><p class="breadcrumb"><a href="/">Главная</a> / Направления</p><h1>${escape(page.h1)}</h1><p>${escape(page.intro)}</p><a class="btn request-submit" href="#request">Запросить предложение</a></div><div class="landing-content">${body}<nav class="direction-links" aria-label="Другие направления">${directions.filter(item => item.slug !== page.slug).map(item => `<a href="/${item.slug}/">${escape(item.title.split(' | ')[0])}</a>`).join('')}</nav></div></div>${form()}</main>
  <footer><div class="container"><div class="footer-inner"><span>© ${new Date().getFullYear()} ${escape(site.legalName)}</span><div class="footer-links"><a href="/articles/">Статьи</a><a href="/#requisites">Реквизиты и контакты</a></div></div></div></footer>
</div><script src="/assets/request.js" defer></script></body></html>\n`);
}
console.log('Built homepage SEO and 5 direction pages. articles/ was not modified.');
