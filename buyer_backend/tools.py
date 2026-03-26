"""
tools.py — Premium Data Tools for the AI Investigative Journalist.

Contains `fetch_offshore_corporate_registry`, a LangChain tool that simulates
calling a paywalled corporate-data API.

**402 Protocol (x402 / Ethereum)**
When the caller does not supply a valid `access_token`, the tool returns a
structured 402 error (JSON) containing an Ethereum invoice with `amount_eth`
and `recipient_wallet`.  After the Execution Agent sends the on-chain payment,
the resulting transaction hash is used as the `access_token` (proof-of-payment).
"""

import json
import base64
import requests
from langchain_core.tools import tool


@tool
def fetch_offshore_corporate_registry(
    query: str,
    access_token: str = "",
) -> str:
    """Fetch data from a premium offshore corporate registry.

    Parameters
    ----------
    query : str
        A natural-language search query (e.g. a company name or jurisdiction).
    access_token : str, optional
        Proof-of-payment token.  In the x402 Ethereum flow this is the
        transaction hash (starts with ``0x``).  If missing or invalid the
        endpoint returns HTTP 402 with an Ethereum invoice.

    Returns
    -------
    str
        A JSON string.  Either the premium payload on success or a 402
        error envelope containing the invoice / payment instructions.
    """
    url = "http://localhost:5001/api/data/tech-giant-ai.json"
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
