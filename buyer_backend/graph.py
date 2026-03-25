"""
graph.py — LangGraph Compiler for the AI Investigative Journalist.

This module wires together all the agent nodes into a cyclical StateGraph.
It manages the conditional routing allowing the Orchestrator to hit a 402,
pause, route to Procurement/Execution, and loop back with the new token.
"""

from langgraph.graph import StateGraph, START, END
from langgraph.prebuilt import ToolNode

from state import JournalistState
from orchestrator import orchestrator_node, TOOLS
from procurement import procurement_node
from execution import execution_node
from audit import audit_node


# ---------------------------------------------------------------------------
# Setup the Tool Node for the graph
# ---------------------------------------------------------------------------
tool_execution_node = ToolNode(TOOLS)


# ---------------------------------------------------------------------------
# Conditional Router: After the Graph runs tools, check if a 402 was hit
# ---------------------------------------------------------------------------
def route_after_tool(state: JournalistState) -> str:
    """Route to Procurement if 402 hit, else return to Orchestrator."""
    if state.get("payment_required"):
        return "procurement_node"
    return "orchestrator_node"


# ---------------------------------------------------------------------------
# Conditional Router: After Procurement validation
# ---------------------------------------------------------------------------
def route_after_procurement(state: JournalistState) -> str:
    """Route to Execution if approved, else fast-fail to Audit."""
    if state.get("payment_approved"):
        return "execution_node"
    return "audit_node"


# ---------------------------------------------------------------------------
# Build the Graph
# ---------------------------------------------------------------------------
workflow = StateGraph(JournalistState)

# 1. Add Nodes
workflow.add_node("orchestrator_node", orchestrator_node)
workflow.add_node("tool_execution_node", tool_execution_node)
workflow.add_node("procurement_node", procurement_node)
workflow.add_node("execution_node", execution_node)
workflow.add_node("audit_node", audit_node)

# 2. Define Edges (The Control Flow)
workflow.add_edge(START, "orchestrator_node")

# From orchestrator: If tool calls exist, run them. If finished, go to audit.
workflow.add_conditional_edges(
    "orchestrator_node",
    # Helper lambda to check if the last message has tool calls
    lambda state: "tool_execution_node" if hasattr(state["messages"][-1], "tool_calls") and state["messages"][-1].tool_calls else "audit_node"
)

# From tools: Check state for 402 flag
workflow.add_conditional_edges(
    "tool_execution_node",
    route_after_tool
)

# From procurement: Route based on budget approval
workflow.add_conditional_edges(
    "procurement_node",
    route_after_procurement
)

# From execution: Loop back to orchestrator to retry the API with the new token
workflow.add_edge("execution_node", "orchestrator_node")

# From audit: End the graph
workflow.add_edge("audit_node", END)

# ---------------------------------------------------------------------------
# Compile the Graph
# ---------------------------------------------------------------------------
app = workflow.compile()
