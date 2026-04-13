import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const sourcePath = path.join(rootDir, 'benchmark-contas-2026.html');
const targetDir = path.join(rootDir, 'public', 'benchmark-contas-2026');
const targetPath = path.join(targetDir, 'index.html');

await mkdir(targetDir, { recursive: true });
await copyFile(sourcePath, targetPath);

console.log(`Benchmark synced: ${path.relative(rootDir, sourcePath)} -> ${path.relative(rootDir, targetPath)}`);
