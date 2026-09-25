// Copies the files the compiled API needs at runtime into an output folder, for the container
// image (apps/api/Dockerfile). It uses @vercel/nft, the file tracing Vercel applies when it
// deploys this API as a function and Next.js applies to standalone builds, so the image carries
// the API's code and the parts of node_modules it actually loads instead of every dependency of
// the workspace (build tools, the Prisma CLI, other databases' query compilers).
//
//   node apps/api/scripts/trace-runtime.mjs <output-dir>
import { nodeFileTrace } from '@vercel/nft';
import { spawnSync } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, lstatSync, mkdirSync, realpathSync, symlinkSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const output = process.argv[2] ? resolve(process.argv[2]) : null;
if (!output) {
  console.error('Usage: node apps/api/scripts/trace-runtime.mjs <output-dir>');
  process.exit(2);
}

// The API server and the release preflight (environment validation).
const entries = ['apps/api/dist/main.js', 'apps/api/dist/preflight.js'].map((file) => join(root, file));
for (const entry of entries) {
  if (!existsSync(entry)) {
    console.error(`${entry} does not exist: build the API first (npx turbo run build --filter=@topflow/api).`);
    process.exit(1);
  }
}

const { fileList, warnings } = await nodeFileTrace(entries, { base: root, processCwd: root });

let files = 0;
for (const file of [...fileList].sort()) {
  const source = join(root, file);
  const target = join(output, file);
  mkdirSync(dirname(target), { recursive: true });
  const stats = lstatSync(source);
  if (stats.isSymbolicLink()) {
    // Workspace packages are linked into node_modules; keep the links (their targets are traced
    // too) as relative links, which Windows can only create as junctions to absolute paths.
    const linked = join(output, relative(root, realpathSync(source)));
    if (!existsSync(target)) {
      if (process.platform === 'win32') symlinkSync(linked, target, 'junction');
      else symlinkSync(relative(dirname(target), linked), target);
    }
  } else if (stats.isFile()) {
    copyFileSync(source, target);
    files += 1;
  }
}

// Files that are loaded in ways static analysis cannot follow. PDFKit reads its standard fonts
// through a createRequire() of package imports (#standard-fonts/*) and its colour profile by URL.
const requireFromApi = createRequire(join(root, 'apps/api/package.json'));
const pdfkit = dirname(dirname(requireFromApi.resolve('pdfkit')));
for (const folder of ['js/standard-fonts', 'js/data']) {
  cpSync(join(pdfkit, folder), join(output, relative(root, pdfkit), folder), { recursive: true });
}

// Prove the traced tree works: load the compiled application module (every import of the API)
// and render a PDF with the fonts the quotation documents use.
const check = spawnSync(
  process.execPath,
  [
    '-e',
    `require('./apps/api/dist/app.module');
     const PDFDocument = require(require.resolve('pdfkit', { paths: ['./apps/api'] }));
     const doc = new PDFDocument();
     doc.font('Helvetica-Bold').text('TopFlow Hub').font('Helvetica').text('trace check');
     doc.on('data', () => {}).on('end', () => console.log('Runtime check passed: modules load, PDFs render'));
     doc.end();`,
  ],
  { cwd: output, stdio: 'inherit', env: { ...process.env, NODE_ENV: 'production' } },
);
if (check.status !== 0) {
  console.error('The traced runtime is incomplete: see the error above.');
  process.exit(1);
}

// Optional integrations that NestJS and other libraries probe for with try/require are expected
// to be missing; anything else is worth reading in the build log.
const optional = /@nestjs\/(microservices|websockets)|class-transformer\/storage|@fastify\/|pg-native|cloudflare:sockets|bufferutil|utf-8-validate|@vercel\/functions\/websocket/;
const unexpected = [...warnings].map((warning) => warning.message).filter((message) => !optional.test(message));
for (const message of unexpected) console.warn(`trace: ${message}`);
console.log(`Traced ${files} files for the API runtime into ${output}`);
