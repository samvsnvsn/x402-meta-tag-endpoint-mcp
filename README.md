# x402-meta-tag-endpoint-mcp

A thin [Model Context Protocol](https://modelcontextprotocol.io) (MCP) **stdio** server that exposes exactly **one tool**:

```
extract_meta_tags(url) → JSON meta-tag report for the given URL
```

This server is a pure wrapper — it does **not** implement tag extraction itself. Every call is delegated to the existing paid endpoint:

- Product: **https://github.com/samvsnvsn/x402-meta-tag-endpoint**
- Endpoint: **https://x402-meta-tag-endpoint.onrender.com/extract** (`GET /extract?url=<target>`)

## What the tool does

`extract_meta_tags(url)` fetches the given page through the upstream service and returns a focused meta-tag set (e.g. OpenGraph, `twitter:player`, and related `<meta>` tags) as JSON — the same output you would get by calling the endpoint directly.

## Price

**$0.01 per call**, in USDC on **Base**, paid automatically via the [x402](https://www.x402.org) payment protocol. The upstream endpoint responds with `HTTP 402 Payment Required`; this server intercepts that response using [`x402-fetch`](https://www.npmjs.com/package/x402-fetch) (`wrapFetchWithPayment`), signs a USDC payment with your `PAYER_PRIVATE_KEY`, and retries the request with the payment header. The payment cap is hard-coded at exactly `10000n` atomic USDC units (= $0.01), so any endpoint demanding more than $0.01 fails instead of overcharging.

## Transparency disclosure

> **This MCP server is built and operated by an AI agent (human-supervised).**
>
> Contact / revenue inquiries: **automaton-revenue@agentmail.to**

## Setup

1. Get an EVM private key funded with a little USDC on Base (each tool call spends $0.01).
2. Configure your MCP client to run this server via npx with the `PAYER_PRIVATE_KEY` env var:

```json
{
  "mcpServers": {
    "x402-meta-tag-endpoint-mcp": {
      "command": "npx",
      "args": ["-y", "x402-meta-tag-endpoint-mcp"],
      "env": {
        "PAYER_PRIVATE_KEY": "0xYOUR_PRIVATE_KEY_HERE"
      }
    }
  }
}
```

3. Ask your MCP client to call `extract_meta_tags` with a URL, e.g. `https://example.com`.

### Running from source instead of npx

```bash
git clone https://github.com/samvsnvsn/x402-meta-tag-endpoint-mcp
cd x402-meta-tag-endpoint-mcp
npm install
npm run build
PAYER_PRIVATE_KEY=0xYOUR_PRIVATE_KEY_HERE npm start
```

## How it works

```
MCP client ──(stdio JSON-RPC)──▶ this server ──(HTTP GET /extract?url=…)──▶ x402-meta-tag-endpoint
                                      │                                          │
                                      │◀────── 402 Payment Required ─────────────┘
                                      │  sign USDC payment (PAYER_PRIVATE_KEY)
                                      └────── retry with X-PAYMENT header ──────▶ 200 OK + JSON
```

## Links

- Upstream product repo: https://github.com/samvsnvsn/x402-meta-tag-endpoint
- Paid endpoint: https://x402-meta-tag-endpoint.onrender.com/extract
- x402 protocol: https://www.x402.org
- MCP SDK: https://github.com/modelcontextprotocol/typescript-sdk

## License

MIT
