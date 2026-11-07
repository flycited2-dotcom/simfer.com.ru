import fs from 'node:fs';
import path from 'node:path';
import { root, directions } from './site.mjs';

// An additive release never contains the independent publisher's articles/.
const target = fs.mkdtempSync(path.resolve(root, '..', 'simfer-seo-release-'));
const entries = ['.htaccess','index.html','robots.txt','sitemap.xml','request.php','logo.png','photo_2024-10-22_18-58-20.jpg','assets','tools',...directions.map(page => page.slug)];
fs.mkdirSync(target, {recursive:true});
for (const entry of entries) {
  fs.cpSync(path.join(root,entry),path.join(target,entry),{recursive:true});
}
console.log(target);
