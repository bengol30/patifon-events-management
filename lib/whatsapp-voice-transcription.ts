import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const transcribeViaOpenAI = async (wavPath: string) => {
  if (!process.env.OPENAI_API_KEY) return null;

  const form = new FormData();
  const fileBuffer = await fs.readFile(wavPath);
  form.append('file', new Blob([fileBuffer], { type: 'audio/wav' }), path.basename(wavPath));
  form.append('model', 'gpt-4o-mini-transcribe');
  form.append('language', 'he');

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: form,
  });

  if (!res.ok) {
    throw new Error(`OpenAI transcription failed (${res.status}): ${await res.text()}`);
  }

  const data = await res.json();
  return String(data?.text || '').trim() || null;
};

export async function transcribeWhatsappVoiceFromUrl(downloadUrl: string, extension = 'ogg') {
  if (!downloadUrl) return null;

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'patifon-voice-'));
  const baseName = crypto.randomBytes(8).toString('hex');
  const inputPath = path.join(tempDir, `${baseName}.${extension}`);
  const wavPath = path.join(tempDir, `${baseName}.wav`);

  try {
    const res = await fetch(downloadUrl);
    if (!res.ok) {
      throw new Error(`Failed to download voice file (${res.status})`);
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    await fs.writeFile(inputPath, buffer);

    await execFileAsync('ffmpeg', ['-y', '-i', inputPath, '-ar', '16000', '-ac', '1', wavPath], {
      timeout: 30000,
      maxBuffer: 10 * 1024 * 1024,
    });

    try {
      await execFileAsync('whisper', [wavPath, '--model', 'turbo', '--output_format', 'txt', '--output_dir', tempDir], {
        timeout: 120000,
        maxBuffer: 10 * 1024 * 1024,
      });

      const txtPath = path.join(tempDir, `${baseName}.txt`);
      const transcript = (await fs.readFile(txtPath, 'utf8')).trim();
      if (transcript) return transcript;
    } catch (error) {
      console.error('Local whisper failed, falling back to OpenAI transcription', error);
    }

    return await transcribeViaOpenAI(wavPath);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}
