import readline from 'node:readline';
import { queryAntigravity, detectAntigravity } from './antigravity.js';

export const SERVER_NAME = 'antigravity-claude-mcp';
export const SERVER_VERSION = '1.0.0';

export const TOOLS = [
  {
    name: 'ask_gemini',
    description:
      'Send a query to Google Gemini (Gemini 3.8 Flash, Gemini 3.8 Pro, etc.) powered directly by local Antigravity. Zero API key needed!',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'The prompt or query for Gemini.',
        },
        model: {
          type: 'string',
          enum: ['flash', 'pro', 'flash_lite', 'gemini-3.8-flash', 'gemini-3.8-pro', 'gemini-2.5-pro', 'gemini-2.5-flash'],
          description: "Model to use. 'flash' (Gemini 3.8 Flash, fast) or 'pro' (Gemini 3.8 Pro, reasoning). Defaults to 'flash'.",
        },
        system_instruction: {
          type: 'string',
          description: 'Optional system prompt or instructions to guide Gemini behavior.',
        },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'gemini_chat',
    description:
      'Multi-turn conversation with Gemini powered by Antigravity.',
    inputSchema: {
      type: 'object',
      properties: {
        messages: {
          type: 'array',
          description: 'Array of conversation messages with role and content.',
          items: {
            type: 'object',
            properties: {
              role: {
                type: 'string',
                enum: ['user', 'model', 'assistant'],
                description: 'Speaker role.',
              },
              content: {
                type: 'string',
                description: 'Message text.',
              },
            },
            required: ['role', 'content'],
          },
        },
        model: {
          type: 'string',
          description: "Model to use ('flash' or 'pro').",
        },
        system_instruction: {
          type: 'string',
          description: 'Optional system instructions.',
        },
      },
      required: ['messages'],
    },
  },
  {
    name: 'gemini_analyze_code',
    description:
      'Deep code review, architectural reasoning, optimization, or unit test generation with Gemini Pro.',
    inputSchema: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'Source code to analyze.',
        },
        instruction: {
          type: 'string',
          description: 'Instruction (e.g. "Review for bugs and edge cases", "Optimize algorithm", "Generate tests").',
        },
        language: {
          type: 'string',
          description: 'Programming language (e.g. python, typescript, rust).',
        },
        model: {
          type: 'string',
          description: "Model to use (defaults to 'pro').",
        },
      },
      required: ['code', 'instruction'],
    },
  },
  {
    name: 'gemini_status',
    description:
      'Check the connection status and environment detection of Antigravity on this machine.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

function log(...args) {
  console.error(`[${SERVER_NAME}]`, ...args);
}

async function executeTool(name, args = {}) {
  switch (name) {
    case 'ask_gemini': {
      const response = await queryAntigravity({
        prompt: args.prompt,
        model: args.model || 'flash',
        systemInstruction: args.system_instruction,
      });
      return {
        content: [{ type: 'text', text: response }],
      };
    }

    case 'gemini_chat': {
      const messages = args.messages || [];
      const transcript = messages
        .map((m) => `${m.role === 'model' || m.role === 'assistant' ? 'Gemini' : 'User'}: ${m.content}`)
        .join('\n\n');

      const response = await queryAntigravity({
        prompt: `Continue the following conversation as the assistant:\n\n${transcript}\n\nAssistant:`,
        model: args.model || 'flash',
        systemInstruction: args.system_instruction,
      });
      return {
        content: [{ type: 'text', text: response }],
      };
    }

    case 'gemini_analyze_code': {
      const lang = args.language ? ` [Language: ${args.language}]` : '';
      const prompt = `Instruction: ${args.instruction}

Source Code${lang}:
\`\`\`${args.language || ''}
${args.code}
\`\`\``;

      const response = await queryAntigravity({
        prompt,
        model: args.model || 'pro',
        systemInstruction:
          'You are a senior software engineer and architect. Provide clear, precise, actionable feedback with code examples.',
      });
      return {
        content: [{ type: 'text', text: response }],
      };
    }

    case 'gemini_status': {
      const status = detectAntigravity();
      return {
        content: [
          {
            type: 'text',
            text: `✅ **Antigravity Claude MCP Connector**\n\n- **Platform**: ${status.platform}\n- **Binary Path**: ${status.binaryPath} (${status.isBinaryFound ? 'Found ✅' : 'Missing ❌'})\n- **Brain Directory**: ${status.brainDir} (${status.isBrainFound ? 'Found ✅' : 'Missing ❌'})\n- **Authentication**: Antigravity Native Session (Zero API Key needed!)\n- **Supported Models**:\n  • \`flash\` (Gemini 3.8 Flash)\n  • \`pro\` (Gemini 3.8 Pro)\n  • \`flash_lite\` (Gemini Flash Lite)`,
          },
        ],
      };
    }

    default:
      throw new Error(`Tool not found: "${name}"`);
  }
}

async function handleRpcMessage(msg) {
  const { id, method, params } = msg;

  if (method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      },
    };
  }

  if (method === 'notifications/initialized') return null;
  if (method === 'ping') return { jsonrpc: '2.0', id, result: {} };
  if (method === 'tools/list') return { jsonrpc: '2.0', id, result: { tools: TOOLS } };

  if (method === 'tools/call') {
    const toolName = params?.name;
    const toolArgs = params?.arguments || {};
    try {
      const result = await executeTool(toolName, toolArgs);
      return { jsonrpc: '2.0', id, result };
    } catch (err) {
      log(`Error in tool ${toolName}:`, err.message);
      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [{ type: 'text', text: `Error running ${toolName}: ${err.message}` }],
          isError: true,
        },
      };
    }
  }

  if (id !== undefined && id !== null) {
    return {
      jsonrpc: '2.0',
      id,
      error: { code: -32601, message: `Method not found: ${method}` },
    };
  }

  return null;
}

export function startMcpServer() {
  log(`Starting Antigravity-Claude MCP Server v${SERVER_VERSION}...`);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });

  rl.on('line', async (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    try {
      const request = JSON.parse(trimmed);
      const response = await handleRpcMessage(request);
      if (response) {
        process.stdout.write(JSON.stringify(response) + '\n');
      }
    } catch (err) {
      log('JSON Parse error:', trimmed, err.message);
      process.stdout.write(
        JSON.stringify({
          jsonrpc: '2.0',
          id: null,
          error: { code: -32700, message: `Parse error: ${err.message}` },
        }) + '\n'
      );
    }
  });

  rl.on('close', () => {
    log('Connection closed.');
    process.exit(0);
  });
}
