"""
tools.py — Premium Data Tools for the AI Investigative Journalist.

Contains `fetch_offshore_corporate_registry`, a LangChain tool that simulates
calling a paywalled corporate-data API.

**402 Protocol**
When the caller does not supply a valid `access_token`, the tool returns a
structured 402 error (JSON) instead of raising an exception.  This lets the
orchestrator detect the paywall, set `payment_required = True` in the graph
state, and hand off to downstream Procurement / Execution agents.
"""

import json
from langchain_core.tools import tool


# ---------------------------------------------------------------------------
# The single valid token accepted by our mock endpoint.
# In production this would be verified against the x402 payment receipt.
# ---------------------------------------------------------------------------
_VALID_ACCESS_TOKEN = "x402_paid_token_abc123"


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
        The bearer token obtained after completing an x402 micro-payment.
        If missing or invalid the endpoint returns HTTP 402.

    Returns
    -------
    str
        A JSON string.  Either the premium payload on success or a 402
        error envelope containing the invoice / payment instructions.
    """
    # ------------------------------------------------------------------
    # Guard: no token or wrong token  →  simulate 402 Payment Required
    # ------------------------------------------------------------------
    if not access_token or access_token != _VALID_ACCESS_TOKEN:
        return json.dumps(
            {
                "status": 402,
                "error": "Payment Required",
                "invoice": {
                    "amount": 1.50,
                    "currency": "USD",
                    "node_id": "mock_lightning_node_abc123",
                },
            }
        )

    # ------------------------------------------------------------------
    # Happy path: token is valid  →  return mock premium data
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
