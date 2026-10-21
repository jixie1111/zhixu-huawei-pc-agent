import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { configuredSecrets, hasSensitiveContent } from './preview-security';

/** Source-only preparation: never uploads, pushes, or includes local knowledge. */
const root = process.cwd();
const files = [
  'README.md', 'package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts',
  'playwright.config.ts', 'index.html', '.gitignore', '.dockerignore', '.env.example', 'Dockerfile',
  'public/favicon.svg',
];
const directories = ['src', 'server', 'shared', 'tests', 'scripts', 'prompts', 'docs'];
const allowedExtensions = new Set(['.ts', '.tsx', '.css', '.json', '.md', '.html', '.svg', '.py', '.ps1']);
// Match configured secret values without logging them or adding the env file to the package.
const knownSecrets = configuredSecrets(root);
function collect(directory: string): string[] {
  const absolute = path.join(root, directory);
  if (!fs.existsSync(absolute)) return [];
  return fs.readdirSync(absolute, { withFileTypes: true }).flatMap(entry => {
    if (entry.isSymbolicLink()) throw new Error(`预览包禁止符号链接：${directory}/${entry.name}`);
    const relative = `${directory}/${entry.name}`;
    return entry.isDirectory() ? collect(relative) : allowedExtensions.has(path.extname(entry.name)) ? [relative] : [];
  });
}
const candidates = [...new Set([...files.filter(file => fs.existsSync(path.join(root, file))), ...directories.flatMap(collect)])].sort();
const forbidden = /(^|\/)(private|vendor|tmp|node_modules|dist|dist-demo|test-results|playwright-report|output)(\/|$)|(^|\/)\.env(?!\.example$)|\.(?:sqlite(?:-wal|-shm)?|zip|pdf|docx|png|jpg|jpeg|webp)$/i;
const payloads = candidates.map(file => {
  if (forbidden.test(file)) throw new Error(`禁止打包文件：${file}`);
  const source = path.join(root, file);
  if (fs.lstatSync(source).isSymbolicLink()) throw new Error(`预览包禁止符号链接：${file}`);
  const content = fs.readFileSync(source);
  const text = content.toString('utf8');
  if (hasSensitiveContent(text,knownSecrets)) {
    throw new Error(`疑似凭证，已停止打包：${file}。请人工检查；本工具不会输出敏感内容。`);
  }
  return { file, content, sha256: createHash('sha256').update(content).digest('hex') };
});
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const output = path.join(root, 'output', `source-preview-${stamp}`);
fs.mkdirSync(output, { recursive: true });
for (const { file, content } of payloads) {
  const destination = path.join(output, file);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, content, { flag: 'wx' });
}
const manifest = {
  status: 'SOURCE_PREVIEW_ONLY', createdAt: new Date().toISOString(),
  notice: '仅准备本地源码预览包；未上传、未正式提交。原始知识库、图片、凭证、会话记录与供应商插件不在包中。',
  excluded: ['private/', 'private/deploy.env', 'vendor/', 'tmp/', 'output/', '.env', 'dist/', 'dist-demo/', 'node_modules/', 'test-results/', 'playwright-report/'],
  files: payloads.map(({ file, content, sha256 }) => ({ path: file, bytes: content.length, sha256 })),
};
fs.writeFileSync(path.join(output, 'PREVIEW-MANIFEST.json'), JSON.stringify(manifest, null, 2), { flag: 'wx' });
console.log(`已准备 ${payloads.length} 个源码文件：${output}`);
console.log('未执行上传或正式提交。上传前仍需人工确认公开范围、仓库目标及第三方使用许可。');
