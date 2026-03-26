/**
 * packager.ts — Packager Agent Node for the Seller LangGraph.
 *
 * After the Settlement Agent confirms payment, this node:
 * 1. Reads the requested article data from the /data directory.
 * 2. Packages it into a structured JSON response.
 * 3. Stores it in the graph state so the Express route can return it.
 */

import fs from 'fs';
import path from 'path';

/**
 * LangGraph node — packages the article data after successful payment.
 *
 * Reads `articleData.id` from the state, loads the corresponding JSON
 * file from the `data/` directory, and writes the full content into
 * `packagedResponse` on the state.
 *
 * If settlement was not verified, returns an error payload instead.
 */
export const packageData = async (state: any) => {
  console.log("---> [LangGraph] Entering 'packager_agent' node...");

  const settlementStatus = state.settlementStatus || "unknown";
  const articleId = state.articleData?.id || "";

  // ── Guard: Only package data if payment was verified ────────────
  if (settlementStatus !== "verified") {
    console.log(`🔴 [Packager] Settlement status is "${settlementStatus}". Not packaging data.`);
    return {
      packagedResponse: {
        status: 402,
        error: "Payment not verified",
        message: `Settlement status: ${settlementStatus}. Data access denied.`,
      },
    };
  }

  // ── Read the article file ──────────────────────────────────────
  const dataDir = path.join(__dirname, 'data');
  const filePath = path.join(dataDir, `${articleId}.json`);

  if (!fs.existsSync(filePath)) {
    console.log(`🔴 [Packager] Article file not found: ${filePath}`);
    return {
      packagedResponse: {
        status: 404,
        error: "Article not found",
        message: `No data file exists for article ID: "${articleId}".`,
      },
    };
  }

  try {
    const rawData = fs.readFileSync(filePath, 'utf8');
    const articleContent = JSON.parse(rawData);

    console.log(`🟢 [Packager] Successfully packaged article: "${articleContent.title || articleId}"`);

    return {
      packagedResponse: {
        status: 200,
        data: articleContent,
        meta: {
          articleId,
          deliveredAt: new Date().toISOString(),
          settlementStatus: "verified",
        },
      },
    };
  } catch (err: any) {
    console.log(`🔴 [Packager] Error reading article: ${err.message}`);
    return {
      packagedResponse: {
        status: 500,
        error: "Internal packaging error",
        message: err.message,
      },
    };
  }
};
