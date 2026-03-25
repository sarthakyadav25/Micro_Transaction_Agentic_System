"""
orchestrator.py — Orchestrator Node for the Investigative Journalist Graph.

This module defines `orchestrator_node`, the central LangGraph node that:

1. Binds the premium ``fetch_offshore_corporate_registry`` tool to the LLM.
2. Invokes the model with the current conversation history.
3. Automatically executes any tool calls the model requests.
4. Inspects tool results — if a 402 Payment Required response is detected,
   it sets ``payment_required = True`` and populates ``invoice_details`` in
   the graph state so that downstream Procurement / Execution agents can
   negotiate an x402 payment.
"""

import json
import os

from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from langchain_core.messages import (
    AIMessage,
    HumanMessage,
    SystemMessage,
    ToolMessage,
)

from state import JournalistState
from tools import fetch_offshore_corporate_registry

# ---------------------------------------------------------------------------
# Load environment variables (expects OPENAI_API_KEY in .env)
# ---------------------------------------------------------------------------
load_dotenv()

# ---------------------------------------------------------------------------
# System prompt — defines the journalist's persona and 402 behaviour.
# ---------------------------------------------------------------------------
SYSTEM_PROMPT = (
    "You are an elite AI Investigative Journalist for the Economic Times. "
    "Your goal is to write a briefing on the provided topic. "
    "You MUST use the `fetch_offshore_corporate_registry` tool to get "
    "exclusive data. If the tool returns a 402 Payment Required error, "
    "DO NOT attempt to make up data and DO NOT fail. Acknowledge the "
    "paywall in your internal thought process and stop execution so the "
    "finance team can pay."
)

# ---------------------------------------------------------------------------
# Available tools (list used for binding & execution lookup)
# ---------------------------------------------------------------------------
TOOLS = [fetch_offshore_corporate_registry]
_TOOL_MAP = {t.name: t for t in TOOLS}

# ---------------------------------------------------------------------------
# LLM initialisation (lazy — deferred until first call so that importing
# this module without an OPENAI_API_KEY does not block or crash).
# ---------------------------------------------------------------------------
_llm_instance = None


def _get_llm():
    """Return the tool-bound ChatOpenAI instance, creating it on first call."""
    global _llm_instance
    if _llm_instance is None:
        _llm_instance = ChatOpenAI(
            model="gpt-4o-mini",
            temperature=0,
        ).bind_tools(TOOLS)
    return _llm_instance


# ---------------------------------------------------------------------------
# Helper: execute tool calls returned by the model
# ---------------------------------------------------------------------------
def _execute_tool_calls(ai_message: AIMessage) -> list[ToolMessage]:
    """Run every tool call present in an AIMessage and return ToolMessages."""
    tool_messages: list[ToolMessage] = []

    for call in ai_message.tool_calls:
        tool_fn = _TOOL_MAP.get(call["name"])
        if tool_fn is None:
            # Unknown tool — return an error ToolMessage so the LLM can react
            tool_messages.append(
                ToolMessage(
                    content=json.dumps({"error": f"Unknown tool: {call['name']}"}),
                    tool_call_id=call["id"],
                )
            )
            continue

        # Inject the current access_token into the tool kwargs if the tool
        # accepts it and the LLM didn't already provide one.
        kwargs = dict(call["args"])
        result = tool_fn.invoke(kwargs)

        tool_messages.append(
            ToolMessage(content=result, tool_call_id=call["id"])
        )

    return tool_messages


# ---------------------------------------------------------------------------
# Helper: scan tool messages for a 402 response
# ---------------------------------------------------------------------------
def _detect_402(tool_messages: list[ToolMessage]) -> dict | None:
    """Return the invoice dict from the first 402 response found, or None."""
    for msg in tool_messages:
        try:
            payload = json.loads(msg.content)
            if payload.get("status") == 402:
                return payload.get("invoice", {})
        except (json.JSONDecodeError, TypeError):
            continue
    return None


# ---------------------------------------------------------------------------
# Main graph node
# ---------------------------------------------------------------------------
def orchestrator_node(state: JournalistState) -> dict:
    """LangGraph node — invokes the LLM, executes tools, and detects 402s.

    Parameters
    ----------
    state : JournalistState
        The current graph state.

    Returns
    -------
    dict
        A partial state update consumed by LangGraph's state reducer.
    """
    # ----- 1. Build the message list for the LLM -------------------------
    messages = [SystemMessage(content=SYSTEM_PROMPT)]

    # If this is the first invocation, seed the conversation with the topic.
    if not state.get("messages"):
        messages.append(
            HumanMessage(
                content=f"Write an investigative briefing on: {state['topic']}"
            )
        )
    else:
        messages.extend(state["messages"])

    # ----- 2. Call the LLM ------------------------------------------------
    ai_response: AIMessage = _get_llm().invoke(messages)

    # Collect new messages to append to state
    new_messages: list = [ai_response]

    # ----- 3. If the model requested tool calls, execute them -------------
    payment_required = state.get("payment_required", False)
    invoice_details = state.get("invoice_details", {})
    draft_content = state.get("draft_content", "")

    if ai_response.tool_calls:
        tool_msgs = _execute_tool_calls(ai_response)
        new_messages.extend(tool_msgs)

        # --- 3a. Check for 402 in tool results ---------------------------
        invoice = _detect_402(tool_msgs)
        if invoice:
            payment_required = True
            invoice_details = invoice
        else:
            # Tools succeeded — ask the model to produce the final draft
            # with the data it just received.
            follow_up: AIMessage = _get_llm().invoke(messages + new_messages)
            new_messages.append(follow_up)
            draft_content = follow_up.content
    else:
        # No tool calls — the model replied directly (shouldn't normally
        # happen given the system prompt, but handle gracefully).
        draft_content = ai_response.content

    # ----- 4. Return partial state update ---------------------------------
    return {
        "messages": new_messages,
        "draft_content": draft_content,
        "payment_required": payment_required,
        "invoice_details": invoice_details,
    }
