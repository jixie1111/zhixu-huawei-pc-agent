import fs from 'node:fs/promises';
import type { KnowledgeStore } from './knowledge';
import type { ImageReader } from './image-verification';
import type { SourceMode } from '../shared/types';
import { publicDeployment } from './config';
import { AppError } from './errors';
import { imageType } from './network';

/** Only indexed image IDs are accepted; no caller-supplied paths or fallback to ima. */
export function createEvidenceImageReader(knowledge: KnowledgeStore, ima: ImageReader, mode: SourceMode): ImageReader {
  if (mode === 'ima') return ima;
  return { async asset(id, signal) {
    signal?.throwIfAborted();
    if (publicDeployment) throw new AppError('PRIVATE_ASSET', '公开部署不读取本地知识库图片。', 403);
    const filename = knowledge.assets.get(id);
    if (!filename) return undefined;
    const stat = await fs.lstat(filename);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0 || stat.size > 12 * 1024 * 1024) throw new AppError('LOCAL_IMAGE_INVALID', '本地原图类型或大小不符合要求。', 422);
    const body = await fs.readFile(filename, { signal });
    signal?.throwIfAborted();
    const type = imageType(body);
    if (!type) throw new AppError('LOCAL_IMAGE_INVALID', '本地原图文件签名无效。', 422);
    return { body, type };
  } };
}
