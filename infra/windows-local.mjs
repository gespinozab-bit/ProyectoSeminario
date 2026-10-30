import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(root, 'infra/windows/.env');
const readEnv = (file) => (existsSync(file) ? parseEnv(readFileSync(file, 'utf8')) : {});
const run = (args, capture = false) => {
  const result = spawnSync('docker', args, {
    cwd: root,
    stdio: capture ? 'pipe' : 'inherit',
    encoding: 'utf8',
  });
  if (result.error || result.status !== 0)
    throw new Error('El comando Docker no terminó correctamente. Revisa el mensaje anterior.');
  return result.stdout ?? '';
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const psQuote = (value) => `'${value.replaceAll("'", "''")}'`;

async function dockerReady() {
  const check = () =>
    spawnSync('docker', ['info', '--format', '{{.ServerVersion}}'], {
      stdio: 'ignore',
      timeout: 8000,
    }).status === 0;
  if (check()) return;
  const desktop = path.join(
    process.env.ProgramFiles ?? 'C:/Program Files',
    'Docker/Docker/Docker Desktop.exe',
  );
  if (!existsSync(desktop))
    throw new Error(
      'Instala Docker Desktop con contenedores Linux y vuelve a ejecutar este archivo.',
    );
  console.log('Iniciando Docker Desktop. Espera mientras queda disponible…');
  execFileSync(
    'powershell.exe',
    ['-NoProfile', '-Command', `Start-Process -FilePath ${psQuote(desktop)} -WindowStyle Hidden`],
    { stdio: 'ignore' },
  );
  for (let attempt = 0; attempt < 40; attempt++) {
    await sleep(3000);
    if (check()) return;
  }
  throw new Error(
    'Docker aún no está disponible. Abre Docker Desktop, comprueba WSL 2 y vuelve a intentarlo.',
  );
}

function configure() {
  if (existsSync(envPath)) return readEnv(envPath);
  const database = readEnv(path.join(root, 'infra/.env'));
  const api = readEnv(path.join(root, 'apps/api/.env'));
  let project = 'infra';
  const inspected = spawnSync(
    'docker',
    ['inspect', 'lensegua-postgres', '--format', '{{json .Config.Labels}}'],
    { encoding: 'utf8' },
  );
  if (inspected.status === 0)
    project = JSON.parse(inspected.stdout)['com.docker.compose.project'] ?? project;
  const random = () => randomBytes(32).toString('hex');
  const secret = (value) =>
    value?.length >= 32 && !/CHANGE_ME|GENERATE_|REPLACE_ME/i.test(value) ? value : random();
  const values = {
    COMPOSE_PROJECT_NAME: project,
    POSTGRES_USER: database.POSTGRES_USER ?? 'lensegua',
    POSTGRES_DB: database.POSTGRES_DB ?? 'lensegua',
    POSTGRES_PORT: database.POSTGRES_PORT ?? '5434',
    POSTGRES_PASSWORD: database.POSTGRES_PASSWORD ?? random(),
    JWT_ACCESS_SECRET: secret(api.JWT_ACCESS_SECRET),
    JWT_REFRESH_SECRET: secret(api.JWT_REFRESH_SECRET),
    INITIAL_ADMIN_EMAIL: api.INITIAL_ADMIN_EMAIL ?? 'admin@lensegua.local',
    INITIAL_ADMIN_PASSWORD:
      api.INITIAL_ADMIN_PASSWORD && !/CHANGE_ME/i.test(api.INITIAL_ADMIN_PASSWORD)
        ? api.INITIAL_ADMIN_PASSWORD
        : `Lg!7${random()}`,
    LOCAL_WEB_PORT: '8080',
  };
  if (values.POSTGRES_PASSWORD === 'CHANGE_ME')
    throw new Error(
      'Reemplaza CHANGE_ME en infra/.env por la contraseña PostgreSQL configurada antes de iniciar.',
    );
  values.LOCAL_DATABASE_URL = `postgresql://${encodeURIComponent(values.POSTGRES_USER)}:${encodeURIComponent(values.POSTGRES_PASSWORD)}@postgres:5432/${encodeURIComponent(values.POSTGRES_DB)}`;
  mkdirSync(path.dirname(envPath), { recursive: true });
  writeFileSync(
    envPath,
    Object.entries(values)
      .map(([key, value]) => `${key}='${value.replaceAll("'", "\\'")}'`)
      .join('\n') + '\n',
    { mode: 0o600 },
  );
  console.log('Configuración local creada sin mostrar secretos.');
  return values;
}

try {
  if (process.platform !== 'win32') throw new Error('Usa este iniciador en Windows.');
  const action = process.argv[2] ?? 'start';
  if (!['start', 'stop', 'status', 'reset-admin', 'backup'].includes(action))
    throw new Error('Acciones: start, stop, status, reset-admin, backup.');
  await dockerReady();
  const env = configure();
  const compose = [
    'compose',
    '--env-file',
    envPath,
    '-f',
    'infra/docker-compose.yml',
    '-f',
    'infra/compose.windows.yml',
    '-p',
    env.COMPOSE_PROJECT_NAME,
  ];
  if (action === 'stop') {
    run([...compose, 'stop']);
    console.log('LENSEGUA detenido. Se conservaron la base y los archivos.');
  } else if (action === 'backup') {
    mkdirSync(path.join(root, 'backups'), { recursive: true });
    const destination = path.join(
      root,
      'backups',
      `windows-${new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')}`,
    );
    const result = spawnSync(
      process.execPath,
      [
        path.join(root, 'infra/backup.mjs'),
        envPath,
        destination,
        env.COMPOSE_PROJECT_NAME,
        '--windows',
      ],
      { stdio: 'inherit' },
    );
    if (result.status !== 0)
      throw new Error('No se completó el respaldo. Inicia LENSEGUA y vuelve a intentarlo.');
  } else if (action === 'status') {
    run([...compose, 'ps', '-a']);
  } else if (action === 'reset-admin') {
    run([...compose, 'up', '-d', 'postgres']);
    run([
      ...compose,
      'run',
      '--rm',
      'maintenance',
      'node',
      'dist/reset-admin.js',
      env.INITIAL_ADMIN_EMAIL,
    ]);
  } else {
    console.log('Preparando LENSEGUA local. La primera vez puede descargar y construir imágenes.');
    run([...compose, 'config', '--quiet']);
    const images = [
      'lensegua-windows-api:local',
      'lensegua-windows-web:local',
      'lensegua-windows-tools:local',
    ];
    const missingImage = images.some(
      (name) => spawnSync('docker', ['image', 'inspect', name], { stdio: 'ignore' }).status !== 0,
    );
    if (missingImage || process.argv.includes('--rebuild')) run([...compose, 'build']);
    else
      console.log(
        'Usando las imágenes ya construidas. Para reconstruir después de cambios: start --rebuild.',
      );
    run([...compose, 'up', '-d', '--wait', '--wait-timeout', '120']);
    run([...compose, 'run', '--rm', 'maintenance', 'node', 'dist/local-bootstrap.js']);
    const url = `http://localhost:${env.LOCAL_WEB_PORT}`;
    const health = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(15000) });
    if (!health.ok) throw new Error('La comprobación final de la base no respondió correctamente.');
    console.log(
      `\nLENSEGUA listo: ${url}\nAdministración: ${url}/admin/login\nAdministrador: ${env.INITIAL_ADMIN_EMAIL}\nSi no recuerdas la contraseña, abre Recuperar administrador.cmd.`,
    );
    if (!process.argv.includes('--no-open')) {
      try {
        execFileSync(
          'powershell.exe',
          ['-NoProfile', '-Command', `Start-Process ${psQuote(url)}`],
          { stdio: 'ignore' },
        );
      } catch {
        console.log(`Abre manualmente ${url} en tu navegador. La aplicación sigue funcionando.`);
      }
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'No se pudo iniciar LENSEGUA.');
  process.exitCode = 1;
}
