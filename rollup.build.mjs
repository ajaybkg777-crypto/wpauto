import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rollup } from 'rollup';
import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import { transform } from 'sucrase';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';

const root = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(root, 'dist');
const outFile = path.join(distDir, 'assets', 'index-manual.js');
const cssOutFile = path.join(distDir, 'assets', 'index-manual.css');

const emptyCssPlugin = {
  name: 'empty-css',
  resolveId(source) {
    return source.endsWith('.css') ? `\0empty-css:${source}` : null;
  },
  load(id) {
    return id.startsWith('\0empty-css:') ? 'export default {};' : null;
  }
};

const sucraseJsxPlugin = {
  name: 'sucrase-jsx',
  transform(code, id) {
    if (!/\.(jsx|js)$/.test(id) || id.includes('node_modules')) return null;

    const browserEnv = {
      VITE_API_URL: process.env.VITE_API_URL || '',
      VITE_AUTH_OTP_REQUIRED: process.env.VITE_AUTH_OTP_REQUIRED || 'false'
    };

    const result = transform(code, {
      filePath: id,
      production: true,
      jsxRuntime: 'automatic',
      transforms: ['jsx']
    });

    return {
      code: result.code.replaceAll('import.meta.env', JSON.stringify(browserEnv)),
      map: result.sourceMap || null
    };
  }
};

const nodeEnvPlugin = {
  name: 'node-env-production',
  transform(code, id) {
    if (!id.includes('node_modules')) return null;
    return code.includes('process.env.NODE_ENV')
      ? code.replaceAll('process.env.NODE_ENV', JSON.stringify('production'))
      : null;
  }
};

await mkdir(path.dirname(outFile), { recursive: true });

const cssInputFile = path.join(root, 'src', 'index.css');
const cssInput = await readFile(cssInputFile, 'utf8');
const cssResult = await postcss([
  tailwindcss(path.join(root, 'tailwind.config.js')),
  autoprefixer()
]).process(cssInput, {
  from: cssInputFile,
  to: cssOutFile
});
await writeFile(cssOutFile, cssResult.css);

const bundle = await rollup({
  input: path.join(root, 'src', 'main.jsx'),
  plugins: [
    emptyCssPlugin,
    sucraseJsxPlugin,
    nodeEnvPlugin,
    resolve({
      browser: true,
      extensions: ['.mjs', '.js', '.jsx', '.json'],
      preferBuiltins: false
    }),
    commonjs()
  ],
  treeshake: true,
  onwarn(warning, warn) {
    if (warning.code === 'MODULE_LEVEL_DIRECTIVE') return;
    warn(warning);
  }
});

await bundle.write({
  file: outFile,
  format: 'es',
  sourcemap: false
});
await bundle.close();

const htmlPath = path.join(distDir, 'index.html');
let html;
try {
  html = await readFile(htmlPath, 'utf8');
} catch (error) {
  html = await readFile(path.join(root, 'index.html'), 'utf8');
}
html = html.replace(/<script type="module" crossorigin src="\/assets\/[^"]+"><\/script>/, '<script type="module" crossorigin src="/assets/index-manual.js"></script>');
html = html.replace(/<script type="module" src="\/src\/main\.jsx"><\/script>/, '<script type="module" crossorigin src="/assets/index-manual.js"></script>');
html = html.replace(/\s*<link rel="stylesheet" crossorigin href="\/assets\/[^"]+\.css">/g, '');
html = html.replace('</head>', '    <link rel="stylesheet" crossorigin href="/assets/index-manual.css">\n  </head>');
await writeFile(htmlPath, html);

console.log(`Built ${path.relative(root, outFile)}`);
console.log(`Built ${path.relative(root, cssOutFile)}`);
