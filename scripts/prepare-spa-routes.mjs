import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(projectRoot, 'dist');
const sourcePath = path.join(distDir, 'index.html');

const routes = [
  {
    path: 'episodes/',
    title: 'Episodes | Black Bridge Mindset',
    description: 'Watch and listen to Black Bridge Mindset episodes featuring conversations about culture, entrepreneurship, and business.',
  },
  {
    path: 'podcast/',
    title: 'Listen | Black Bridge Mindset',
    description: 'Listen to the Black Bridge Mindset podcast, where culture, entrepreneurship, and business intersect to fuel inspiration.',
  },
  {
    path: 'trio/',
    title: 'Meet the Trio | Black Bridge Mindset',
    description: 'Meet Mike Lovett, Chris Johnson, and Ken Peak, the hosts of the Black Bridge Mindset podcast.',
  },
  {
    path: 'contact/',
    title: 'Contact | Black Bridge Mindset',
    description: 'Contact Black Bridge Mindset to connect, collaborate, suggest a guest, or share your story.',
  },
  {
    path: 'admin/',
    title: 'Admin | Black Bridge Mindset',
    description: 'Black Bridge Mindset administration.',
    indexable: false,
  },
  {
    path: 'schedule/cancel/',
    title: 'Cancel Booking | Black Bridge Mindset',
    description: 'Manage a Black Bridge Mindset recording booking.',
    indexable: false,
  },
  {
    path: 'schedule/reschedule/',
    title: 'Reschedule Booking | Black Bridge Mindset',
    description: 'Manage a Black Bridge Mindset recording booking.',
    indexable: false,
  },
  {
    path: 'schedule/admin/',
    title: 'Admin | Black Bridge Mindset',
    description: 'Black Bridge Mindset administration.',
    indexable: false,
  },
  {
    path: 'bbm/podcast/',
    title: 'Listen | Black Bridge Mindset',
    description: 'The Black Bridge Mindset podcast.',
    canonicalPath: 'podcast/',
    indexable: false,
  },
];

function escapeAttribute(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function replaceMeta(html, attribute, value) {
  const pattern = new RegExp(`(<meta\\s+${attribute}\\s+content=")[^"]*(")`, 'i');
  return html.replace(pattern, `$1${escapeAttribute(value)}$2`);
}

const template = await readFile(sourcePath, 'utf8');

for (const route of routes) {
  const routePath = route.path;
  const canonicalPath = route.canonicalPath || routePath;
  const canonicalUrl = `https://blackbridgemindset.com/${canonicalPath}`;
  const routeHtml = template
    .replace(/<title>[\\s\\S]*?<\\/title>/i, `<title>${escapeAttribute(route.title)}</title>`)
    .replace(/<link rel="canonical" href="[^"]*"\\s*\\/>/i, `<link rel="canonical" href="${canonicalUrl}" />`)
    .replace(/(<meta name="robots" content=")[^"]*(")/i, `$1${route.indexable === false ? 'noindex, nofollow' : 'index, follow'}$2`);
  
  const withMeta = [
    ['name="description"', route.description],
    ['property="og:url"', canonicalUrl],
    ['property="og:title"', route.title],
    ['property="og:description"', route.description],
    ['property="twitter:url"', canonicalUrl],
    ['property="twitter:title"', route.title],
    ['property="twitter:description"', route.description],
  ].reduce((html, [attribute, value]) => replaceMeta(html, attribute, value), routeHtml);

  const targetPath = path.join(distDir, routePath, 'index.html');
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, withMeta);
}

console.log(`Prepared ${routes.length} GitHub Pages route entry points.`);
