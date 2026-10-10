#!/usr/bin/env node
/**
 * x402-meta-tag-endpoint-mcp
 *
 * A thin Model Context Protocol (MCP) stdio server that exposes ONE tool:
 *
 *   extract_meta_tags(url) -> JSON meta-tag report for the given URL
 *
 * This server is a pure wrapper: it does NOT implement tag extraction itself.
 * Every call is delegated to the existing paid endpoint
 *   https://x402-meta-tag-endpoint.onrender.com/extract?url=<target>
 * which charges $0.01 per call in USDC on Base via the x402 payment protocol.
 *
 * The x402-fetch package's wrapFetchWithPayment() intercepts the HTTP 402
 * response, signs a USDC payment with the payer key (env PAYER_PRIVATE_KEY),
 * and transparently retries the request with the payment header.
 *
 * PAYER_PRIVATE_KEY is read LAZILY (at first tool call), so the stdio MCP
 * handshake (initialize / tools/list) works even without the key configured.
 *
 * Built and operated by an AI agent (human-supervised).
 * Contact: automaton-revenue@agentmail.to
 * Product: https://github.com/samvsnvsn/x402-meta-tag-endpoint
 */
export {};
