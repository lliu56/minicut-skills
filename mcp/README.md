# @minicut/mcp

MCP server for the [MiniCut](https://www.minicut.ai) CLI. Any MCP client (Claude Code, Codex, Cursor, Gemini CLI, Claude Desktop) can check setup, start a short film project and ask for the next step.

It runs the `minicut` command on your computer and returns its output. Only free commands are exposed. Paid steps stay in the CLI, which prints the price and waits for your yes.

## Install

1. Install the CLI (Mac or Linux): `curl -fsSL https://minicut.ai/install.sh | bash -s -- --region global`. Windows: https://minicut.ai/install
2. Add the server to your client:

```json
{
  "mcpServers": {
    "minicut": { "command": "npx", "args": ["-y", "@minicut/mcp"] }
  }
}
```

Claude Code: `claude mcp add minicut -- npx -y @minicut/mcp`

## Tools

| Tool | What it runs |
|---|---|
| `minicut_status` | `minicut status` |
| `minicut_doctor` | `minicut doctor` |
| `minicut_setup` | `minicut setup` |
| `minicut_install_skill` | `minicut install-skill` |
| `minicut_new` | `minicut new <id> --title <title>` |
| `minicut_loop_next` | `minicut loop next` |

Sign in once with `minicut login` in a terminal. MiniCut starts with a $2 trial for 60 credits.

MIT license. The MiniCut CLI is a separate package with its own terms.
