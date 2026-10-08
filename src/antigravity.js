import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

/**
 * Searches and detects the local Antigravity binary and brain directories
 * across Linux, macOS, WSL, and Windows.
 */
export function detectAntigravity() {
  const home = os.homedir();
  const platform = process.platform;

  // Potential binary locations
  const candidateBins = [
    process.env.ANTIGRAVITY_BIN,
    process.env.AGENTAPI_PATH,
    // Linux / WSL standard paths
    path.join(home, '.gemini', 'antigravity', 'bin', 'agentapi'),
    path.join(home, '.gemini', 'antigravity', 'bin', 'agentapi.exe'),
    '/usr/local/bin/agentapi',
    // Windows paths
    process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, 'Programs', 'Antigravity IDE', 'bin', 'agentapi.exe')
      : null,
    process.env.APPDATA
      ? path.join(process.env.APPDATA, 'Antigravity', 'bin', 'agentapi.cmd')
      : null,
  ].filter(Boolean);

  let binaryPath = candidateBins.find((p) => {
    try {
      return fs.existsSync(p);
    } catch {
      return false;
    }
  });

  // Potential brain/log directory locations
  const candidateBrainDirs = [
    process.env.ANTIGRAVITY_BRAIN_DIR,
    process.env.BRAIN_DIR,
    path.join(home, '.gemini', 'antigravity', 'brain'),
    process.env.APPDATA
      ? path.join(process.env.APPDATA, 'Antigravity', 'brain')
      : null,
  ].filter(Boolean);

  let brainDir = candidateBrainDirs.find((p) => {
    try {
      return fs.existsSync(p);
    } catch {
      return false;
    }
  });

  return {
    binaryPath: binaryPath || candidateBins[2] || 'agentapi',
    isBinaryFound: Boolean(binaryPath),
    brainDir: brainDir || candidateBrainDirs[2],
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
  const convId = await new Promise((resolve, reject) => {
    execFile(
      env.binaryPath,
      ['new-conversation', `--model=${agyModel}`, fullPrompt],
      (err, stdout, stderr) => {
        if (err) {
          return reject(
            new Error(
              `Failed to invoke Antigravity (${env.binaryPath}): ${err.message}\n${stderr || ''}`
            )
          );
        }
        try {
          const res = JSON.parse(stdout);
          const id = res?.response?.newConversation?.conversationId;
          if (!id) throw new Error('No conversationId returned by Antigravity');
          resolve(id);
        } catch (e) {
          reject(new Error(`Failed to parse agentapi response: ${stdout}`));
        }
      }
    );
  });

  // Step 2: Poll transcript file for model response
  const transcriptPath = path.join(env.brainDir, convId, '.system_generated', 'logs', 'transcript.jsonl');
  const transcriptFullPath = path.join(env.brainDir, convId, '.system_generated', 'logs', 'transcript_full.jsonl');

  const startTime = Date.now();
  const TIMEOUT_MS = 90000; // 90s max wait

  return new Promise((resolve, reject) => {
    const checkInterval = setInterval(() => {
      if (Date.now() - startTime > TIMEOUT_MS) {
        clearInterval(checkInterval);
        return reject(
          new Error(`Timeout: Antigravity did not produce a response within ${TIMEOUT_MS / 1000}s`)
        );
      }

      if (!fs.existsSync(transcriptPath)) {
        return;
      }

      try {
        const rawContent = fs.readFileSync(transcriptPath, 'utf8').trim();
        if (!rawContent) return;

        const lines = rawContent.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const entry = JSON.parse(lines[i]);
          if (entry.type === 'PLANNER_RESPONSE' && (entry.status === 'DONE' || entry.content)) {
            clearInterval(checkInterval);

            let responseText = entry.content || '';
            let thinking = entry.thinking || '';

            if (entry.truncated_fields && fs.existsSync(transcriptFullPath)) {
              try {
                const fullContent = fs.readFileSync(transcriptFullPath, 'utf8').trim();
                const fullLines = fullContent.split('\n');
                if (fullLines[i]) {
                  const fullEntry = JSON.parse(fullLines[i]);
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

            return resolve(result);
          }
        }
      } catch {
        // File may be in mid-write, wait for next tick
      }
    }, 350);
  });
}
