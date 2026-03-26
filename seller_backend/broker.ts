import dotenv from 'dotenv';
import { OpenAI } from 'openai';
import { Annotation, StateGraph, START, END } from '@langchain/langgraph';
import { processSettlement, ArticleData } from './settlement';
import { packageData } from './packager';
import { auditTransaction } from './audit';

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'fake_key' 
});

const BrokerAnnotation = Annotation.Root({
  articleData: Annotation<ArticleData>({
    reducer: (state, update) => update ?? state,
    default: () => ({ id: "", title: "", summary: "" })
  }),
  xpaymentHeader: Annotation<string>({
    reducer: (state, update) => update ?? state,
    default: () => ""
  }),
  price: Annotation<number>({
    reducer: (state, update) => update ?? state,
    default: () => 0
  }),
  settlementStatus: Annotation<string>({
    reducer: (state, update) => update ?? state,
    default: () => "started"
  }),
  paymentOptions: Annotation<any>({
    reducer: (state, update) => update ?? state,
    default: () => null
  }),
  packagedResponse: Annotation<any>({
    reducer: (state, update) => update ?? state,
    default: () => null
  })
});

const calculateBrokerPrice = async (state: typeof BrokerAnnotation.State) => {
  const { articleData } = state;
  console.log("--> [LangGraph] Entering 'broker_pricing' node...");

  if (articleData.isFree) return { price: 0.00 };

  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'fake_key') {
     console.log("🟠 No OPENAI_API_KEY found. Using algorithmic pricing fallback.");
     const mockPrice = 0.05 + ((articleData.traffic || 10000) / 1000000);
     return { price: Number(mockPrice.toFixed(2)) };
  }

  console.log("🟢 Asking GPT-4o-mini to appraise the article...");
  try {
    const prompt = `
You are an AI data broker. Determine the access price in USD for the following article based on its synopsis and current traffic.
Return ONLY a floating point number. Maximum allowed is $5.00. Do not include $ symbol.

Article Synopsis: ${articleData.summary || articleData.title || "No summary"}
Current Traffic: ${articleData.traffic || 0} active reading sessions
`;
    const response: any = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 10,
      temperature: 0.2, 
    });

    const output = response.choices[0]?.message?.content?.trim() || "";
    const priceVal = parseFloat(output.replace(/[^0-9.]/g, ''));
    if (isNaN(priceVal)) return { price: 0.25 }; 
    return { price: Number((Math.min(priceVal, 5.0)).toFixed(2)) };
  } catch (error: any) {
    console.error("❌ Broker execution failed:", error.message);
    return { price: 0.50 }; 
  }
};

const workflow = new StateGraph(BrokerAnnotation)
  .addNode("broker_pricing", calculateBrokerPrice)
  .addNode("settlement_agent", processSettlement as any)
  .addNode("packager_agent", packageData as any)
  .addNode("audit_agent", auditTransaction as any)
  .addEdge(START, "broker_pricing")
  .addEdge("broker_pricing", "settlement_agent")
  .addEdge("settlement_agent", "packager_agent")
  .addEdge("packager_agent", "audit_agent")
  .addEdge("audit_agent", END);

const brokerApp = workflow.compile();

export async function runAgenticFlow(articleData: ArticleData, xpaymentHeader?: string) {
   console.log("🚀 [LangGraph] Starting Agentic Flow run");
   const result = await brokerApp.invoke({ 
      articleData, 
      xpaymentHeader: xpaymentHeader || "" 
   });
   console.log(`✅ [LangGraph] Execution finished. Final status: ${result.settlementStatus}`);
   return result;
}
