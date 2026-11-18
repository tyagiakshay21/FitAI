const { spawn, execFile } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const isWindows = process.platform === 'win32';

function readEnvFile(file) {
  if (!fs.existsSync(file)) return {};
  return Object.fromEntries(fs.readFileSync(file, 'utf8').split(/\r?\n/)
    .map((line) => line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/))
    .filter(Boolean)
    .map(([, key, raw]) => {
      const value = raw.startsWith('"') || raw.startsWith("'")
        ? raw.slice(1, raw.endsWith(raw[0]) ? -1 : undefined)
        : raw.replace(/\s+#.*$/, '');
      return [key, value];
    }));
}

const sharedEnv = { ...process.env };
for (const [key, value] of Object.entries(readEnvFile(path.join(root, 'backend', '.env')))) {
  if (sharedEnv[key] === undefined) sharedEnv[key] = value;
}

const pythonDir = (service) => path.join(root, service, 'venv', isWindows ? 'Scripts' : 'bin');
const pythonExe = (service) => path.join(pythonDir(service), isWindows ? 'python.exe' : 'python');
const services = [
  { name: 'backend', cwd: path.join(root, 'backend'), command: 'npm', args: ['run', 'dev'], npm: true },
  { name: 'frontend', cwd: path.join(root, 'frontend'), command: 'npm', args: ['run', 'dev', '--', '--host', '127.0.0.1'], npm: true },
  { name: 'computer vision', cwd: path.join(root, 'cv-service'), command: pythonExe('cv-service'), args: ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8001'], env: { ...sharedEnv, CV_REQUIRE_AUTH: 'true' } },
  { name: 'machine learning', cwd: path.join(root, 'ml-service'), command: pythonExe('ml-service'), args: ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8002'], env: sharedEnv },
];

const children = [];
let stopping = false;

function stopAll(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (!child.pid) continue;
    if (isWindows) {
      execFile('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true }, () => {});
    } else {
      child.kill('SIGTERM');
    }
  }
  process.exitCode = exitCode;
}

process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));
console.log('Starting FitAI backend, frontend, camera and ML services. Press Ctrl+C to stop all.');

for (const service of services) {
  if (!fs.existsSync(service.command) && !service.npm) {
    console.error(`[${service.name}] Python environment not found at ${service.command}. Run .\\setup-local.ps1 first.`);
    stopAll(1);
    break;
  }
  const child = service.npm
    ? spawn(isWindows ? (process.env.ComSpec || 'cmd.exe') : service.command,
      isWindows ? ['/d', '/s', '/c', `npm ${service.args.join(' ')}`] : service.args,
      { cwd: service.cwd, stdio: 'inherit', windowsHide: true })
    : spawn(service.command, service.args, { cwd: service.cwd, env: service.env, stdio: 'inherit', windowsHide: true });
  children.push(child);
  child.on('error', (error) => {
    console.error(`[${service.name}] could not start: ${error.message}`);
    stopAll(1);
  });
  child.on('exit', (code, signal) => {
    if (!stopping) {
      console.error(`[${service.name}] stopped (${signal || code || 'unknown'}); stopping the other services.`);
      stopAll(code || 1);
    }
  });
}
