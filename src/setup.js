import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { detectAntigravity } from './antigravity.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BIN_ENTRY = path.resolve(__dirname, '..', 'bin', 'index.js');

/**
 * Finds the Claude Desktop config path on the current OS.
 */
export function getClaudeDesktopConfigPath() {
  const home = os.homedir();
  const platform = process.platform;

  if (platform === 'win32' || process.env.APPDATA) {
    const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    return path.join(appData, 'Claude', 'claude_desktop_config.json');
  } else if (platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
  } else {
    // Linux / WSL
    return path.join(home, '.config', 'Claude', 'claude_desktop_config.json');
  }
}

/**
 * Automatically configures Claude Desktop by editing or creating claude_desktop_config.json.
 */
export function configureClaudeDesktop() {
  const configPath = getClaudeDesktopConfigPath();
  const isWsl = process.platform === 'linux' && fs.existsSync('/proc/sys/fs/binfmt_misc/WSLInterop');

  let config = { mcpServers: {} };

  if (fs.existsSync(configPath)) {
    try {
      const raw = fs.readFileSync(configPath, 'utf8');
      config = JSON.parse(raw);
      if (!config.mcpServers) config.mcpServers = {};
    } catch (e) {
      console.warn(`⚠️ Warning: Existing config at ${configPath} was not valid JSON. Creating backup.`);
      fs.copyFileSync(configPath, `${configPath}.bak`);
    }
  } else {
    // Create directory if missing
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
  }

  // Choose appropriate command depending on whether WSL or native
  if (isWsl) {
    config.mcpServers['antigravity'] = {
      command: 'wsl.exe',
      args: ['-e', process.execPath, BIN_ENTRY],
    };
  } else {
    config.mcpServers['antigravity'] = {
      command: process.execPath,
      args: [BIN_ENTRY],
    };
  }

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
  return { configPath, config };
}

/**
 * Runs the diagnostic check.
 */
export function runCheck() {
  const env = detectAntigravity();
  console.log('\n🔍 --- ANTIGRAVITY CLAUDE CONNECTOR CHECK ---');
  console.log(`OS Platform     : ${env.platform}`);
  console.log(`Node Runtime    : ${process.version} (${process.execPath})`);
  console.log(`Entrypoint      : ${BIN_ENTRY}`);
  console.log(`Antigravity Bin : ${env.binaryPath} -> ${env.isBinaryFound ? '✅ DETECTED' : '❌ NOT FOUND'}`);
  console.log(`Brain Directory : ${env.brainDir} -> ${env.isBrainFound ? '✅ DETECTED' : '❌ NOT FOUND'}`);

  const claudePath = getClaudeDesktopConfigPath();
  console.log(`Claude Config   : ${claudePath} -> ${fs.existsSync(claudePath) ? '✅ EXISTS' : 'ℹ️ NOT CREATED YET'}`);

  console.log('\n📋 --- INSTRUÇÕES RÁPIDAS DE USO ---');
  console.log('1️⃣  Para o Claude Code (Terminal):');
  console.log(`   claude mcp add antigravity ${process.execPath} "${BIN_ENTRY}"`);
  console.log('\n2️⃣  Para o Claude Desktop (Instalação Automática):');
  console.log('   node bin/index.js setup');
  console.log('--------------------------------------------\n');
}
