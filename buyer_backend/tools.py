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
from langchain_core.tools import tool


# ---------------------------------------------------------------------------
# Mock seller wallet address (would be read from x402 challenge in production)
# ---------------------------------------------------------------------------
_MOCK_SELLER_WALLET = "0x4838B106FCe9647Bdf1E7877BF73cE8B0BAD5f97"


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
    # ------------------------------------------------------------------
    # Guard: no token or token doesn't look like a tx hash
    #   → simulate 402 Payment Required with Ethereum invoice
    # ------------------------------------------------------------------
    if not access_token or not access_token.startswith("0x"):
        return json.dumps(
            {
                "status": 402,
                "error": "Payment Required",
                "invoice": {
                    "amount_eth": 0.0001,
                    "recipient_wallet": _MOCK_SELLER_WALLET,
                },
            }
        )

    # ------------------------------------------------------------------
    # Happy path: valid tx-hash-style token  →  return premium data
    # ------------------------------------------------------------------
    return json.dumps(
        {
            "status": 200,
            "data": {
                "company": "Apex Holdings",
                "beneficial_owner": "Classified",
                "assets": "$500M",
            },
        }
    )
