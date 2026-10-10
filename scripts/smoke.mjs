#!/usr/bin/env node
/**
 * Stdio MCP smoke test for x402-meta-tag-endpoint-mcp.
 *
 * Spawns `node dist/index.js` (the compiled stdio MCP server) WITHOUT
 * PAYER_PRIVATE_KEY and performs:
 *   1. MCP initialize handshake
 *   2. notifications/initialized
 *   3. tools/list
 *
 * Expects tools/list to return exactly one tool named "extract_meta_tags".
 * No HTTP request is made to the paid endpoint and no payment is signed:
 * the tool handler only runs when a tool call arrives, and this test never
 * calls tools/call.
 */
import { spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout as sleep } from "node:timers/promises";

const SERVER_CMD = process.argv[2] ?? "node";
const SERVER_ARGS = process.argv.slice(3);
if (SERVER_ARGS.length === 0) SERVER_ARGS.push("dist/index.js");

const child = spawn(SERVER_CMD, SERVER_ARGS, {
  cwd: process.cwd(),
  env: { ...process.env, PAYER_PRIVATE_KEY: undefined }, // never sign anything
  stdio: ["pipe", "pipe", "pipe"],
});

let stdoutBuf = "";
let stderrBuf = "";
let protocolId = 0;
const pending = new Map();

child.stdout.setEncoding("utf8");
child.stdout.on("data", (chunk) => {
  stdoutBuf += chunk;
  let nl;
  while ((nl = stdoutBuf.indexOf("\n")) !== -1) {
    const line = stdoutBuf.slice(0, nl).trim();
    stdoutBuf = stdoutBuf.slice(nl + 1);
    if (!line) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      continue;
    }
    if (msg.id !== undefined && pending.has(msg.id)) {
      const { resolve } = pending.get(msg.id);
      pending.delete(msg.id);
      resolve(msg);
    }
  }
});
child.stderr.setEncoding("utf8");
child.stderr.on("data", (chunk) => {
  stderrBuf += chunk;
});

function request(method, params) {
  const id = ++protocolId;
  const payload = JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n";
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    child.stdin.write(payload);
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`timeout waiting for response to ${method}`));
      }
    }, 15000);
  });
}

function notify(method, params) {
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
}

function exitWith(code, message) {
  console.log(message);
  try { child.kill(); } catch {}
  process.exit(code);
}

try {
  const init = await request("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "smoke-test-client", version: "1.0.0" },
  });
  if (init.error) exitWith(1, `FAIL: initialize returned error ${JSON.stringify(init.error)}`);
  console.log(`initialize OK: server=${init.result?.serverInfo?.name ?? "?"} v${init.result?.serverInfo?.version ?? "?"} protocol=${init.result?.protocolVersion ?? "?"}`);

  notify("notifications/initialized", {});

  const tools = await request("tools/list", {});
  if (tools.error) exitWith(1, `FAIL: tools/list returned error ${JSON.stringify(tools.error)}`);
  const names = (tools.result?.tools ?? []).map((t) => t.name).sort();
  console.log(`tools/list OK: ${JSON.stringify(names)}`);

  const ok = names.length === 1 && names[0] === "extract_meta_tags";
  if (!ok) exitWith(1, `FAIL: expected exactly one tool named extract_meta_tags, got ${JSON.stringify(names)}`);

  console.log("SMOKE TEST PASS: stdio MCP handshake (initialize + tools/list) returned extract_meta_tags");
  try { child.kill(); } catch {}
  process.exit(0);
} catch (err) {
  console.log(`FAIL: ${err.message}\nserver stderr:\n${stderrBuf.slice(-2000)}`);
  try { child.kill(); } catch {}
  process.exit(1);
}
