from flask import Flask, request, jsonify
import requests
from datetime import datetime

import fitz
from score import score as score_paper
from constants import MODEL_NAME
from diskcache import Cache

app = Flask(__name__)
cache = Cache('./gemini_cache', size_limit=1e9)

# @app.route("/score", methods=["GET"])
# def hello():
#     return jsonify({"message": "Hello, world!"})

# COMMENTED OUT: Old PDF retrieval method using paper ID
# def get_arxiv_pdf_as_bytes(paper_id: str):
#     url = f"https://arxiv.org/pdf/{paper_id}.pdf"
# 
#     response = requests.get(url)
#     if response.status_code == 200:
#         print(f"Downloaded {paper_id}.pdf")
#         return response.content
# 
#     print("Error downloading paper.")
#     return None

def get_pdf_as_bytes(pdf_url: str):
    """Download PDF from the provided URL (from Vectorize metadata)"""
    try:
        response = requests.get(pdf_url, timeout=30)
        if response.status_code == 200:
            print(f"Downloaded PDF from: {pdf_url}")
            return response.content
        else:
            print(f"Error downloading PDF from {pdf_url}: HTTP {response.status_code}")
            return None
    except requests.RequestException as e:
        print(f"Error downloading PDF from {pdf_url}: {e}")
        return None


@app.route("/score", methods=["POST"])
def score_endpoint():
    data = request.json
    paper_id = data["paper_id"]
    
    # Get PDF URL from request (passed from Workers/Vectorize metadata)
    pdf_url = data.get("pdf_url")
    if not pdf_url:
        return jsonify({"error": "PDF URL is required"}), 400
    
    # Download PDF using the provided URL from Vectorize metadata
    raw_pdf_bytes = get_pdf_as_bytes(pdf_url)
    if raw_pdf_bytes is None:
        return jsonify({"error": "Failed to download PDF"}), 500
        
    # Extract text from PDF
    doc = fitz.open(stream=raw_pdf_bytes, filetype="pdf")
    paper_text = ''
    for page in doc:
        paper_text += page.get_text()
    
    # Perform reproducibility analysis
    score = score_paper(paper_text, MODEL_NAME, cache)

    return jsonify({
        "score": score,
        "paper_id": paper_id,
        "pdf_url": pdf_url,
        "analysis_timestamp": str(datetime.now())
    })
    

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=1919)
