"""
audit.py — Compliance & Audit Node for the Investigative Journalist Graph.

This node executes at the end of the graph, regardless of whether the
payment succeeded or was denied. It parses the final ``JournalistState``
and appends a richly formatted Markdown compliance report to a local file.
"""

from datetime import datetime, timezone
from langchain_core.messages import AIMessage

from state import JournalistState


# ---------------------------------------------------------------------------
# Main graph node
# ---------------------------------------------------------------------------
def audit_node(state: JournalistState) -> dict:
    """LangGraph node — generates and saves a Markdown compliance report.

    Parameters
    ----------
    state : JournalistState
        The final graph state containing the invoice, approval decision,
        access token (tx hash), and message history.

    Returns
    -------
    dict
        Returns an unmodified state (or an empty dict, since LangGraph
        reducers handle state merging automatically).
    """

    # ----- 1. Extract state variables ------------------------------------
    topic = state.get("topic", "Unknown Topic")
    invoice = state.get("invoice_details", {})
    amount = invoice.get("amount_eth", 0.0)
    wallet = invoice.get("recipient_wallet", "N/A")
    approved = state.get("payment_approved", False)
    tx_hash = state.get("access_token", "None")
    messages = state.get("messages", [])

    # ----- 2. Format UI Indicators ---------------------------------------
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    
    if invoice:
        status_emoji = "🟢 Approved" if approved else "🔴 Denied"
        reason = "Within Editorial Budget" if approved else "Exceeds Budget Constraint"
    else:
        status_emoji = "⚪ N/A (No paywall encountered)"
        reason = "N/A"
        amount = "0.0"

    tx_display = f"`{tx_hash}`" if tx_hash and tx_hash != "None" else "*No transaction broadcast*"

    # ----- 3. Build the Markdown Report ----------------------------------
    md_lines = [
        f"## 📝 Enterprise AI Procurement Audit Log",
        f"**Timestamp:** {timestamp}",
        f"**Research Topic:** {topic}",
        "",
        "### 📊 Financial Summary",
        "| Metric | Value |",
        "| :--- | :--- |",
        f"| **Requested Amount** | {amount} ETH |",
        f"| **Recipient Wallet** | `{wallet}` |",
        f"| **Budget Check** | {status_emoji} |",
        f"| **Justification** | {reason} |",
        "",
        "### 🔗 Execution Receipt",
        f"**Cryptographic Proof of Payment (Tx Hash):** {tx_display}",
        "",
        "### ⏱️ Event Timeline",
    ]

    # Iterate backwards or filter specific AIMessages to build the timeline
    for msg in messages:
        # We only want to log system/tool events and AI thoughts,
        # but for a clean audit we can just extract AIMessage strings.
        if isinstance(msg, AIMessage) and msg.content:
            # Truncate very long article drafts so the log is readable
            content = msg.content
            if len(content) > 150:
                content = content[:147] + "..."
            md_lines.append(f"- {content}")

    md_lines.append("")
    md_lines.append("---")
    md_lines.append("")

    report_str = "\n".join(md_lines)

    # ----- 4. Write to local file ----------------------------------------
    with open("compliance_audit_log.md", "a", encoding="utf-8") as f:
        f.write(report_str)

    # We don't actually need to update the state, so return empty dict
    return {}
