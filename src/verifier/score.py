from google import genai
from google.genai import types
from dotenv import load_dotenv
import fitz

import os

from constants import *
from diskcache import Cache
from prompts import PROMPT
from validator import RubricValidator, NLP_REPRODUCABILITY_RUBRIC_FIELDS

MODEL_NAME = "gemini-2.5-flash"

def score(file_path: str, model_name, cache) -> dict[str, str]:
    load_dotenv()
    client = genai.Client()
    doc = fitz.open(file_path)
    paper_text = ''
    for page in doc:
        paper_text += page.get_text()

    paper_tokens = client.models.count_tokens(
        model=model_name, contents=paper_text
    )

    contents = PROMPT + paper_text
    total_tokens = client.models.count_tokens(
        model=model_name, contents=contents
    )

    model_response = None
    if contents in cache:
        print("Cache hit!")
        model_response = cache[contents]
    else:
        print("Cache miss! Proceeding with Gemini API Call")
        model_response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=contents,
            config=types.GenerateContentConfig(
                thinking_config=types.ThinkingConfig(thinking_budget=2000)
            ),
        ).text

        cache[contents] = model_response

    validator = RubricValidator(NLP_REPRODUCABILITY_RUBRIC_FIELDS)
    result = validator.validate(model_response)
    result['paper_tokens'] = paper_tokens.total_tokens
    result['total_tokens'] = total_tokens.total_tokens
    
    print(f"Valid: {result['valid']}")
    print(f"Errors: {result['errors']}")

    return result['fields']

cache = Cache('./gemini_cache', size_limit=1e9)
score(f"{DATA_ROOT}/2510.02306v1.pdf", MODEL_NAME, cache)