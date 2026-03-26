"""
execution.py — Execution Agent Node for the Investigative Journalist Graph.

After the Procurement Agent approves the budget, this node:

1. Reads the Ethereum invoice (``amount``, ``recipient_wallet``) from
   the graph state.
2. Sends an on-chain micro-payment using ``web3.py``.
3. Stores the resulting transaction hash as the ``access_token`` (x402
   proof-of-payment) so the Orchestrator can retry the premium API.

Environment variables required:
    - ``WEB3_PROVIDER_URI``  – e.g. an Infura / Alchemy Sepolia endpoint
    - ``SENDER_PRIVATE_KEY`` – hex-encoded private key of the payer wallet
"""

import os
import time

from dotenv import load_dotenv
from langchain_core.messages import AIMessage

from state import JournalistState

# ---------------------------------------------------------------------------
# Load environment variables
# ---------------------------------------------------------------------------
load_dotenv()


# ---------------------------------------------------------------------------
# Main graph node
# ---------------------------------------------------------------------------
def execution_node(state: JournalistState) -> dict:
    """LangGraph node — sends an Ethereum micro-payment and stores the tx hash.

    Parameters
    ----------
    state : JournalistState
        Must contain ``payment_approved == True`` and a populated
        ``invoice_details`` with ``amount`` and ``recipient_wallet``.

    Returns
    -------
    dict
        Partial state update with ``access_token``, ``payment_required``,
        and an audit-log message.
    """

    # =====================================================================
    # GUARDRAIL — abort immediately if payment was not approved
    # =====================================================================
    if not state.get("payment_approved"):
        return {
            "messages": [
                AIMessage(
                    content=(
                        "Execution Agent: Payment was NOT approved by "
                        "Procurement. Aborting transaction."
                    )
                )
            ],
        }

    # =====================================================================
    # Extract invoice details
    # =====================================================================
    invoice = state.get("invoice_details", {})
    amount = invoice.get("amount", 0)
    recipient_wallet = invoice.get("recipient_wallet", "")
    asset_address = invoice.get("asset", "")

    if not recipient_wallet or not asset_address:
        return {
            "messages": [
                AIMessage(
                    content=(
                        "Execution Agent: Missing recipient wallet or asset address in "
                        "invoice_details. Cannot execute payment."
                    )
                )
            ],
        }

    # =====================================================================
    # Web3 Setup
    # =====================================================================
    provider_uri = os.getenv("WEB3_PROVIDER_URI", os.getenv("WEB3_PROVIDER_URL", ""))
    private_key = os.getenv("SENDER_PRIVATE_KEY", "")

    # =====================================================================
    # Transaction Logic - ERC-20 USDC Transfer on Base Sepolia
    # =====================================================================
    try:
        from web3 import Web3

        w3 = Web3(Web3.HTTPProvider(provider_uri))
        if not w3.is_connected():
            raise ConnectionError(
                f"Could not connect to Web3 provider: {provider_uri}"
            )

        account = w3.eth.account.from_key(private_key)
        sender_address = account.address

        # Minimal ERC-20 ABI for transfer
        erc20_abi = [
            {
                "constant": False,
                "inputs": [
                    {"name": "_to", "type": "address"},
                    {"name": "_value", "type": "uint256"}
                ],
                "name": "transfer",
                "outputs": [{"name": "", "type": "bool"}],
                "type": "function"
            }
        ]

        # Convert amount back to base units (USDC uses 6 decimals)
        amount_base_units = int(amount * 1_000_000)

        asset_address_checksum = Web3.to_checksum_address(asset_address)
        recipient_checksum = Web3.to_checksum_address(recipient_wallet)

        contract = w3.eth.contract(address=asset_address_checksum, abi=erc20_abi)

        # Build the ERC-20 transfer transaction
        tx = contract.functions.transfer(recipient_checksum, amount_base_units).build_transaction({
            "from": sender_address,
            "nonce": w3.eth.get_transaction_count(sender_address),
            "gas": 100_000,
            "gasPrice": w3.eth.gas_price,
            "chainId": w3.eth.chain_id,
        })

        # Sign & send
        signed_tx = w3.eth.account.sign_transaction(tx, private_key)
        raw_tx_hash = w3.eth.send_raw_transaction(
            signed_tx.raw_transaction
        )
        tx_hash = raw_tx_hash.hex()

        # Optional: Wait for receipt in production, but returning hash immediately is faster
        # w3.eth.wait_for_transaction_receipt(raw_tx_hash)

        # ==============================================================
        # State update — tx hash is the x402 proof-of-payment
        # ==============================================================
        audit_msg = (
            f"Execution Agent: Successfully sent {amount} USDC to "
            f"{recipient_wallet}. Tx hash: {tx_hash}"
        )

        return {
            "access_token": tx_hash,
            "payment_required": False,
            "messages": [AIMessage(content=audit_msg)],
        }

    except Exception as exc:  # noqa: BLE001
        # Covers: insufficient funds, network errors, bad keys, etc.
        error_msg = (
            f"Execution Agent: Payment FAILED — {type(exc).__name__}: {exc}"
        )
        return {
            "payment_required": False,  # Abort retry loop on failure
            "messages": [AIMessage(content=error_msg)],
        }
