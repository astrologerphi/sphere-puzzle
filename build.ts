import { build } from 'esbuild';
import { cp, mkdir, rm, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(dirname);
const srcDir = path.join(projectRoot, 'src');
const distDir = path.join(projectRoot, 'dist');

async function main() {
    await rm(distDir, { recursive: true, force: true });
    await mkdir(distDir, { recursive: true });

    await build({
        entryPoints: [path.join(srcDir, 'main.ts')],
        bundle: true,
        format: 'esm',
        target: ['esnext'],
        sourcemap: true,
        outfile: path.join(distDir, 'main.js'),
        logLevel: 'info',
        loader: {
            '.wgsl': 'text',
        },
    });

    await copyFile(path.join(srcDir, 'index.html'), path.join(distDir, 'index.html'));
    await cp(path.join(srcDir, 'styles'), path.join(distDir, 'styles'), { recursive: true });
    await cp(path.join(srcDir, 'sphere.ico'), path.join(distDir, 'favicon.ico'));

    console.log('Built to', distDir);
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});