import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';

/**
 * Reviewed, explicit installer only: no credentials, downloaded-code execution,
 * business API calls, automatic updates, redirects, or shell commands.
 * Provenance: https://ima.qq.com/agent-interface links to the URL below.
 * This SHA-256 is our pinned observation of that official archive, not a
 * vendor-published signature. Updating it requires a separate source review.
 */
export const IMA_RELEASE = Object.freeze({
  version: '1.1.10',
  url: 'https://app-dl.ima.qq.com/skills/ima-skills-1.1.10.zip',
  bytes: 62183,
  sha256: '7e0d07cae0f98145dc5147e84b77bcc557e2fc4b256b08907922637952c20a7b',
});

const MAX_ARCHIVE_BYTES = 1024 * 1024;
const REQUEST_TIMEOUT_MS = 30_000;
export const IMA_FILES = Object.freeze([
  { path: 'SKILL.md', bytes: 16082, sha256: '2e6b773625bad07e8589f8515d8be835a9ebcdc104083b1cdc8711c2a89c447a' },
  { path: 'ima_api.cjs', bytes: 6390, sha256: '3ef318c47cdcd894e41d3c33fb675b592a33c36555800a123119b7ed1451b1e5' },
  { path: 'meta.json', bytes: 237, sha256: '91d0f9f8372854e005c895368d86139b16603e27881a3014d63eb6e637d1f3a7' },
  { path: 'notes/SKILL.md', bytes: 11535, sha256: 'be6c469ee8baff18c91cde2e3c7fd9e0c16b87974cc494810585d333c538b0fa' },
  { path: 'notes/references/api.md', bytes: 16154, sha256: '1dcd0615eb913a62a09c4fc164a3f8294f745196783791d20fe350120589311a' },
  { path: 'notes/scripts/note-images.cjs', bytes: 10376, sha256: '3ee40feb18254ef81adeead4332fe9517d675f990809338ee92f459fa2477a7c' },
  { path: 'knowledge-base/SKILL.md', bytes: 18838, sha256: '745ec81126718cc5aacf46a98af7bf264067d1b4238c10057c5a291321da97ad' },
  { path: 'knowledge-base/references/api.md', bytes: 27510, sha256: 'fa434c4417f5a39f696aff23161d958a712ebf35c690745b71bc1ae54b04e596' },
  { path: 'knowledge-base/scripts/cos-upload.cjs', bytes: 5267, sha256: '523440e1f724b27fac79660a649afe1c38dcc788304e90003c774bbb332fd083' },
  { path: 'knowledge-base/scripts/preflight-check.cjs', bytes: 13752, sha256: '03e193c11b7256ff2fcd256366dc30e9f771f1c654e34281e56b330f2d32eaef' },
] as const);

function digest(bytes: Buffer) {
  return createHash('sha256').update(bytes).digest('hex');
}

function requireCondition(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/** Only the fixed, unauthenticated official asset may be downloaded. */
export async function downloadPinnedArchive(): Promise<Buffer> {
  const response = await fetch(IMA_RELEASE.url, {
    redirect: 'error', signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: { Accept: 'application/zip, application/octet-stream' },
  });
  requireCondition(response.status === 200 && response.url === IMA_RELEASE.url, 'Official archive download failed. No redirect or alternate source is allowed.');
  const length = response.headers.get('content-length');
  if (length !== null) requireCondition(/^\d+$/.test(length) && Number(length) <= MAX_ARCHIVE_BYTES, 'Archive exceeds the size limit.');
  requireCondition(response.body, 'Official archive response was empty.');
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      requireCondition(total <= MAX_ARCHIVE_BYTES, 'Archive exceeds the size limit.');
      chunks.push(Buffer.from(value));
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, total);
}

/** Never parse or inflate unverified bytes. Only 10 reviewed files are retained. */
export function parsePinnedArchive(archive: Buffer): Map<string, Buffer> {
  requireCondition(archive.length === IMA_RELEASE.bytes && digest(archive) === IMA_RELEASE.sha256, 'SHA-256 verification failed. Nothing was installed; do not bypass the pinned hash.');
  let eocd = -1;
  for (let cursor = archive.length - 22; cursor >= Math.max(0, archive.length - 22 - 65535); cursor--) {
    if (archive.readUInt32LE(cursor) === 0x06054b50 && cursor + 22 + archive.readUInt16LE(cursor + 20) === archive.length) {
      eocd = cursor;
      break;
    }
  }
  requireCondition(eocd >= 0, 'Invalid ZIP end record.');
  const entries = archive.readUInt16LE(eocd + 10);
  const centralBytes = archive.readUInt32LE(eocd + 12);
  const centralStart = archive.readUInt32LE(eocd + 16);
  requireCondition(archive.readUInt16LE(eocd + 4) === 0 && archive.readUInt16LE(eocd + 6) === 0 && archive.readUInt16LE(eocd + 8) === entries, 'Multi-disk ZIP files are not supported.');
  requireCondition(entries > 0 && entries <= 200 && centralStart + centralBytes === eocd, 'Invalid ZIP directory bounds.');
  const expected = new Map(IMA_FILES.map(file => [`ima-skill/${file.path}`, file]));
  const seen = new Set<string>();
  const result = new Map<string, Buffer>();
  let cursor = centralStart;
  for (let index = 0; index < entries; index++) {
    requireCondition(cursor + 46 <= eocd && archive.readUInt32LE(cursor) === 0x02014b50, 'Invalid ZIP directory entry.');
    const flags = archive.readUInt16LE(cursor + 8);
    const method = archive.readUInt16LE(cursor + 10);
    const compressedBytes = archive.readUInt32LE(cursor + 20);
    const plainBytes = archive.readUInt32LE(cursor + 24);
    const nameBytes = archive.readUInt16LE(cursor + 28);
    const extraBytes = archive.readUInt16LE(cursor + 30);
    const commentBytes = archive.readUInt16LE(cursor + 32);
    const attributes = archive.readUInt32LE(cursor + 38);
    const localOffset = archive.readUInt32LE(cursor + 42);
    const next = cursor + 46 + nameBytes + extraBytes + commentBytes;
    requireCondition(next <= eocd, 'ZIP entry exceeds directory bounds.');
    const name = archive.toString('utf8', cursor + 46, cursor + 46 + nameBytes);
    requireCondition(name.length > 0 && !name.includes('\0') && !name.includes('\\') && !name.startsWith('/') && !/^[A-Za-z]:/.test(name) && !name.split('/').some(part => part === '.' || part === '..'), 'Unsafe ZIP entry path.');
    requireCondition(!seen.has(name), 'Duplicate ZIP entry.');
    seen.add(name);
    requireCondition((flags & 1) === 0 && ((attributes >>> 16) & 0xf000) !== 0xa000, 'Encrypted entries and symbolic links are not allowed.');
    const specification = expected.get(name);
    if (specification) {
      requireCondition((method === 0 || method === 8) && plainBytes === specification.bytes && compressedBytes <= MAX_ARCHIVE_BYTES, 'Unexpected ZIP compression or file size.');
      requireCondition(localOffset + 30 <= centralStart && archive.readUInt32LE(localOffset) === 0x04034b50, 'Invalid ZIP local header.');
      requireCondition(archive.readUInt16LE(localOffset + 6) === flags && archive.readUInt16LE(localOffset + 8) === method, 'ZIP headers do not agree.');
      const localNameBytes = archive.readUInt16LE(localOffset + 26);
      const localExtraBytes = archive.readUInt16LE(localOffset + 28);
      const dataStart = localOffset + 30 + localNameBytes + localExtraBytes;
      requireCondition(dataStart + compressedBytes <= centralStart && archive.toString('utf8', localOffset + 30, localOffset + 30 + localNameBytes) === name, 'Invalid ZIP local file bounds.');
      const compressed = archive.subarray(dataStart, dataStart + compressedBytes);
      const content = method === 0 ? Buffer.from(compressed) : inflateRawSync(compressed, { maxOutputLength: specification.bytes });
      requireCondition(content.length === specification.bytes && digest(content) === specification.sha256, `Pinned file verification failed: ${specification.path}`);
      result.set(specification.path, content);
    }
    cursor = next;
  }
  requireCondition(cursor === eocd && result.size === IMA_FILES.length, 'The archive does not contain the complete reviewed file set.');
  requireCondition(JSON.parse(result.get('meta.json')!.toString('utf8')).version === IMA_RELEASE.version, 'Archive version does not match the pinned release.');
  return result;
}

/** Resolve parent first; never replace roots, home, workspace, or user changes. */
function resolveTarget(input: string): string {
  requireCondition(input.trim().length > 0 && !input.includes('\0'), 'An explicit non-empty --target path is required.');
  const absolute = path.resolve(input);
  const parent = fs.realpathSync(path.dirname(absolute));
  const target = path.join(parent, path.basename(absolute));
  const workspace = fs.realpathSync(process.cwd());
  const userHome = fs.realpathSync(os.homedir());
  const normalize = (value: string) => process.platform === 'win32' ? value.toLowerCase() : value;
  const isAncestor = (candidate: string, child: string) => {
    const relative = path.relative(normalize(candidate), normalize(child));
    return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
  };
  requireCondition(target !== path.parse(target).root && !isAncestor(target, workspace) && !isAncestor(target, userHome), 'Refusing a root, home, workspace, or ancestor as an installation target.');
  return target;
}

function statIfPresent(file: string) {
  try { return fs.lstatSync(file); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
}

function verifyFiles(target: string): void {
  const rootStat = statIfPresent(target);
  requireCondition(rootStat?.isDirectory() && !rootStat.isSymbolicLink(), 'Installation target must be a real directory, not a symbolic link.');
  const expectedPaths = new Set<string>(IMA_FILES.map(file => file.path));
  const expectedDirectories = new Set<string>();
  for (const file of IMA_FILES) {
    let directory = path.posix.dirname(file.path);
    while (directory !== '.') {
      expectedDirectories.add(directory);
      directory = path.posix.dirname(directory);
    }
  }
  const found = new Set<string>();
  function visit(relative: string) {
    const current = path.join(target, relative);
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const child = relative ? `${relative}/${entry.name}` : entry.name;
      requireCondition(!entry.isSymbolicLink(), 'Existing installation contains a symbolic link; refusing to modify it.');
      if (entry.isDirectory()) {
        requireCondition(expectedDirectories.has(child), 'Existing installation contains unexpected directories; refusing to modify it.');
        visit(child);
      } else {
        requireCondition(entry.isFile() && expectedPaths.has(child), 'Existing installation contains unexpected files; refusing to modify it.');
        found.add(child);
      }
    }
  }
  visit('');
  requireCondition(found.size === IMA_FILES.length, 'Existing installation is incomplete; refusing to modify it.');
  for (const file of IMA_FILES) {
    const absolute = path.join(target, file.path);
    requireCondition(fs.statSync(absolute).size === file.bytes && digest(fs.readFileSync(absolute)) === file.sha256, `Existing file differs from the pinned release: ${file.path}. Refusing to overwrite it.`);
  }
}

export function verifyInstalled(input: string): string {
  const target = resolveTarget(input);
  verifyFiles(target);
  return target;
}

export function installPinnedArchive(archive: Buffer, input: string): { status: 'installed' | 'already-installed'; target: string } {
  const files = parsePinnedArchive(archive);
  const target = resolveTarget(input);
  if (statIfPresent(target)) {
    verifyFiles(target);
    return { status: 'already-installed', target };
  }
  const parent = path.dirname(target);
  const stagePrefix = `.ima-install-${path.basename(target)}-`;
  const stage = fs.mkdtempSync(path.join(parent, stagePrefix));
  try {
    for (const [relative, content] of files) {
      const destination = path.join(stage, relative);
      fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o755 });
      fs.writeFileSync(destination, content, { flag: 'wx', mode: 0o644 });
    }
    fs.chmodSync(stage, 0o755);
    verifyFiles(stage);
    // Do not overwrite a destination created by another process during staging.
    requireCondition(!statIfPresent(target), 'Target appeared during installation; refusing to overwrite it.');
    fs.renameSync(stage, target);
    return { status: 'installed', target };
  } finally {
    if (statIfPresent(stage)) {
      const resolved = fs.realpathSync(stage);
      requireCondition(path.dirname(resolved) === parent && path.basename(resolved).startsWith(stagePrefix) && resolved !== target, 'Unsafe staging cleanup refused.');
      fs.rmSync(resolved, { recursive: true, force: true });
    }
  }
}

const HELP = `Install the reviewed official ima skill ${IMA_RELEASE.version}; never runs downloaded code.

Usage:
  npx tsx scripts/install-ima.ts --download --target /opt/ima
  npx tsx scripts/install-ima.ts --archive <official-zip> --target <new-directory>
  npx tsx scripts/install-ima.ts --download --verify-only
  npx tsx scripts/install-ima.ts --archive <official-zip> --verify-only
  npx tsx scripts/install-ima.ts --check --target <installed-directory>

The target parent must already exist. An existing target must match exactly;
modified, incomplete, non-empty, or symlink targets are never overwritten.
--download is explicit consent to fetch only the pinned public official asset.
No credentials are read. Configure IMA_SKILL_PATH=<target>/ima_api.cjs separately.
SHA-256: ${IMA_RELEASE.sha256}
`;

export async function main(args = process.argv.slice(2)): Promise<void> {
  if (args.length === 1 && (args[0] === '--help' || args[0] === '-h')) { console.log(HELP); return; }
  let mode: 'download' | 'archive' | 'check' | undefined;
  let archivePath: string | undefined;
  let target: string | undefined;
  let verifyOnly = false;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--download' || arg === '--archive' || arg === '--check') {
      requireCondition(!mode, 'Choose exactly one of --download, --archive, or --check.');
      mode = arg === '--download' ? 'download' : arg === '--archive' ? 'archive' : 'check';
      if (mode === 'archive') {
        archivePath = args[++index];
        requireCondition(archivePath && !archivePath.startsWith('--'), '--archive requires a local file path.');
      }
    } else if (arg === '--target') {
      requireCondition(!target, '--target must not be repeated.');
      target = args[++index];
      requireCondition(target && !target.startsWith('--'), '--target requires a path.');
    } else if (arg === '--verify-only') {
      requireCondition(!verifyOnly, '--verify-only must not be repeated.');
      verifyOnly = true;
    } else throw new Error(`Unsupported option: ${arg}. Use --help.`);
  }
  requireCondition(mode, 'No action selected. Use --help; nothing is installed automatically.');
  requireCondition(!(mode === 'check' && verifyOnly) && !(verifyOnly && target), '--verify-only is for archive verification and cannot be combined with --check or --target.');
  requireCondition(verifyOnly || target, 'Installation and --check require an explicit --target.');
  let result: { status: string; target?: string };
  if (mode === 'check') result = { status: 'verified-installation', target: verifyInstalled(target!) };
  else {
    let archive: Buffer;
    if (mode === 'download') archive = await downloadPinnedArchive();
    else {
      const local = path.resolve(archivePath!);
      const stat = fs.lstatSync(local);
      requireCondition(stat.isFile() && !stat.isSymbolicLink() && stat.size <= MAX_ARCHIVE_BYTES, 'Archive must be a regular local file within the size limit.');
      archive = fs.readFileSync(local);
    }
    if (verifyOnly) { parsePinnedArchive(archive); result = { status: 'verified-archive' }; }
    else result = installPinnedArchive(archive, target!);
  }
  console.log(JSON.stringify({ ...result, version: IMA_RELEASE.version, files: IMA_FILES.length, archiveSha256: IMA_RELEASE.sha256, downloadedCodeExecuted: false }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { console.error(`ima installer: ${error instanceof Error ? error.message : 'Installation failed.'}`); process.exitCode = 1; });
}
