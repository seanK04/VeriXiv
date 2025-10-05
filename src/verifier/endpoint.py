from flask import Flask, request, jsonify
from flask_cors import CORS
import requests
from datetime import datetime
import hashlib
import os

import fitz
from score import score as score_paper, score_pages_concurrently
from constants import MODEL_NAME
from diskcache import Cache
from validator import NLP_REPRODUCABILITY_RUBRIC_FIELDS, VALID_VALUES

"""
Endpoint for the scoring service
by Gemini.

Example Post Request:

curl -X POST http://localhost:1919/score \
     -H "Content-Type: application/json" \
     -d '{
           "paper_id": "2510.02306v1",
           "pdf_url": "https://arxiv.org/pdf/2510.02306v1.pdf"
         }'
"""

app = Flask(__name__)

# Configure CORS for production
# Add your Cloudflare Pages URL to allowed origins
allowed_origins = os.environ.get("ALLOWED_ORIGINS", "*").split(",")
CORS(app, origins=allowed_origins if allowed_origins != ["*"] else "*")

cache = Cache('./gemini_cache', size_limit=1e9)

POINTS = [1, 0.5, 0, 1]
POINTS_MAP = {
    rubric_mark : point for (rubric_mark, point) in zip(VALID_VALUES, POINTS)
} | {
    point : rubric_mark for (rubric_mark, point) in zip(VALID_VALUES, POINTS)
}

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
    
def rubric_to_num(graded_rubric: dict[str, str], fields: list[str]):
    """
    Complete : 1
    Partial : 0.5
    Not Present : 0
    Not Applicable : 1
    """
    points = 0
    total_possible_points = len(fields)
    for field in fields:
        points += POINTS_MAP[graded_rubric[field]]

    return points / total_possible_points

def pretty_print(D):
    for k,v in D.items():
        print(f"{k} : {v}")


def get_page_references(rubric_fields, graded_rubrics):
    """
    For each rubric field:
      - If any page is 'Complete', return all such pages.
      - Else if any page is 'Partial', return all such pages.
      - Else return [-1].
      
    rubric_fields: list of rubric field names
    graded_rubrics: list[dict], one dict per page mapping field -> value
    """
    page_references = {}

    for field in rubric_fields:
        complete_pages = []
        partial_pages = []

        for i, graded_rubric in enumerate(graded_rubrics):
            val = graded_rubric.get(field)
            if val == "Complete":
                complete_pages.append(i + 1)
            elif val == "Partial":
                partial_pages.append(i + 1)

        if complete_pages:
            page_references[field] = complete_pages
        elif partial_pages:
            page_references[field] = partial_pages
        else:
            page_references[field] = [-1]

    return page_references


def calc_aggregate_graded_rubric(graded_rubrics):

    aggregate_graded_rubric_by_value = {}
    for graded_rubric in graded_rubrics:
        for k,v in graded_rubric.items():
            if k == "Assessment" or k == "assessment":
                continue
            aggregate_graded_rubric_by_value[k] = max(aggregate_graded_rubric_by_value.get(k, POINTS_MAP[v]), POINTS_MAP[v])

    aggregate_graded_rubric_by_name = {}
    for k,v in aggregate_graded_rubric_by_value.items():
        aggregate_graded_rubric_by_name[k] = POINTS_MAP[v]

    return aggregate_graded_rubric_by_name


@app.route("/", methods=["GET"])
def health_check():
    """Health check endpoint"""
    return jsonify({
        "status": "healthy",
        "service": "VeriXiv API",
        "timestamp": str(datetime.now())
    })


@app.route("/score", methods=["POST"])
def score_endpoint():
    data = request.json

    paper_id = data.get("paper_id", None)
    if not paper_id:
        return jsonify({"error": "ArXiv Paper Id is required"}), 400

    pdf_url = data.get("pdf_url", None)
    if not pdf_url:
        return jsonify({"error": "PDF URL is required"}), 400

    if paper_id in cache:
        print("Cache hit! Using cached result.")
        result = cache[paper_id]
    else:
        raw_pdf_bytes = get_pdf_as_bytes(pdf_url)
        if raw_pdf_bytes is None:
            return jsonify({"error": "Failed to download PDF"}), 500
        
        doc = fitz.open(stream=raw_pdf_bytes, filetype="pdf")
        pages_text = []
        for page in doc:
            pages_text.append(page.get_text())

        page_results = score_pages_concurrently(pages_text, MODEL_NAME, max_workers=8)
        
        graded_rubrics = []
        for page_result in page_results:
            graded_rubrics.append(page_result['fields'])
        
        result = {}

        result['fields'] = calc_aggregate_graded_rubric(graded_rubrics)
        result['page_references'] = get_page_references(NLP_REPRODUCABILITY_RUBRIC_FIELDS, graded_rubrics)

        print("Cache miss! Deferring to Gemini API.")
        cache[paper_id] = result

    graded_rubric = result['fields']
    graded_rubric_score = rubric_to_num(graded_rubric, NLP_REPRODUCABILITY_RUBRIC_FIELDS)
    page_references = result['page_references']

    print(f"Graded rubric as number: {graded_rubric_score}")
    pretty_print(page_references)
    
    return jsonify({
        "graded_rubric": graded_rubric,
        "graded_rubric_score" : graded_rubric_score,
        "page_references" : page_references,
        "paper_id": paper_id,
        "pdf_url": pdf_url,
        "analysis_timestamp": str(datetime.now())
    })


@app.route("/score-by-text", methods=["POST"])
def score_by_text():
    """Score paper directly from text without downloading PDF"""
    data = request.json

    paper_id = data.get("paper_id", None)
    if not paper_id:
        return jsonify({"error": "Paper ID is required"}), 400

    paper_text = data.get("paper_text", None)
    if not paper_text:
        return jsonify({"error": "Paper text is required"}), 400

    print(f"Scoring paper by text: {paper_id}")
    
    # Check cache first
    if paper_id in cache:
        print("Cache hit! Using cached result.")
        result = cache[paper_id]
    else:
        print("Cache miss! Deferring to Gemini API.")
        result = score_paper(paper_text, MODEL_NAME)
        cache[paper_id] = result

    graded_rubric = result['fields']
    graded_rubric_score = rubric_to_num(graded_rubric, NLP_REPRODUCABILITY_RUBRIC_FIELDS)

    print(f"Graded rubric as number: {graded_rubric_score}")
    
    return jsonify({
        "graded_rubric": graded_rubric,
        "graded_rubric_score": graded_rubric_score,
        "paper_id": paper_id,
        "analysis_timestamp": str(datetime.now())
    })


@app.route("/process-arxiv", methods=["POST"])
def process_arxiv():
    """Process paper from arXiv URL"""
    data = request.json
    paper_id = data.get("paper_id")
    
    if not paper_id:
        return jsonify({"error": "Paper ID is required"}), 400
    
    # Construct PDF URL from paper ID
    pdf_url = f"https://arxiv.org/pdf/{paper_id}.pdf"
    
    print(f"Processing arXiv paper: {paper_id}")
    
    # Download PDF
    raw_pdf_bytes = get_pdf_as_bytes(pdf_url)
    if raw_pdf_bytes is None:
        return jsonify({"error": "Failed to download arXiv paper"}), 500
    
    # Extract text from PDF
    doc = fitz.open(stream=raw_pdf_bytes, filetype="pdf")
    paper_text = ''
    for page in doc:
        paper_text += page.get_text()
    doc.close()
    
    # Return extracted text for Worker to use
    return jsonify({
        "paper_id": paper_id,
        "pdf_url": pdf_url,
        "status": "processed",
        "text": paper_text,
        "text_length": len(paper_text),
        "timestamp": str(datetime.now())
    })


@app.route("/upload-pdf", methods=["POST"])
def upload_pdf():
    """Handle direct PDF upload from user"""
    if 'file' not in request.files:
        return jsonify({"error": "No file uploaded"}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No file selected"}), 400
    
    print(f"Uploading PDF: {file.filename}")
    
    # Read PDF bytes
    pdf_bytes = file.read()
    
    # Extract text from PDF
    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        paper_text = ''
        for page in doc:
            paper_text += page.get_text()
        doc.close()
    except Exception as e:
        return jsonify({"error": f"Failed to process PDF: {str(e)}"}), 500
    
    # Generate unique ID for uploaded paper
    paper_id = f"uploaded_{hashlib.md5(pdf_bytes).hexdigest()[:12]}"
    
    # Return extracted text for Worker to use
    return jsonify({
        "paper_id": paper_id,
        "filename": file.filename,
        "status": "processed",
        "text": paper_text,
        "text_length": len(paper_text),
        "timestamp": str(datetime.now())
    })
    

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 1919))
    app.run(host="0.0.0.0", port=port)
