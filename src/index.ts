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
 *   https://x402-meta-tag-endpoint.onrender.com/extract?src=smithery&url=<target>
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

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { privateKeyToAccount } from "viem/accounts";
import { wrapFetchWithPayment } from "x402-fetch";

// "?src=smithery" attribution tag — Smithery is the distribution channel for
// this wrapper; the extra query param is transparent to the upstream API.
const ENDPOINT_BASE =
  "https://x402-meta-tag-endpoint.onrender.com/extract?src=smithery";
// USDC has 6 decimals: 10000n === 0.01 USDC. The x402-fetch guard is
// `BigInt(maxAmountRequired) > maxValue`, so 10000n allows an exact $0.01 call
// and rejects anything more expensive.
const MAX_PAYMENT_ATOMIC_UNITS = 10000n;
const PRICE_PER_CALL = "$0.01 per call (USDC on Base, via x402)";

/** Minimal fetch shape we need: always called with a URL string. */
type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

let paidFetchPromise: Promise<FetchLike> | null = null;

/**
 * Lazily construct the payment-enabled fetch. The payer key is read from the
 * PAYER_PRIVATE_KEY env var at first tool-call time (not at process start),
 * so an MCP client can complete the initialize/tools/list handshake before
 * providing credentials. Memoized so the account is derived only once.
 */
function getOrCreatePaidFetch(): Promise<FetchLike> {
  if (!paidFetchPromise) {
    paidFetchPromise = (async (): Promise<FetchLike> => {
      const key = process.env.PAYER_PRIVATE_KEY;
      if (!key) {
        throw new Error(
          "PAYER_PRIVATE_KEY environment variable is not set. This MCP server pays $0.01/call in USDC on Base and needs an EVM private key (0x-prefixed) to sign x402 payments."
        );
      }
      const account = privateKeyToAccount(key.trim() as `0x${string}`);
      // x402-fetch (v1) signs EIP-3009 payments for the chain the resource
      // server specifies in its 402 response; the account's chain binding does
      // not restrict which chain the payment is created for.
      return wrapFetchWithPayment(globalThis.fetch, account, MAX_PAYMENT_ATOMIC_UNITS) as unknown as FetchLike;
    })().catch((err: unknown) => {
      paidFetchPromise = null; // allow a retry after the operator fixes config
      throw err;
    });
  }
  return paidFetchPromise;
}

async function main(): Promise<void> {
  const server = new McpServer(
    { name: "x402-meta-tag-endpoint-mcp", version: "1.0.0" },
    {
      instructions:
        "One paid tool: extract_meta_tags(url). Each call costs $0.01 in USDC on Base, paid automatically via x402 using the PAYER_PRIVATE_KEY env var.",
    }
  );

  server.tool(
    "extract_meta_tags",
    `Extract a focused meta-tag set from a web page (OpenGraph, twitter:player, and related meta tags). PAID tool: ${PRICE_PER_CALL}. The call is proxied to the existing x402 endpoint, which returns JSON.`,
    {
      url: z
        .string()
        .url()
        .describe("Absolute URL of the page to extract meta tags from, e.g. https://example.com"),
    },
    async ({ url }) => {
      let response: Response;
      try {
        const paidFetch = await getOrCreatePaidFetch();
        response = await paidFetch(`${ENDPOINT_BASE}&url=${encodeURIComponent(url)}`, {
          method: "GET",
          headers: { Accept: "application/json" },
        });
      } catch (err) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `extract_meta_tags failed: ${(err as Error).message}`,
            },
          ],
        };
      }

      const bodyText = await response.text();

      if (!response.ok) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `extract_meta_tags: endpoint returned HTTP ${response.status}${
                response.status === 402 ? " (payment was attempted; see server logs)" : ""
              } — ${bodyText.slice(0, 500)}`,
            },
          ],
        };
      }

      return {
        content: [{ type: "text", text: bodyText }],
      };
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Never console.log to stdout from a stdio MCP server (stdout is the protocol channel).
  console.error(
    `[x402-meta-tag-endpoint-mcp] ready on stdio; tool: extract_meta_tags; price: ${PRICE_PER_CALL}; PAYER_PRIVATE_KEY read lazily at tool-call time`
  );
}

main().catch((err) => {
  console.error(`[x402-meta-tag-endpoint-mcp] fatal: ${(err as Error).message}`);
  process.exit(1);
});
