# 🚀 Antigravity Claude MCP Connector

> Conector MCP (**Model Context Protocol**) oficial para utilizar **Google Gemini (Gemini 3.8 Flash, Gemini 2.5 Pro, etc.)** dentro do **Claude** (Claude Code e Claude Desktop) através da autenticação nativa do **Google Antigravity**.

✨ **VANTAGEM EXCLUSIVA: ZERO API KEY** ✨  
Você **não precisa** de chave de API (`GEMINI_API_KEY`) nem de cartão de crédito no Google AI Studio. Este conector se comunica diretamente com a sessão local autenticada do Antigravity, trazendo respostas instantâneas dos modelos Gemini sem custo de API.

---

## 📋 Sumário
- [Requisitos e Dependências](#-requisitos-e-dependências)
- [Instalação no Claude Code (Terminal)](#-instalação-no-claude-code)
- [Instalação no Claude Desktop](#-instalação-no-claude-desktop)
- [Como Utilizar Dentro do Claude](#-como-utilizar-dentro-do-claude)
- [Ferramentas Disponíveis (MCP Tools)](#-ferramentas-disponíveis)
- [Verificação e Diagnóstico](#-verificação-e-diagnóstico)
- [Licença](#-licença)

---

## 📦 Requisitos e Dependências

- **Node.js**: Versão 18.0.0 ou superior (instalado no sistema).
- **Google Antigravity**: Instalado na máquina. O app **não precisa estar aberto**: o MCP sobe o `language_server` do Antigravity em modo headless sozinho (porta e token aleatórios) e o encerra quando o Claude desconecta. Só é preciso fazer o login do modo headless uma vez (veja abaixo).
- **Claude**:
  - [Claude Code](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview) (CLI) **ou**
  - [Claude Desktop](https://claude.ai/download) (Windows, Mac ou Linux).

> 💡 **Zero Dependências npm**: Este projeto não requer `npm install` nem baixa pastas `node_modules`. Ele utiliza módulos padrão nativos do Node.js, garantindo execução ultrarrápida e sem conflitos.

---

## 🔑 Login do modo headless

O modo headless guarda o login num arquivo próprio, separado do login do app. Faça uma vez (Windows, PowerShell):

```powershell
& "$env:LOCALAPPDATA\Programs\antigravity\resources\bin\language_server.exe" --standalone --headless --override_ide_name antigravity --subclient_type hub --override_ide_version 1.0.0 --override_user_agent_name antigravity --http_server_port 5387 --csrf_token login --app_data_dir antigravity --api_server_url https://generativelanguage.googleapis.com --cloud_code_endpoint https://daily-cloudcode-pa.googleapis.com
```

Abra o link que aparecer, entre com sua conta Google e aguarde `initialized server successfully`. Depois feche com `Ctrl+C`.

Variáveis opcionais:
- `ANTIGRAVITY_LS_BINARY`: caminho do `language_server` se não for detectado automaticamente.
- `ANTIGRAVITY_PROJECT_ID`: projeto do Antigravity usado nas conversas. Padrão `outside-of-project` (sem pasta, o agente não acessa seus workspaces).
- Se `ANTIGRAVITY_LS_ADDRESS` e `ANTIGRAVITY_CSRF_TOKEN` existirem (terminal do Antigravity), o MCP usa o servidor do app em vez de subir um próprio.

> ⚠️ Essas flags não são documentadas pelo Google; são as mesmas que o app usa internamente. Uma atualização do Antigravity pode mudá-las.

---

## 💻 Instalação no Claude Code

### Passo 1: Clone o Repositório
Escolha uma pasta no seu computador e faça o clone:
```bash
git clone https://github.com/DaviMenegazzi/antigravity-claude-mcp.git
cd antigravity-claude-mcp
```

### Passo 2: Adicione o MCP ao Claude Code
Use o caminho absoluto (com caminho relativo o MCP só funciona quando o Claude é aberto nesta pasta):

```bash
claude mcp add -s user antigravity -- node "$(pwd)/bin/index.js"
```

### Passo 3: Verifique se foi adicionado
```bash
claude mcp list
```
Você verá `antigravity` listado com status ativo!

---

## 🖥️ Instalação no Claude Desktop

### Opção A: Instalação Automática (Recomendada)
Dentro da pasta do projeto, execute:
```bash
node bin/index.js setup
```
O script detecta seu sistema operacional (Windows, macOS ou Linux) e atualiza o arquivo `claude_desktop_config.json` automaticamente, preservando outras configurações que você já tenha!

---

### Opção B: Configuração Manual

Abra ou crie o arquivo de configuração do Claude Desktop:
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

#### Configuração para Windows (usando WSL ou Node nativo):

**Se o Antigravity estiver no WSL:**
```json
{
  "mcpServers": {
    "antigravity": {
      "command": "wsl.exe",
      "args": [
        "-e",
        "node",
        "/caminho/para/antigravity-claude-mcp/bin/index.js"
      ]
    }
  }
}
```

**Se executado nativamente (Linux, Mac ou Windows puro):**
```json
{
  "mcpServers": {
    "antigravity": {
      "command": "node",
      "args": [
        "/caminho/absoluto/para/antigravity-claude-mcp/bin/index.js"
      ]
    }
  }
}
```

Após salvar, reinicie o Claude Desktop.

---

## 🎯 Como Utilizar Dentro do Claude

Com o conector ativo, o Claude ganha acesso imediato às ferramentas do Gemini. Você pode interagir de forma totalmente natural:

### 1. Pedir uma segunda opinião ou consulta direta:
> *"Claude, use a ferramenta ask_gemini para pedir a opinião do Gemini sobre como estruturar este banco de dados."*

### 2. Usar o Gemini Pro para raciocínio complexo ou código:
> *"Claude, passe esse trecho de código para o Gemini com o modelo 'pro' e peça para analisar possíveis problemas de concorrência."*

### 3. Comparar respostas entre modelos:
> *"Claude, resolva essa questão você mesmo e depois chame o Gemini Flash via ask_gemini para comparar suas abordagens."*

### 4. Bate-papo contextual contínuo:
> *"Claude, use a ferramenta gemini_chat para discutir esse tópico mantendo o histórico de mensagens."*

---

## 🛠️ Ferramentas Disponíveis

| Ferramenta | Descrição | Parâmetros Principais |
| :--- | :--- | :--- |
| `ask_gemini` | Envia um prompt para o Gemini | `prompt` *(obrigatório)*, `model` (`'flash'`, `'pro'`, `'flash_lite'`), `system_instruction` |
| `gemini_chat` | Conversa interativa multi-turno | `messages` *(array de mensagens)*, `model`, `system_instruction` |
| `gemini_analyze_code`| Revisão e refatoração arquitetural de código com Gemini Pro | `code`, `instruction`, `language`, `model` |
| `gemini_status` | Diagnóstico de conexão do Antigravity e modelos | N/A |

### 🧠 Modelos Disponíveis:
- **`flash`** *(Padrão)*: Gemini 3.8 Flash — Extremamente rápido e inteligente.
- **`pro`**: Gemini Pro (ex: Gemini 2.5 Pro) — Raciocínio profundo, arquitetura e análise minuciosa.
- **`flash_lite`**: Gemini Flash Lite — Respostas ultrarrápidas para tarefas simples.

---

## 🔍 Verificação e Diagnóstico

Para testar se o Antigravity está detectado corretamente no seu PC antes de abrir o Claude, rode:

```bash
node bin/index.js --check
```

Exemplo de saída:
```text
🔍 --- ANTIGRAVITY CLAUDE CONNECTOR CHECK ---
OS Platform     : linux
Node Runtime    : v20.20.2
Entrypoint      : /caminho/antigravity-claude-mcp/bin/index.js
Antigravity Bin : ~/.gemini/antigravity/bin/agentapi -> ✅ DETECTED
Brain Directory : ~/.gemini/antigravity/brain -> ✅ DETECTED
```

---

## 📄 Licença

Distribuído sob a licença [MIT](LICENSE). Desenvolvido por [Davi Menegazzi](https://github.com/DaviMenegazzi).
