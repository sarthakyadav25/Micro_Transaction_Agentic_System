import express, { Request, Response } from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { paymentMiddleware } from '@x402/express';
import { x402ResourceServer, HTTPFacilitatorClient } from '@x402/core/server';
import { ExactEvmScheme } from '@x402/evm/exact/server';

const app = express();
const PORT = process.env.PORT || 5001;

app.use(cors());
app.use(express.json());

// ── Request Logger Middleware ────────────────────────────────────────
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`📥 [${timestamp}] ${req.method} ${req.url}`);
  console.log(`   Headers: x-payment=${req.headers['x-payment'] ? '✅ present' : '❌ missing'}`);
  next();
});

// ── x402 Configuration ──────────────────────────────────────────────
const NETWORK = "eip155:84532"; // Base Sepolia
const PAY_TO = "0x531C473aFF36f34857e00aB2C25CB0D98E7FF174"; // Your wallet
const FACILITATOR_URL = "https://x402.org/facilitator";

// Create x402 resource server with facilitator
const facilitatorClient = new HTTPFacilitatorClient({ url: FACILITATOR_URL });
const resourceServer = new x402ResourceServer(facilitatorClient);
resourceServer.register(NETWORK, new ExactEvmScheme());

// Define which routes require payment
// Read data files to determine pricing dynamically
const dataDir = path.join(__dirname, 'data');
const routesConfig: Record<string, { accepts: Array<{ scheme: string; network: string; price: string; payTo: string }> }> = {};

// Build routes from data files
const dataFiles = fs.readdirSync(dataDir).filter(f => f.endsWith('.json'));
for (const file of dataFiles) {
  const slug = file.replace('.json', '');
  
  // Skip free & feed files from paywall
  if (slug === 'home-feed' || slug === 'market-ticker') continue;
  
  try {
    const data = JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8'));
    if (data.isFree) continue; // Free articles don't need payment
    
    // Set a fixed price for premium articles (in USDC)
    routesConfig[`/api/data/${file}`] = {
      accepts: [
        {
          scheme: "exact",
          network: NETWORK,
          price: "$0.10",    // 10 cents USDC per article access
          payTo: PAY_TO,
        }
      ]
    };
  } catch {}
}

console.log("📋 Protected routes:", Object.keys(routesConfig));

// Apply x402 payment middleware — this handles:
// 1. Detecting payment-signature / x-payment headers
// 2. Returning 402 with payment instructions if not paid
// 3. Verifying payment via facilitator
// 4. Settling on-chain (USDC transfer to your wallet)
app.use((req, res, next) => {
  const routeKey = `/api/data/${req.params?.filename || req.url.split('/api/data/')[1] || ''}`;
  const isProtected = routeKey in routesConfig || req.url in routesConfig;
  console.log(`🔒 [x402 Middleware] Route: ${req.url}`);
  console.log(`   Protected: ${isProtected ? '🔴 YES — payment required' : '🟢 NO — free access'}`);
  if (isProtected && !req.headers['x-payment'] && !req.headers['payment-signature']) {
    console.log(`   ⚡ No payment header → middleware will return 402 challenge`);
  } else if (isProtected) {
    console.log(`   💳 Payment header detected → forwarding to facilitator for verification...`);
  }
  next();
});
const x402mw = paymentMiddleware(routesConfig as any, resourceServer);
app.use((req, res, next) => {
  const paymentHeader = (req.headers['x-payment'] || req.headers['payment-signature'] || '') as string;
  
  // Hackathon bypass: if the buyer sends a raw ETH tx hash, accept it instead of a signed x402 token.
  // web3.py HexBytes sometimes omits '0x', so we check for 64 hex chars with optional 0x.
  const isTxHash = /^(0x)?[0-9a-fA-F]{64}$/.test(paymentHeader);
  
  if (isTxHash) {
    console.log(`\n   💸 ACCEPTED: Raw Ethereum Tx Hash as mock Proof-of-Payment: ${paymentHeader}`);
    next();
  } else {
    // Otherwise, enforce strict x402 protocol rules
    x402mw(req, res, next);
  }
});
import { runAgenticFlow } from './broker';

// ── Data API ─────────────────────────────────────────────────────────
app.get('/api/data/:filename', async (req: Request, res: Response): Promise<any> => {
  const filename = req.params.filename as string;
  console.log(`\n📂 [Route Handler] /api/data/${filename}`);

  if (!filename) {
    console.log(`   ❌ No filename provided`);
    return res.status(400).json({ error: 'Filename is required' });
  }

  const safeFilename = path.basename(filename);
  const articleId = safeFilename.replace('.json', '');
  const filePath = path.join(__dirname, 'data', safeFilename);
  const finalPath = filePath.endsWith('.json') ? filePath : `${filePath}.json`;

  if (!fs.existsSync(finalPath)) {
    console.log(`   ❌ File not found: ${finalPath}`);
    return res.status(404).json({ error: 'Data not found' });
  }

  try {
    const rawData = fs.readFileSync(finalPath, 'utf8');
    const articleData = JSON.parse(rawData);
    console.log(`   📄 Loaded article: "${articleData.title}" (isFree: ${articleData.isFree})`);

    const routeKey = `/api/data/${safeFilename}`;
    const isProtected = routeKey in routesConfig;

    if (!isProtected) {
      console.log(`   🟢 Free route — returning data directly`);
      return res.json(articleData);
    }

    console.log(`   🔴 Premium route — launching LangGraph agentic flow...`);
    const xpaymentHeader = (req.headers['x-payment'] || req.headers['payment-signature'] || '') as string;
    console.log(`   💳 x-payment header: ${xpaymentHeader ? xpaymentHeader.substring(0, 20) + '...' : '(empty)'}`);

    const result = await runAgenticFlow(
      { id: articleId, title: articleData.title, summary: articleData.summary, isFree: articleData.isFree },
      xpaymentHeader
    );

    if (result.packagedResponse) {
      const status = result.packagedResponse.status || 200;
      console.log(`   📤 Responding with status ${status}`);
      return res.status(status).json(result.packagedResponse);
    }

    console.log(`   📤 Fallback — returning raw article data`);
    return res.json(articleData);
  } catch (err: any) {
    console.error(`   💥 Error: ${err.message}`);
    return res.status(500).json({ error: 'Error processing request' });
  }
});

app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
  console.log(`x402 settlement enabled → payments to ${PAY_TO} on ${NETWORK}`);
});
