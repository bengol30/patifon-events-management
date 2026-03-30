import { transcribeWhatsappVoiceFromUrl } from '../lib/whatsapp-voice-transcription.ts';

const url = 'https://do-media-7103.fra1.digitaloceanspaces.com/7103111919/99d6c5c5-a5a8-48e1-aec5-249265dc0d76.oga';

const result = await transcribeWhatsappVoiceFromUrl(url, 'oga');
console.log(JSON.stringify({ ok: !!result, transcript: result }, null, 2));
