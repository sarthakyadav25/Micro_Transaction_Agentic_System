"""
state.py — Graph State Definition for the AI Investigative Journalist System.

Defines `JournalistState`, the TypedDict that flows between all nodes in the
LangGraph orchestration graph.  The `messages` field uses LangGraph's
`add_messages` annotation so that every node *appends* to the conversation
history rather than overwriting it.
"""

from typing import Annotated
from typing_extensions import TypedDict

from langgraph.graph.message import add_messages


class JournalistState(TypedDict):
    """Shared state passed between every node in the investigative-journalist
    agent graph.

    Attributes
    ----------
    topic : str
        The subject / headline the journalist is investigating.
    draft_content : str
        The running article draft that nodes refine over successive iterations.
    payment_required : bool
        Flipped to ``True`` when a premium data source returns HTTP 402.
        Downstream agents (Procurement / Execution) read this flag to decide
        whether to initiate an x402 payment negotiation.
    invoice_details : dict
        Populated when ``payment_required`` is ``True``.  Contains the cost,
        currency, destination node, and the raw x402 challenge returned by
        the paywalled API.
    access_token : str | None
        Bearer / API token received after a successful micro-payment.  When
        present the premium tool will include it in subsequent requests.
    payment_approved : bool
        Set to ``True`` by the Procurement Agent when the invoice amount
        falls within the editorial budget.  Default ``False``.
    messages : list
        Standard LangGraph message history.  Annotated with ``add_messages``
        so that each node's output is *appended* rather than replaced.
    """

    topic: str
    draft_content: str
    payment_required: bool                         # default False at init
    invoice_details: dict                          # empty dict at init
    access_token: str                              # None at init
    payment_approved: bool                         # default False at init
    messages: Annotated[list, add_messages]         # reducer: append

