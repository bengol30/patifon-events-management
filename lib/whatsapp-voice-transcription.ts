import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export async function transcribeWhatsappVoiceFromUrl(downloadUrl: string, extension = 'ogg') {
  if (!downloadUrl) return null;

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'patifon-voice-'));
  const baseName = crypto.randomBytes(8).toString('hex');
  const inputPath = path.join(tempDir, `${baseName}.${extension}`);

  try {
    const res = await fetch(downloadUrl);
    if (!res.ok) {
      throw new Error(`Failed to download voice file (${res.status})`);
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    await fs.writeFile(inputPath, buffer);

    await execFileAsync('whisper', [inputPath, '--model', 'turbo', '--output_format', 'txt', '--output_dir', tempDir], {
      timeout: 120000,
      maxBuffer: 10 * 1024 * 1024,
    });

    const txtPath = path.join(tempDir, `${baseName}.txt`);
    const transcript = (await fs.readFile(txtPath, 'utf8')).trim();
    return transcript || null;
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}
