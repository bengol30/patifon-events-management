import fs from 'fs';
import { spawn } from 'child_process';

const env = { ...process.env };

const addFromFile = (filePath, keys) => {
  if (!fs.existsSync(filePath)) return;
  const txt = fs.readFileSync(filePath, 'utf8');
  for (const key of keys) {
    const match = txt.match(new RegExp(`^${key}=(.*)$`, 'm'));
    if (!match) continue;
    let value = match[1].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
};

addFromFile('./.env.test-openai', ['OPENAI_API_KEY']);
addFromFile('./.env.local', [
  'FIREBASE_PROJECT_ID',
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_PRIVATE_KEY',
  'SUPABASE_LYDIA_URL',
  'SUPABASE_LYDIA_KEY',
  'SUPABASE_LYDIA_EMAIL',
  'SUPABASE_LYDIA_PASSWORD',
]);

const child = spawn('npm', ['run', 'dev'], {
  stdio: 'inherit',
  env,
  shell: true,
});

child.on('exit', (code) => process.exit(code ?? 0));
