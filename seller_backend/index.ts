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
app.use(paymentMiddleware(routesConfig as any, resourceServer));

import { runAgenticFlow } from './broker';

// ── Data API ─────────────────────────────────────────────────────────
app.get('/api/data/:filename', async (req: Request, res: Response): Promise<any> => {
  const filename = req.params.filename as string;
  if (!filename) {
    return res.status(400).json({ error: 'Filename is required' });
  }

  const safeFilename = path.basename(filename);
  const articleId = safeFilename.replace('.json', '');
  const filePath = path.join(__dirname, 'data', safeFilename);
  const finalPath = filePath.endsWith('.json') ? filePath : `${filePath}.json`;

  if (!fs.existsSync(finalPath)) {
    return res.status(404).json({ error: 'Data not found' });
  }

  try {
    // Read article data
    const rawData = fs.readFileSync(finalPath, 'utf8');
    const articleData = JSON.parse(rawData);

    // Check if this is a protected (premium) route
    const routeKey = `/api/data/${safeFilename}`;
    const isProtected = routeKey in routesConfig;

    // Free/non-protected routes: return data directly without agentic flow
    if (!isProtected) {
      return res.json(articleData);
    }

    // Premium routes: Run the full LangGraph flow: broker_pricing → settlement → packager
    const xpaymentHeader = (req.headers['x-payment'] || req.headers['payment-signature'] || '') as string;
    const result = await runAgenticFlow(
      { id: articleId, title: articleData.title, summary: articleData.summary, isFree: articleData.isFree },
      xpaymentHeader
    );

    // Return the packaged response from the agent
    if (result.packagedResponse) {
      const status = result.packagedResponse.status || 200;
      return res.status(status).json(result.packagedResponse);
    }

    // Fallback: return raw data if packager didn't set a response
    return res.json(articleData);
  } catch (err) {
    return res.status(500).json({ error: 'Error processing request' });
  }
});

app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
  console.log(`x402 settlement enabled → payments to ${PAY_TO} on ${NETWORK}`);
});
