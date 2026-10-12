'use strict';

// The worker reuses the backend's modules, so its dependencies must be installed too.
// Running `npm --prefix ../backend install` straight from "postinstall" can re-trigger this
// same postinstall in a loop (seen on Windows), so a guard variable stops the recursion.
const path = require('path');
const { spawnSync } = require('child_process');

if (process.env.DEVDROP_INSTALLING_BACKEND === '1') process.exit(0);

const backendDir = path.join(__dirname, '..', '..', 'backend');
const isWindows = process.platform === 'win32';

const result = spawnSync(
  isWindows ? 'npm.cmd' : 'npm',
  ['install', '--omit=dev', '--no-audit', '--no-fund'],
  {
    cwd: backendDir,
    stdio: 'inherit',
    shell: isWindows, // npm.cmd needs a shell on recent Node versions
    env: { ...process.env, DEVDROP_INSTALLING_BACKEND: '1' },
  }
);

if (result.error) {
  console.error('Failed to install backend dependencies:', result.error.message);
  process.exit(1);
}
process.exit(result.status === null ? 1 : result.status);
