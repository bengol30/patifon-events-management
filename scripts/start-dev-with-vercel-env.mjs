import fs from 'fs';
import { spawn } from 'child_process';

const txt = fs.readFileSync('./.env.test-openai', 'utf8');
const match = txt.match(/^OPENAI_API_KEY=(.*)$/m);
if (!match) {
  console.error('OPENAI_API_KEY not found in .env.test-openai');
  process.exit(1);
}
let key = match[1].trim();
if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) key = key.slice(1, -1);

const child = spawn('npm', ['run', 'dev'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    OPENAI_API_KEY: key,
  },
  shell: true,
});

child.on('exit', (code) => process.exit(code ?? 0));
