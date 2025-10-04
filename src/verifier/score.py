from google import genai
from google.genai import types
from dotenv import load_dotenv

import os

from constants import *
from prompts import PROMPT
from validator import RubricValidator, NLP_REPRODUCABILITY_RUBRIC_FIELDS


def score(paper_text: str, model_name: str, cache) -> dict[str, str]:
    load_dotenv()

    client = genai.Client()
    paper_tokens = client.models.count_tokens(
        model=model_name, contents=paper_text
    )

    contents = PROMPT + paper_text
    total_tokens = client.models.count_tokens(
        model=model_name, contents=contents
    )

    model_response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=contents,
        config=types.GenerateContentConfig(
            thinking_config=types.ThinkingConfig(thinking_budget=2000)
        ),
    ).text

    validator = RubricValidator(NLP_REPRODUCABILITY_RUBRIC_FIELDS)
    result = validator.validate(model_response)
    result['paper_tokens'] = paper_tokens.total_tokens
    result['total_tokens'] = total_tokens.total_tokens
    
    print(f"Valid: {result['valid']}")
    print(f"Errors: {result['errors']}")

    return result