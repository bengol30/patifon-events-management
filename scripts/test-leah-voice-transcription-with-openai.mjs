import fs from 'fs';
import { transcribeWhatsappVoiceFromUrl } from '../lib/whatsapp-voice-transcription.ts';

const txt = fs.readFileSync('./.env.test-openai', 'utf8');
const match = txt.match(/^OPENAI_API_KEY=(.*)$/m);
if (!match) throw new Error('OPENAI_API_KEY not found in .env.test-openai');
let key = match[1].trim();
if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) key = key.slice(1, -1);
process.env.OPENAI_API_KEY = key;

const url = 'https://do-media-7103.fra1.digitaloceanspaces.com/7103111919/99d6c5c5-a5a8-48e1-aec5-249265dc0d76.oga';
const result = await transcribeWhatsappVoiceFromUrl(url, 'oga');
console.log(JSON.stringify({ ok: !!result, transcript: result }, null, 2));
