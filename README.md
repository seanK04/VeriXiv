# veriXiv
VeriXiv (Verify x ArXiv, pronounced Veri-kive) is a scalable and efficient research paper verifier that checks for reproducibility of your paper against semantically similar papers in your research domain. 

## Motivation
A study in 2023 by [Magnusson et. al.](https://arxiv.org/pdf/2306.09562) in "Reproducibility in NLP: What Have We Learned from the Checklist?" conducted an empirical study on the effects of reproducibility of results of a paper with acceptance into reputable ML (NLP) conferences such as EMNLP.

In particular, they found that there existed a correlation between number of "Yes" marks in a rubric with acceptance to the conference. 

![Magnusson](./Images/Magnusson.png)

## veriXiv Implementation
We used the same rubric and few shot prompted a strong Large Language Model to read an input paper and score the reproducibility of the paper based on the rubric.

Our system then embeds the abstract of the paper and finds the top **k** most semantically similar papers and compares the input paper's reproducibility against it.

The intuition is that semantically similar papers likely involve the same or similar research area, and having this scoring mechanism for reproducibility helps maintain both a status quo as well as a baseline to see how well your paper compares in terms of being able to be reimplemented compared to other papers.

The main technologies used were:

1. Cloudflare Workers AI, (Embedding model, bge-base-en-v1.5 model)
2. Cloudflare Vectorize (Vector Database)
3. Google Gemini API, 2.5 Flash, 2.5 Pro
4. Flask (API Endpoint for Scoring)
5. SQLite (Caching)

### Pipeline
The below image is the high level pipeline for our system.
![Pipeline](./Images/Pipeline.png)

### Scoring Endpoint
The below image shows the high level scoring endpoint that is called to produce reproducibility scores for the top-k semantically similar papers as well as the input papers. For ArXiv papers, we cache these reproducibility scores against the ArXiv ID, such that we do not have to use extraneous tokens reproducing previously generated scores.

![ScoringEndpoint](./Images/image.png)

One of the unique functionalities we implemented was also a "page reference" functionality. When the model grades the paper for reproducibility using the rubric, we wanted to let researchers using the software to easily find where these pieces of implementation details might exist. To do so, we needed to find the exact page number that researchers would have to look to make this process easier.

However, we discovered that asking the LLM to do this was very prone to hallucination.

Instead, we opted for an interesting sliding window approach, where an arXiv paper would be chunked by page. Each page was then fed into the LLM for reproducibility scoring. Across each page, we took the maximum score for each field as the final rubric grade. 

To find which page that the model discovered evidence for a specific rubric item, we looked for pages that had that field marked as "Complete", then "Partial". We found that making the model individually score a page and collecting information about where the model finds evidence was less noise and hallucination prone than other approaches. 
