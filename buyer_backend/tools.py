"""
tools.py — Premium Data Tools for the AI Investigative Journalist.

Contains:
- `discover_articles` — Calls the seller's free discovery endpoint to get a
  catalog of articles relevant to a query.
- `fetch_article` — Calls a paywalled article endpoint on the seller.

**402 Protocol (x402 / Ethereum)**
When the caller does not supply a valid `access_token`, the tool returns a
structured 402 error (JSON) containing an x402 USDC invoice. After the
Execution Agent sends the on-chain payment, the resulting transaction hash
is used as the `access_token` (proof-of-payment).
"""

import json
import base64
import requests
from langchain_core.tools import tool


SELLER_BASE_URL = "http://localhost:5001"


@tool
def discover_articles(query: str) -> str:
    """Discover available articles from the seller's catalog.

    Parameters
    ----------
    query : str
        A natural-language topic query (e.g. "AI investments").

    Returns
    -------
    str
        A JSON string with the catalog of relevant articles,
        each including id, title, summary, price, and isFree.
    """
    try:
        response = requests.post(
            f"{SELLER_BASE_URL}/api/discover",
            json={"query": query},
            headers={"Content-Type": "application/json"},
        )
        return json.dumps(response.json())
    except requests.RequestException as e:
        return json.dumps({"status": 500, "error": f"Discovery failed: {e}"})


@tool
def fetch_article(
    article_id: str,
    access_token: str = "",
) -> str:
    """Fetch a premium article from the seller by its article ID.

    Parameters
    ----------
    article_id : str
        The article ID from the discovery catalog (e.g. "tech-giant-ai").
    access_token : str, optional
        Proof-of-payment token (x402 transaction hash starting with ``0x``).

    Returns
    -------
    str
        A JSON string.  Either the premium payload on success or a 402
        error envelope containing the invoice / payment instructions.
    """
    url = f"{SELLER_BASE_URL}/api/data/{article_id}.json"
    headers = {}
    
    if access_token:
        # Include the access_token (tx hash) as the x402 payment header
        headers["x-payment"] = access_token

    try:
        response = requests.get(url, headers=headers)
        
        # ------------------------------------------------------------------
        # Guard: 402 Payment Required
        # ------------------------------------------------------------------
        if response.status_code == 402:
            payment_header = response.headers.get("payment-required")
            if not payment_header:
                return json.dumps({"status": 402, "error": "Missing payment-required header"})
                
            # Parse the base64 x402 challenge
            try:
                decoded_bytes = base64.b64decode(payment_header)
                challenge = json.loads(decoded_bytes.decode('utf-8'))
                
                # Extract the standard invoice details
                accept_option = challenge.get("accepts", [{}])[0]
                amount = float(accept_option.get("amount", "0")) / 1e6  # Convert from base units (e.g. USDC 6 decimals)
                amount = round(amount, 6)
                
                invoice = {
                    "amount": amount,
                    "currency": accept_option.get("extra", {}).get("name", "USDC"),
                    "recipient_wallet": accept_option.get("payTo", ""),
                    "network": accept_option.get("network", ""),
                    "asset": accept_option.get("asset", "")
                }
                
                return json.dumps({
                    "status": 402,
                    "error": "Payment Required",
                    "invoice": invoice
                })
            except Exception as e:
                return json.dumps({"status": 500, "error": f"Failed to parse x402 challenge: {e}"})

        # ------------------------------------------------------------------
        # Happy path: 200 OK -> return premium data
        # ------------------------------------------------------------------
        if response.status_code == 200:
            return json.dumps({
                "status": 200,
                "data": response.json()
            })
            
        return json.dumps({"status": response.status_code, "error": response.text})
        
    except requests.RequestException as e:
        return json.dumps({"status": 500, "error": f"Connection error: {e}"})
