import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const CACHE_DIR = process.env.VERCEL
  ? path.join('/tmp', 'patifon-voice-transcripts')
  : path.join(process.cwd(), '.cache', 'voice-transcripts');

export type VoiceTranscriptResult = {
  transcript: string | null;
  source: 'cache' | 'whisper' | 'openai' | 'none';
  error?: string | null;
};

const normalizeUploadName = (filePath: string, mimeType: string) => {
  const base = path.basename(filePath, path.extname(filePath));
  if (mimeType.includes('ogg')) return `${base}.ogg`;
  if (mimeType.includes('mpeg') || mimeType.includes('mp3')) return `${base}.mp3`;
  if (mimeType.includes('wav')) return `${base}.wav`;
  return path.basename(filePath);
};

const transcribeViaOpenAI = async (filePath: string, mimeType = 'audio/wav') => {
  if (!process.env.OPENAI_API_KEY) return null;

  const form = new FormData();
  const fileBuffer = await fs.readFile(filePath);
  form.append('file', new Blob([fileBuffer], { type: mimeType }), normalizeUploadName(filePath, mimeType));
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

export async function transcribeWhatsappVoiceFromUrl(downloadUrl: string, extension = 'ogg', mimeType = 'audio/ogg'): Promise<VoiceTranscriptResult> {
  if (!downloadUrl) return { transcript: null, source: 'none', error: 'missing_download_url' };

  let cachePath: string | null = null;
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    const cacheKey = crypto.createHash('sha1').update(`${downloadUrl}|${extension}`).digest('hex');
    cachePath = path.join(CACHE_DIR, `${cacheKey}.txt`);

    try {
      const cached = (await fs.readFile(cachePath, 'utf8')).trim();
      if (cached) return { transcript: cached, source: 'cache', error: null };
    } catch {}
  } catch (error) {
    console.error('Voice transcript cache unavailable, continuing without cache', error);
  }

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

    try {
      await execFileAsync('ffmpeg', ['-y', '-i', inputPath, '-ar', '16000', '-ac', '1', wavPath], {
        timeout: 30000,
        maxBuffer: 10 * 1024 * 1024,
      });
    } catch (error: any) {
      console.error('ffmpeg conversion failed, falling back to OpenAI original-audio transcription', error);
      try {
        const directTranscript = await transcribeViaOpenAI(inputPath, mimeType);
        if (directTranscript) {
          if (cachePath) {
            await fs.writeFile(cachePath, directTranscript, 'utf8').catch(() => {});
          }
          return { transcript: directTranscript, source: 'openai', error: null };
        }
      } catch (fallbackError: any) {
        return { transcript: null, source: 'none', error: fallbackError?.message || error?.message || 'ffmpeg_missing_and_openai_failed' };
      }
      return { transcript: null, source: 'none', error: error?.message || 'ffmpeg_failed' };
    }

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
        if (cachePath) {
          await fs.writeFile(cachePath, transcript, 'utf8').catch(() => {});
        }
        return { transcript, source: 'whisper', error: null };
      }
    } catch (error: any) {
      console.error('Local whisper failed, falling back to OpenAI transcription', error);
    }

    try {
      const fallbackTranscript = await transcribeViaOpenAI(wavPath, 'audio/wav');
      if (fallbackTranscript) {
        if (cachePath) {
        await fs.writeFile(cachePath, fallbackTranscript, 'utf8').catch(() => {});
      }
        return { transcript: fallbackTranscript, source: 'openai', error: null };
      }
      return { transcript: null, source: 'none', error: 'empty_fallback_transcript' };
    } catch (error: any) {
      return { transcript: null, source: 'none', error: error?.message || 'openai_fallback_failed' };
    }
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}
