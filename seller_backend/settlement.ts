// settlement.ts
// This file now only exports configuration constants.
// The actual settlement logic is handled by @x402/express paymentMiddleware
// which communicates with the x402 facilitator for on-chain verification & settlement.

export const NETWORK = "eip155:84532"; // Base Sepolia
export const PAY_TO = "0x531C473aFF36f34857e00aB2C25CB0D98E7FF174";
export const FACILITATOR_URL = "https://x402.org/facilitator";

export interface ArticleData {
  id: string;
  title: string;
  summary: string;
  isFree?: boolean;
  traffic?: number;
}

/**
 * LangGraph node — Settlement Agent.
 * 
 * Checks the xpaymentHeader from the graph state:
 * - If a valid payment header is present (non-empty), marks settlement as "verified".
 * - If missing, marks settlement as "requires_payment" with payment options.
 * 
 * In the x402 flow, actual on-chain verification is handled by the
 * paymentMiddleware in index.ts BEFORE the route handler even runs.
 * This node serves as the LangGraph state checkpoint for the agentic flow.
 */
export async function processSettlement(state: any) {
  console.log("---> [LangGraph] Entering 'settlement_agent' node...");

  const xpaymentHeader = state.xpaymentHeader || "";
  const price = state.price || 0;
  const articleData = state.articleData || {};

  // If the article is free, auto-verify
  if (articleData.isFree || price === 0) {
    console.log("🟢 [Settlement] Free article — auto-verified.");
    return {
      settlementStatus: "verified",
    };
  }

  // If a payment header exists, the x402 middleware already verified it
  if (xpaymentHeader) {
    console.log(`🟢 [Settlement] Payment header present. Settlement verified.`);
    return {
      settlementStatus: "verified",
    };
  }

  // No payment header — payment still required
  console.log(`🔴 [Settlement] No payment header. Payment required.`);
  return {
    settlementStatus: "requires_payment",
    paymentOptions: {
      network: NETWORK,
      payTo: PAY_TO,
      price: price,
      facilitator: FACILITATOR_URL,
    },
  };
}
