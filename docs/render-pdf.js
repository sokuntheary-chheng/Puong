/* Render a Markdown document to an A4 PDF with the project print stylesheet. */
const fs = require('fs');
const path = require('path');

/* puppeteer and marked are deliberately not committed to this repository;
   install them outside the working tree and point NODE_PATH at them — see docs/README.md. */
function load(name) {
  try {
    return require(name);
  } catch (e) {
    console.error(
      `Cannot load "${name}".\n` +
        `Install the render dependencies outside the repository:\n\n` +
        `  mkdir -p /tmp/puong-render && cd /tmp/puong-render && npm init -y && npm install puppeteer marked\n` +
        `  NODE_PATH=/tmp/puong-render/node_modules node docs/render-pdf.js ...\n\n` +
        `See docs/README.md.`
    );
    process.exit(1);
  }
}
const puppeteer = load('puppeteer');
const { marked } = load('marked');

async function render(mdPath, outPath, cssPath, headerText, title) {
  const md = fs.readFileSync(mdPath, 'utf8');
  const css = fs.readFileSync(cssPath, 'utf8');
  const body = marked.parse(md, { gfm: true, breaks: false });

  const html = `<!doctype html>
<html><head><meta charset="utf-8">
<title>${title}</title>
<style>${css}</style>
<style>
  body { padding-top: 0; }
</style>
</head><body>${body}</body></html>`;

  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--font-render-hinting=none'],
  });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });
  await page.emulateMediaType('print');

  const opts = {
    path: outPath,
    format: 'A4',
    printBackground: true,
    preferCSSPageSize: true,
    displayHeaderFooter: true,
    headerTemplate:
      `<div style="font-size:7.5pt;width:100%;text-align:center;color:#777;
                  font-family:'Segoe UI',Arial,sans-serif;">${headerText}</div>`,
    footerTemplate: '<div></div>',
    margin: { top: '17mm', bottom: '14mm', left: '12mm', right: '12mm' },
  };
  // PDF outline (bookmarks) from headings, if this Puppeteer supports it.
  try {
    await page.pdf({ ...opts, outline: true });
  } catch (e) {
    console.error('outline unsupported, retrying without it');
    await page.pdf(opts);
  }
  await browser.close();
  return outPath;
}

(async () => {
  const [md, out, css, header = '21 October 2026', title = 'Puong — Software Requirements Specification'] =
    process.argv.slice(2);
  await render(md, out, css, header, title);
  console.log('wrote', path.resolve(out));
})();
