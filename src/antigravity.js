import { execFile, spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import os from 'node:os';

// Antigravity "project" used for conversations. 'outside-of-project' has no
// folder attached, so the agent cannot touch any of your workspaces.
const PROJECT_ID = process.env.ANTIGRAVITY_PROJECT_ID || 'outside-of-project';

// Same flags the Antigravity app passes when it spawns its language server.
const LS_BASE_ARGS = [
  '--standalone',
  '--headless',
  '--override_ide_name', 'antigravity',
  '--subclient_type', 'hub',
  '--override_ide_version', '1.0.0',
  '--override_user_agent_name', 'antigravity',
  '--app_data_dir', 'antigravity',
  '--api_server_url', 'https://generativelanguage.googleapis.com',
  '--cloud_code_endpoint', 'https://daily-cloudcode-pa.googleapis.com',
];

const LS_STARTUP_TIMEOUT_MS = 90000;
const RESPONSE_TIMEOUT_MS = 180000;

function firstExisting(paths) {
  return paths.filter(Boolean).find((p) => {
    try {
      return fs.existsSync(p);
    } catch {
      return false;
    }
  });
}

/**
 * Searches and detects the local Antigravity binary and brain directories
 * across Linux, macOS, WSL, and Windows.
 */
export function detectAntigravity() {
  const home = os.homedir();
  const platform = process.platform;

  // language_server binary: hosts both the headless server and the agentapi CLI
  const candidateBins = [
    process.env.ANTIGRAVITY_LS_BINARY,
    process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, 'Programs', 'antigravity', 'resources', 'bin', 'language_server.exe')
      : null,
    process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, 'Programs', 'Antigravity', 'resources', 'bin', 'language_server.exe')
      : null,
    '/Applications/Antigravity.app/Contents/Resources/bin/language_server',
    '/usr/share/antigravity/resources/bin/language_server',
    '/opt/antigravity/resources/bin/language_server',
  ];

  const candidateBrainDirs = [
    process.env.ANTIGRAVITY_BRAIN_DIR,
    process.env.BRAIN_DIR,
    path.join(home, '.gemini', 'antigravity', 'brain'),
    process.env.APPDATA ? path.join(process.env.APPDATA, 'Antigravity', 'brain') : null,
  ];

  const binaryPath = firstExisting(candidateBins);
  const brainDir = firstExisting(candidateBrainDirs);

  return {
    binaryPath: binaryPath || candidateBins.filter(Boolean)[0] || 'language_server',
    isBinaryFound: Boolean(binaryPath),
    brainDir: brainDir || path.join(home, '.gemini', 'antigravity', 'brain'),
    isBrainFound: Boolean(brainDir),
    platform,
  };
}

/**
 * Normalizes input model names to Antigravity's supported flags:
 * 'flash', 'pro', or 'flash_lite'.
 */
export function mapModel(model) {
  if (!model) return 'flash';
  const m = String(model).toLowerCase();
  if (m.includes('pro')) return 'pro';
  if (m.includes('lite')) return 'flash_lite';
  return 'flash';
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

let lsPromise = null;

/**
 * Returns { address, csrf } of a running language server. Reuses the one from
 * the Antigravity IDE terminal when present; otherwise spawns a headless one
 * that lives as long as this MCP process.
 */
function ensureLanguageServer(env) {
  if (process.env.ANTIGRAVITY_LS_ADDRESS) {
    return Promise.resolve({
      address: process.env.ANTIGRAVITY_LS_ADDRESS,
      csrf: process.env.ANTIGRAVITY_CSRF_TOKEN || '',
    });
  }
  if (!lsPromise) {
    lsPromise = startLanguageServer(env).catch((err) => {
      lsPromise = null;
      throw err;
    });
  }
  return lsPromise;
}

async function startLanguageServer(env) {
  if (!env.isBinaryFound) {
    throw new Error(
      `Antigravity language_server not found (${env.binaryPath}). Set ANTIGRAVITY_LS_BINARY to its path.`
    );
  }

  const port = await getFreePort();
  const csrf = crypto.randomUUID();
  const args = [...LS_BASE_ARGS, '--http_server_port', String(port), '--csrf_token', csrf];

  const proc = spawn(env.binaryPath, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  const killLs = () => {
    try {
      proc.kill();
    } catch {
      // already gone
    }
  };
  process.on('exit', killLs);

  return new Promise((resolve, reject) => {
    let output = '';
    let settled = false;

    const finish = (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err) {
        killLs();
        reject(err);
      } else {
        resolve({ address: `localhost:${port}`, csrf });
      }
    };

    const onData = (chunk) => {
      output = (output + chunk.toString()).slice(-20000);
      if (output.includes('Starting login')) {
        finish(
          new Error(
            'Antigravity headless session is not logged in. Run the language server once in a terminal ' +
              '(see README, "Login do modo headless") and sign in with Google.'
          )
        );
      } else if (output.includes('initialized server successfully')) {
        finish();
      }
    };
    proc.stdout.on('data', onData);
    proc.stderr.on('data', onData);

    proc.on('error', (err) => finish(new Error(`Failed to start language server: ${err.message}`)));
    proc.on('exit', (code) => {
      lsPromise = null;
      finish(new Error(`Language server exited during startup (code ${code}).\n${output.slice(-2000)}`));
    });

    const timer = setTimeout(
      () => finish(new Error(`Language server did not start within ${LS_STARTUP_TIMEOUT_MS / 1000}s`)),
      LS_STARTUP_TIMEOUT_MS
    );
  });
}

function runAgentApi(env, ls, args) {
  return new Promise((resolve, reject) => {
    execFile(
      env.binaryPath,
      ['agentapi', ...args],
      {
        windowsHide: true,
        env: {
          ...process.env,
          ANTIGRAVITY_LS_ADDRESS: ls.address,
          ANTIGRAVITY_CSRF_TOKEN: ls.csrf,
          ANTIGRAVITY_PROJECT_ID: PROJECT_ID,
        },
      },
      (err, stdout, stderr) => {
        let res;
        try {
          res = JSON.parse(stdout);
        } catch {
          return reject(
            new Error(`Failed to invoke agentapi: ${err ? err.message : 'invalid output'}\n${stdout}${stderr || ''}`)
          );
        }
        if (res.error) return reject(new Error(`agentapi error: ${res.error}`));
        resolve(res);
      }
    );
  });
}

function readTranscript(file) {
  if (!fs.existsSync(file)) return [];
  const raw = fs.readFileSync(file, 'utf8').trim();
  if (!raw) return [];
  return raw.split('\n').map((line) => JSON.parse(line));
}

/**
 * Invokes Gemini via Antigravity local agentapi and waits for output.
 */
export async function queryAntigravity({ prompt, model = 'flash', systemInstruction }) {
  const env = detectAntigravity();
  const agyModel = mapModel(model);

  let fullPrompt = prompt;
  if (systemInstruction) {
    fullPrompt = `[INSTRUCTIONS]: ${systemInstruction}\n\n[USER REQUEST]:\n${prompt}`;
  }

  // Step 1: Start new conversation
  const ls = await ensureLanguageServer(env);
  const res = await runAgentApi(env, ls, ['new-conversation', `--model=${agyModel}`, fullPrompt]);
  const convId = res?.response?.newConversation?.conversationId;
  if (!convId) throw new Error(`No conversationId returned by Antigravity: ${JSON.stringify(res)}`);

  // Step 2: Poll transcript until the last step is a finished model response
  // and the file has stopped changing (the agent may take several steps).
  const logsDir = path.join(env.brainDir, convId, '.system_generated', 'logs');
  const transcriptPath = path.join(logsDir, 'transcript.jsonl');
  const transcriptFullPath = path.join(logsDir, 'transcript_full.jsonl');

  const startTime = Date.now();
  let lastSize = -1;
  let stableTicks = 0;

  return new Promise((resolve, reject) => {
    const checkInterval = setInterval(() => {
      if (Date.now() - startTime > RESPONSE_TIMEOUT_MS) {
        clearInterval(checkInterval);
        return reject(
          new Error(`Timeout: Antigravity did not produce a response within ${RESPONSE_TIMEOUT_MS / 1000}s`)
        );
      }

      let entries;
      try {
        const size = fs.existsSync(transcriptPath) ? fs.statSync(transcriptPath).size : 0;
        stableTicks = size === lastSize ? stableTicks + 1 : 0;
        lastSize = size;
        entries = readTranscript(transcriptPath);
      } catch {
        return; // File may be mid-write, wait for next tick
      }

      const lastIndex = entries.length - 1;
      const last = entries[lastIndex];
      if (!last || last.type !== 'PLANNER_RESPONSE' || last.status !== 'DONE' || stableTicks < 3) {
        return;
      }
      clearInterval(checkInterval);

      let responseText = last.content || '';
      let thinking = last.thinking || '';

      if (last.truncated_fields) {
        try {
          const fullEntry = readTranscript(transcriptFullPath)[lastIndex];
          if (fullEntry) {
            responseText = fullEntry.content || responseText;
            thinking = fullEntry.thinking || thinking;
          }
        } catch {
          // Ignore fallback error
        }
      }

      let result = '';
      if (thinking) {
        result += `<thinking>\n${thinking}\n</thinking>\n\n`;
      }
      result += responseText;
      resolve(result);
    }, 400);
  });
}
