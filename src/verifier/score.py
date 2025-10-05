from google import genai
from google.genai import types
from dotenv import load_dotenv
from concurrent.futures import ThreadPoolExecutor, as_completed

import os

from constants import *
from prompts import PROMPT
from validator import RubricValidator, NLP_REPRODUCABILITY_RUBRIC_FIELDS


def score(paper_text: str, model_name: str) -> dict[str, str]:
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

def score_pages_concurrently(pages_text, model_name, max_workers=4):
    """
    Run score_paper() for each page concurrently using threads.
    Preserves original page order.
    """
    from score import score as score_paper  # local import to avoid circular deps

    results = []
    future_to_page = {}

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        for i, page_text in enumerate(pages_text):
            future = executor.submit(score_paper, page_text, model_name)
            future_to_page[future] = i  # map the Future -> page index

        for future in as_completed(future_to_page):
            i = future_to_page[future]  # retrieve the page index
            try:
                result = future.result()
                results.append((i, result))
            except Exception as e:
                print(f"Error scoring page {i}: {e}")
                results.append((i, None))

    # Sort results back to original order
    results.sort(key=lambda x: x[0])
    # Return only the results (not indices)
    return [r for _, r in results]