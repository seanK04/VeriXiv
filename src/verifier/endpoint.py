from flask import Flask, request, jsonify
import requests

import fitz
from score import score as score_paper
from constants import MODEL_NAME
from diskcache import Cache

app = Flask(__name__)
cache = Cache('./gemini_cache', size_limit=1e9)

# @app.route("/score", methods=["GET"])
# def hello():
#     return jsonify({"message": "Hello, world!"})

def get_arxiv_pdf_as_bytes(paper_id: str):
    url = f"https://arxiv.org/pdf/{paper_id}.pdf"

    response = requests.get(url)
    if response.status_code == 200:
        print(f"Downloaded {paper_id}.pdf")
        return response.content

    print("Error downloading paper.")
    return None


@app.route("/score", methods=["GET"])
def score():
    data = request.json
    paper_id = data["paper_id"]
    raw_pdf_bytes = get_arxiv_pdf_as_bytes(paper_id)
    doc = fitz.open(stream=raw_pdf_bytes, filetype="pdf")

    paper_text = ''
    for page in doc:
        paper_text += page.get_text()
    
    score = score_paper(paper_text, MODEL_NAME, cache)

    return jsonify({"score": score})
    

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=1919)
