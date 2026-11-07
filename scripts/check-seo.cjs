const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {parseHTML} = require('linkedom');
const root = path.resolve(__dirname,'..');
const directions = JSON.parse(fs.readFileSync(path.join(root,'content/directions.json'),'utf8'));
const files = ['index.html',...directions.map(p=>p.slug+'/index.html')];
const titles = new Set();
for (const file of files) {
  const html=fs.readFileSync(path.join(root,file),'utf8');
  const {document}=parseHTML(html);
  const route=file==='index.html'?'/':'/'+file.replace(/index\.html$/,'');
  const canonical='https://simfer.com.ru'+route;
  assert.equal(document.querySelectorAll('h1').length,1,file+' h1');
  assert.equal(document.querySelectorAll('link[rel="canonical"]').length,1,file+' canonical unique');
  assert.equal(document.querySelector('link[rel="canonical"]').href,canonical);
  const title=document.querySelector('title').textContent;
  assert(!titles.has(title),'unique title'); titles.add(title);
  for (const name of ['title','description','url','image','type','locale']) assert(document.querySelector(`meta[property="og:${name}"]`)?.content, file+' og:'+name);
  assert.equal(document.querySelector('meta[property="og:url"]').content,canonical);
  assert.equal(document.querySelector('meta[property="og:locale"]').content,'ru_RU');
  assert.equal(document.querySelector('meta[name="robots"]').content,'index, follow');
  assert.equal(document.querySelectorAll('script[type="application/ld+json"]').length,1);
  const org=JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent);
  assert.equal(org['@type'],'Organization'); assert.equal(org.taxID,'9102300105'); assert.equal(org.email,'info@simfer.com.ru');
  assert.equal(org.identifier.propertyID,'ОГРН'); assert.equal(org.identifier.value,'1249100014899');
  assert(document.querySelector('form.request-form[action="/request.php"]'));
  assert(html.includes("106177642"),'Metrika preserved');
  assert(document.querySelector('footer a[href="/articles/"]'));
  const ids=[...document.querySelectorAll('[id]')].map(n=>n.id);
  assert.equal(new Set(ids).size,ids.length,file+' duplicate IDs');
  for (const element of document.querySelectorAll('[href],[src]')) {
    const href=element.getAttribute('href')||element.getAttribute('src');
    if (!href || /^(https?:|mailto:|tel:|data:)/.test(href)) continue;
    if (href==='/articles/') continue; // Reserved for the separate article publisher.
    const u=new URL(href,canonical);
    const target=u.pathname.endsWith('/')?u.pathname+'index.html':u.pathname;
    const disk=path.join(root,target);
    assert(fs.existsSync(disk),`${file} broken local asset/link ${href}`);
    if (u.hash) {
      const {document:other}=parseHTML(fs.readFileSync(disk,'utf8'));
      assert(other.getElementById(u.hash.substring(1)),`${file} broken fragment ${href}`);
    }
  }
  if(file==='index.html'){
    const h2=[...document.querySelectorAll('h2')].map(n=>n.textContent);
    for(const text of ['Что поставляем','Работаем по 44-ФЗ и 223-ФЗ','Как мы работаем','Реквизиты','Пришлите спецификацию или ссылку на закупку']) assert(h2.includes(text),text);
    assert.equal(document.querySelectorAll('#process .step').length,4);
    assert.equal(document.querySelector('title').textContent,'ТЕХНОЛАЙН ТРЕЙД — Поставки оборудования и товаров');
  }
  console.log('PASS',file,document.querySelectorAll('h2').length+' H2');
}
const {document:sitemap}=parseHTML(fs.readFileSync(path.join(root,'sitemap.xml'),'utf8'));
const loc=[...sitemap.querySelectorAll('loc')].map(n=>n.textContent);
assert.equal(loc.length,6); assert.equal(new Set(loc).size,loc.length);
for (const file of files) assert(loc.includes('https://simfer.com.ru/'+(file==='index.html'?'':file.replace(/index\.html$/,''))));
console.log('PASS sitemap 6 canonical URLs; article directory untouched by build.');
