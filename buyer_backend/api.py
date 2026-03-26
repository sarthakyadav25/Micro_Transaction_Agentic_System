import os
import json
import time
from flask import Flask, Response, request, jsonify
from flask_cors import CORS

from state import JournalistState
from graph import app as langgraph_app
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage

app = Flask(__name__)
CORS(app)  # Allow frontend origin

@app.route('/api/investigate', methods=['POST'])
def investigate():
    data = request.json
    topic = data.get('topic')
    if not topic:
        return jsonify({"error": "Topic is required"}), 400

    def generate():
        initial_state = JournalistState(
            topic=topic,
            draft_content="",
            payment_required=False,
            invoice_details={},
            access_token=None,
            payment_approved=False,
            payment_attempts=0,
            messages=[]
        )
        
        config = {"recursion_limit": 50}
        
        # Send initial start event
        yield f"data: {json.dumps({'event': 'agent_step', 'node': 'start', 'message': 'Initializing Journalist Agent...'})}\n\n"

        for output in langgraph_app.stream(initial_state, config, stream_mode="updates"):
            for node_name, state_update in output.items():
                
                # Extract relevant data for the UI
                messages = state_update.get("messages", [])
                latest_msg_content = ""
                
                if messages and isinstance(messages[-1], AIMessage):
                    latest_msg_content = messages[-1].content
                    
                draft_content = state_update.get("draft_content", "")
                payment_required = state_update.get("payment_required", False)
                invoice_details = state_update.get("invoice_details", {})
                
                # Format an SSE chunk
                chunk = {
                    "event": "agent_step",
                    "node": node_name,
                    "message": latest_msg_content,
                    "draft_content": draft_content,
                    "payment_required": payment_required,
                    "invoice_details": invoice_details
                }
                
                yield f"data: {json.dumps(chunk)}\n\n"
                time.sleep(0.5)  # Slight delay for UI pacing

        yield f"data: {json.dumps({'event': 'complete', 'message': 'Investigation completed.'})}\n\n"

    return Response(generate(), mimetype='text/event-stream')


@app.route('/api/audit', methods=['GET'])
def get_audit():
    try:
        with open("compliance_audit_log.md", "r", encoding="utf-8") as f:
            content = f.read()
        return jsonify({"content": content})
    except FileNotFoundError:
        return jsonify({"content": "# Enterprise AI Procurement Audit Log\nNo logs generated yet."})

if __name__ == '__main__':
    app.run(port=5002, debug=True)
