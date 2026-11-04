#!/usr/bin/env node
// MCP server for the MiniCut CLI. It runs the `minicut` command already on this
// computer and returns its output. Only free commands are exposed: paid steps stay
// in the CLI, which prints the price and waits for the user's yes.
import { execFile } from "node:child_process";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const INSTALL_HINT =
  "The MiniCut CLI is not installed. Install it (Mac or Linux) with " +
  "`curl -fsSL https://minicut.ai/install.sh | bash -s -- --region global`, then run the minicut_setup tool. Docs: https://www.minicut.ai";

function run(args, cwd) {
  const env = { ...process.env };
  if (!env.MINICUT_FROM) env.MINICUT_FROM = "mcp";
  return new Promise((resolve) => {
    execFile(
      "minicut",
      args,
      { cwd: cwd || process.cwd(), timeout: 120_000, maxBuffer: 4 * 1024 * 1024, env },
      (err, stdout, stderr) => {
        if (err && err.code === "ENOENT") {
          resolve({ content: [{ type: "text", text: INSTALL_HINT }], isError: true });
          return;
        }
        const text = [stdout, stderr].filter(Boolean).join("\n").trim() || "(no output)";
        const exit = err ? ` (exit code ${err.code ?? "unknown"})` : "";
        resolve({ content: [{ type: "text", text: text + exit }], isError: Boolean(err) });
      },
    );
  });
}

const server = new McpServer({ name: "minicut", version: "0.1.0" });

server.registerTool(
  "minicut_status",
  { title: "MiniCut status", description: "Show whether the MiniCut CLI is installed and this computer is signed in.", inputSchema: {} },
  () => run(["status"]),
);

server.registerTool(
  "minicut_doctor",
  { title: "MiniCut doctor", description: "Check the tools MiniCut needs and name anything missing.", inputSchema: {} },
  () => run(["doctor"]),
);

server.registerTool(
  "minicut_setup",
  { title: "MiniCut setup", description: "Install the tools MiniCut needs on this computer. Free.", inputSchema: {} },
  () => run(["setup"]),
);

server.registerTool(
  "minicut_install_skill",
  { title: "Install MiniCut skill", description: "Install MiniCut's step-by-step film skill into the user's agent.", inputSchema: {} },
  () => run(["install-skill"]),
);

server.registerTool(
  "minicut_new",
  {
    title: "New MiniCut project",
    description:
      "Start a new short film project folder. Free. Needs this computer signed in (the user runs `minicut login` in a terminal first).",
    inputSchema: {
      id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/).describe("Short id: lowercase letters, numbers and dashes"),
      title: z.string().min(1).max(200).regex(/^[^-]/, "Title cannot start with a dash").describe("Film title"),
      cwd: z.string().optional().describe("Folder to create the project in"),
    },
  },
  ({ id, title, cwd }) => run(["new", id, "--title", title], cwd),
);

server.registerTool(
  "minicut_loop_next",
  {
    title: "MiniCut next step",
    description:
      "Inside a project folder, print the next command to run and why. Paid commands still print their price and wait for the user's yes in the CLI.",
    inputSchema: { cwd: z.string().describe("The project folder") },
  },
  ({ cwd }) => run(["loop", "next"], cwd),
);

await server.connect(new StdioServerTransport());
