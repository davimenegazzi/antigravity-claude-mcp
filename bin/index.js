#!/usr/bin/env node

/**
 * Antigravity Claude MCP Connector
 * Connect Claude (Desktop & Code) to Google Gemini through Antigravity.
 * Zero API keys required!
 */

import { startMcpServer } from '../src/mcp-server.js';
import { runCheck, configureClaudeDesktop } from '../src/setup.js';

const arg = (process.argv[2] || '').toLowerCase();

if (arg === 'setup' || arg === 'install') {
  try {
    const res = configureClaudeDesktop();
    console.log(`✅ Sucesso! Claude Desktop configurado em:\n   ${res.configPath}`);
    console.log('\nReinicie o Claude Desktop para começar a usar o Gemini!');
  } catch (err) {
    console.error('❌ Erro ao configurar Claude Desktop:', err.message);
    process.exit(1);
  }
} else if (arg === '--check' || arg === 'check' || arg === 'status') {
  runCheck();
} else {
  // Default: Start MCP stdio server
  startMcpServer();
}
