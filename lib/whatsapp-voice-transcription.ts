import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const CACHE_DIR = path.join(process.cwd(), '.cache', 'voice-transcripts');

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

  await fs.mkdir(CACHE_DIR, { recursive: true });
  const cacheKey = crypto.createHash('sha1').update(`${downloadUrl}|${extension}`).digest('hex');
  const cachePath = path.join(CACHE_DIR, `${cacheKey}.txt`);

  try {
    const cached = (await fs.readFile(cachePath, 'utf8')).trim();
    if (cached) return cached;
  } catch {}

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
      await execFileAsync('whisper', [
        wavPath,
        '--model', 'tiny',
        '--language', 'he',
        '--task', 'transcribe',
        '--fp16', 'False',
        '--verbose', 'False',
        '--output_format', 'txt',
        '--output_dir', tempDir,
      ], {
        timeout: 180000,
        maxBuffer: 20 * 1024 * 1024,
      });

      const txtPath = path.join(tempDir, `${baseName}.txt`);
      const transcript = (await fs.readFile(txtPath, 'utf8')).trim();
      if (transcript) {
        await fs.writeFile(cachePath, transcript, 'utf8').catch(() => {});
        return transcript;
      }
    } catch (error) {
      console.error('Local whisper failed, falling back to OpenAI transcription', error);
    }

    const fallbackTranscript = await transcribeViaOpenAI(wavPath);
    if (fallbackTranscript) {
      await fs.writeFile(cachePath, fallbackTranscript, 'utf8').catch(() => {});
    }
    return fallbackTranscript;
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}
