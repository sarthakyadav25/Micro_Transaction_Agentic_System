/**
 * discovery.ts — Discovery Agent for the Seller Backend.
 *
 * When an AI buyer arrives and asks "I want to know about [topic]", this agent:
 * 1. Reads ALL article JSON files from the `data/` directory.
 * 2. Extracts { id, title, summary, isFree } from each.
 * 3. Feeds the titles + buyer query to GPT-4o-mini to identify relevant articles.
 * 4. Returns a priced catalog of matching articles for the buyer to select from.
 */

import fs from 'fs';
import path from 'path';
import { OpenAI } from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'fake_key',
});

// Price per premium article (matches x402 config in index.ts)
const PRICE_PER_ARTICLE = 0.10;

interface ArticleMeta {
  id: string;
  title: string;
  summary: string;
  isFree: boolean;
}

interface CatalogItem extends ArticleMeta {
  price: number;
}

/**
 * Scan the data/ directory and extract metadata from every article file.
 */
function loadAllArticles(): ArticleMeta[] {
  const dataDir = path.join(__dirname, 'data');
  const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.json'));
  const articles: ArticleMeta[] = [];

  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(dataDir, file), 'utf8');
      const data = JSON.parse(raw);

      // Skip array-based feed files (home-feed, market-ticker)
      if (Array.isArray(data)) continue;

      articles.push({
        id: data.id || file.replace('.json', ''),
        title: data.title || 'Untitled',
        summary: data.summary || data.title || '',
        isFree: data.isFree === true,
      });
    } catch {
      // Skip malformed files
    }
  }

  return articles;
}

/**
 * Use GPT-4o-mini to find articles relevant to the buyer's query.
 */
async function matchArticles(query: string, articles: ArticleMeta[]): Promise<string[]> {
  const titleList = articles.map((a, i) => `${i + 1}. [${a.id}] "${a.title}" — ${a.summary}`).join('\n');

  const prompt = `You are a content discovery agent for a news organization.
A buyer agent is looking for articles about: "${query}"

Here are all available articles:
${titleList}

Return ONLY a valid JSON array of the article IDs that are relevant to the buyer's query.
Example: ["tech-giant-ai", "market-rallies"]
If none are relevant, return an empty array: []`;

  // Fallback: if no OpenAI key, return all article IDs
  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'fake_key') {
    console.log('🟠 [Discovery] No OPENAI_API_KEY. Returning all articles as relevant.');
    return articles.map(a => a.id);
  }

  try {
    const response: any = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 200,
      temperature: 0,
    });

    const output = response.choices[0]?.message?.content?.trim() || '[]';
    // Extract JSON array from output (handle markdown code fences)
    const jsonMatch = output.match(/\[.*\]/s);
    if (!jsonMatch) return [];

    const ids: string[] = JSON.parse(jsonMatch[0]);
    return ids.filter((id: string) => articles.some(a => a.id === id));
  } catch (error: any) {
    console.error('❌ [Discovery] LLM matching failed:', error.message);
    // Fallback: return all articles
    return articles.map(a => a.id);
  }
}

/**
 * Main Discovery Agent function.
 * Called by the POST /api/discover route.
 */
export async function discoverArticles(query: string): Promise<{
  query: string;
  catalog: CatalogItem[];
  totalArticles: number;
}> {
  console.log(`🔍 [Discovery] Buyer query: "${query}"`);

  // 1. Load all articles
  const allArticles = loadAllArticles();
  console.log(`📚 [Discovery] Found ${allArticles.length} articles in the database.`);

  // 2. Use LLM to find relevant ones
  const matchedIds = await matchArticles(query, allArticles);
  console.log(`🎯 [Discovery] GPT matched ${matchedIds.length} relevant article(s): ${matchedIds.join(', ')}`);

  // 3. Build the priced catalog
  const catalog: CatalogItem[] = allArticles
    .filter(a => matchedIds.includes(a.id))
    .map(a => ({
      ...a,
      price: a.isFree ? 0 : PRICE_PER_ARTICLE,
    }));

  return {
    query,
    catalog,
    totalArticles: catalog.length,
  };
}
