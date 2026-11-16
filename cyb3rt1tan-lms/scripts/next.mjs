import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const result = spawnSync(process.execPath, [join(root, 'web/node_modules/next/dist/bin/next'), ...process.argv.slice(2)], {
  cwd: join(root, 'web'), stdio: 'inherit', env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
});
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
