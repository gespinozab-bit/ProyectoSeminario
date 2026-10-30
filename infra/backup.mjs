import { execFileSync } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import { createReadStream, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [envFile, directory, project = 'lensegua-production', mode] = process.argv.slice(2);
if (!envFile || !directory || !/^[a-z0-9][a-z0-9_-]*$/.test(project)) {
  console.error('Uso: node infra/backup.mjs ARCHIVO_ENV DIRECTORIO_NUEVO [PROYECTO_COMPOSE]');
  process.exit(1);
}
const destination = path.resolve(directory);
const compose = [
  'compose',
  '--env-file',
  path.resolve(envFile),
  ...(mode === '--windows'
    ? [
        '-f',
        path.join(root, 'infra/docker-compose.yml'),
        '-f',
        path.join(root, 'infra/compose.windows.yml'),
      ]
    : ['-f', path.join(root, 'infra/compose.production.yml')]),
  '-p',
  project,
];
const docker = (...args) =>
  execFileSync('docker', [...compose, ...args], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
let paused = [];
const temporaryDump = `/tmp/lensegua-backup-${randomUUID()}.dump`;
try {
  mkdirSync(destination, { recursive: false, mode: 0o700 });
  const running = docker('ps', '--status', 'running', '--services').trim().split(/\r?\n/);
  paused = ['web', 'api'].filter((service) => running.includes(service));
  if (paused.length) docker('stop', ...paused);
  docker(
    'exec',
    '-T',
    'postgres',
    'pg_dump',
    '-U',
    'lensegua',
    '-d',
    'lensegua',
    '-Fc',
    '-f',
    temporaryDump,
  );
  docker('cp', `postgres:${temporaryDump}`, path.join(destination, 'database.dump'));
  docker(
    'run',
    '--rm',
    '--no-deps',
    '--user',
    'root',
    '-v',
    `${destination}:/backup`,
    'maintenance',
    'tar',
    '-C',
    '/app/storage',
    '-czf',
    '/backup/media.tar.gz',
    'media',
  );
  const files = [];
  for (const name of ['database.dump', 'media.tar.gz']) {
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(path.join(destination, name))) hash.update(chunk);
    files.push({ name, sha256: hash.digest('hex') });
  }
  writeFileSync(
    path.join(destination, 'manifest.json'),
    JSON.stringify({ version: 1, createdAt: new Date().toISOString(), project, files }, null, 2) +
      '\n',
    { mode: 0o600 },
  );
  console.log(`Respaldo de PostgreSQL y multimedia guardado en ${destination}`);
} catch (error) {
  console.error(
    'El respaldo no terminó. Conserva los archivos anteriores y revisa Docker, el entorno y el espacio disponible.',
  );
  if (error?.stderr) console.error(String(error.stderr));
  process.exitCode = 1;
} finally {
  try {
    docker('exec', '-T', 'postgres', 'rm', '-f', temporaryDump);
  } catch {
    /* Database may not be available. */
  }
  if (paused.length) {
    try {
      docker(
        'up',
        '-d',
        '--no-deps',
        '--no-recreate',
        '--wait',
        '--wait-timeout',
        '120',
        ...paused,
      );
    } catch {
      console.error('Reinicia manualmente los servicios web y api.');
      process.exitCode = 1;
    }
  }
}
