import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const python = join(root, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
if (!existsSync(python) || !existsSync(join(root, '.env'))) {
  console.error('Configure the Python virtualenv and scripts/configure-local.ps1 first.');
  process.exit(1);
}
const children = [];
const start = (command, args, cwd) => {
  const child = spawn(command, args, { cwd, stdio: 'inherit', env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' } });
  children.push(child);
  child.on('error', error => { console.error(error.message); stop(); });
  child.on('exit', code => { if (code) { console.error(`Service exited (${code})`); stop(); } });
};
const stop = () => { for (const child of children) child.kill(); };
process.on('SIGINT', () => { stop(); process.exit(0); });
process.on('SIGTERM', () => { stop(); process.exit(0); });
start(python, ['-m', 'uvicorn', 'app.main:socket_app', '--host', '127.0.0.1', '--port', '8100', '--no-access-log'], join(root, 'api'));
start(process.execPath, [join(root, 'web/node_modules/next/dist/bin/next'), 'start', '--hostname', '127.0.0.1', '--port', '3100'], join(root, 'web'));
