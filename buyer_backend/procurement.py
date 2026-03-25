"""
procurement.py — Procurement Agent Node for the Investigative Journalist Graph.

This module defines:

- ``ProcurementDecision``  — A Pydantic model used as LLM structured output
  to enforce a strict approve / deny schema.
- ``procurement_node``     — The LangGraph node that evaluates the invoice
  produced by the Orchestrator against a hard-coded editorial budget and
  records the decision in the graph state.
"""

import os

from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from pydantic import BaseModel, Field

from state import JournalistState

# ---------------------------------------------------------------------------
# Load environment variables (expects OPENAI_API_KEY in .env)
# ---------------------------------------------------------------------------
load_dotenv()

# ---------------------------------------------------------------------------
# Hard-coded editorial budget (USD) per article
# ---------------------------------------------------------------------------
MAX_BUDGET_USD = 5.00


# ---------------------------------------------------------------------------
# Structured output schema — enforced by the LLM via .with_structured_output()
# ---------------------------------------------------------------------------
class ProcurementDecision(BaseModel):
    """Strict approval / denial decision for a micro-transaction."""

    approved: bool = Field(
        ...,
        description="Whether the transaction is approved (True) or denied (False).",
    )
    reason: str = Field(
        ...,
        description="A short justification for the decision, logged for audit.",
    )


# ---------------------------------------------------------------------------
# Lazy LLM initialisation (mirrors the pattern in orchestrator.py)
# ---------------------------------------------------------------------------
_llm_instance = None


def _get_llm():
    """Return a ChatOpenAI instance bound to ProcurementDecision output."""
    global _llm_instance
    if _llm_instance is None:
        _llm_instance = ChatOpenAI(
            model="gpt-4o-mini",
            temperature=0,
        ).with_structured_output(ProcurementDecision)
    return _llm_instance


# ---------------------------------------------------------------------------
# Main graph node
# ---------------------------------------------------------------------------
def procurement_node(state: JournalistState) -> dict:
    """LangGraph node — evaluates the invoice and approves / denies payment.

    Parameters
    ----------
    state : JournalistState
        The current graph state.  Expected to contain ``invoice_details``
        populated by the Orchestrator after a 402 response.

    Returns
    -------
    dict
        A partial state update with ``payment_approved``, and optionally
        ``payment_required`` (set to False on denial to halt the payment
        loop).
    """
    # ----- 1. Extract invoice amount -------------------------------------
    invoice = state.get("invoice_details", {})
    amount = invoice.get("amount", 0.0)
    currency = invoice.get("currency", "USD")

    # ----- 2. Build the system prompt with budget & invoice ----------------
    system_prompt = (
        "You are the Automated Editorial Desk Manager. Your job is to "
        "approve or deny micro-transactions for data journalism. "
        f"The hardcoded maximum budget per article is ${MAX_BUDGET_USD:.2f} {currency}. "
        f"The current invoice is for ${amount} {currency}. "
        "If the amount is less than or equal to the budget, approve it. "
        "If it exceeds the budget, deny it."
    )

    # ----- 3. Invoke the LLM with structured output ----------------------
    llm = _get_llm()
    decision: ProcurementDecision = llm.invoke(
        [
            SystemMessage(content=system_prompt),
            HumanMessage(
                content=(
                    f"Please evaluate this invoice: "
                    f"Amount=${amount} {currency}. "
                    f"Budget cap=${MAX_BUDGET_USD:.2f} {currency}."
                )
            ),
        ]
    )

    # ----- 4. Build the audit log message ---------------------------------
    status_label = "APPROVED" if decision.approved else "DENIED"
    audit_msg = (
        f"Procurement Audit: Payment of ${amount} {currency} was "
        f"{status_label}. Reason: {decision.reason}"
    )

    # ----- 5. Prepare partial state update --------------------------------
    update: dict = {
        "payment_approved": decision.approved,
        "messages": [AIMessage(content=audit_msg)],
    }

    # If denied, clear the payment_required flag so the graph halts the
    # payment loop rather than retrying indefinitely.
    if not decision.approved:
        update["payment_required"] = False

    return update
