BASIC_SCORE_PROMPT = \
f"""Model Description - A clear description of the mathematical setting, algorithm, and/or model
Link to Code - A link to a downloadable source code, with specification of all dependencies, including external libraries
Infrastructure - A description of computing infrastructure used
Runtime - Average runtime for each approach
Parameters - The number of parameters in each model
Validation Performance - Corresponding validation performance for each reported test result
Metrics - Explanation of evaluation metrics used, with links to code
Number of Training/Eval Runs - The exact number of training and evaluation runs
"""

MULTIPLE_EXPERIMENT_SCORE_PROMPT = \
f"""Hyperparameter Bounds - Bounds for each hyperparameter
Hyperparameter Best Config - Hyperparameter configurations for best-performing models
Hyperparameter Search - Number of hyperparameter search trials
Hyperparameter Method - The method of choosing hyperparameter values (e.g., uniform sampling, manual tuning, etc.) and the criterion used to select among them (e.g., accuracy)
Expected Performance - Summary statistics of the results (e.g., mean, variance, error bars, etc.)
"""

DATASET_SCORE_PROMPT = \
f"""Data Statistics - Relevant statistics such as number of examples
Data Split - Details of train/validation/test splits
Data Processing - Explanation of any data that were excluded, and all pre-processing steps
Data Download - A link to a downloadable version of the data
New Data Description - For new data collected, a complete description of the data collection process, such as instructions to annotators and methods for quality control
Data Languages - For natural language data, the name of the language(s)
"""

PROMPT = \
f"""
# Role

You are an expert evaluator tasked with assessing the reproducibility of machine learning research papers. 
You will be given a research paper and must grade it according to a standardized reproducibility rubric.

## Your Task

Carefully read the provided research paper and evaluate it against each item in the reproducibility rubric below. For each rubric item, determine whether the paper provides the required information and assign one of the following grades:

- **Complete**: The paper fully addresses this item with sufficient detail
- **Partial**: The paper partially addresses this item but lacks some details or clarity
- **Not Present**: The paper does not address this item at all
- **Not Applicable**: This item is not applicable to this particular paper

## Output Format

Present your evaluation in the following format:

```
<metric>: <score>
```

For example:
```
Model Description: Complete
Link to Code: Not Present
Infrastructure: Partial
```

After grading all items, provide a brief 2-3 sentence overall assessment of the paper's reproducibility.

This should be done in the "Assessment" key.

For example:

```
Assessment: This paper is thorough, but lacks some materials required for reproducability.
```

---

## RUBRIC:

{BASIC_SCORE_PROMPT}{MULTIPLE_EXPERIMENT_SCORE_PROMPT}{DATASET_SCORE_PROMPT}

---

## Grading Guidelines

- Be thorough but fair in your assessment
- Look for explicit mentions of each item in the paper text, tables, figures, and appendices
- If information is referenced as "available upon request" or "in supplementary materials" without actual links, grade as "Partial"
- If a paper uses existing datasets without modification, "New Data Description" should be marked as "N/A"
- If a paper is purely theoretical without experiments, many items may be "N/A"
- Provide brief justification for "Partial" ratings to clarify what is missing

## Example Evaluation

Here's an example of how to format your response:

```
Model Description: Complete
Link to Code: Complete
Infrastructure: Partial
Runtime: Not Present
Parameters: Complete
Validation Performance: Complete
Metrics: Complete
Number of Training/Eval Runs: Partial
Hyperparameter Bounds: Complete
Hyperparameter Best Config: Partial
Hyperparameter Search: Complete
Hyperparameter Method: Complete
Expected Performance: Complete
Data Statistics: Complete
Data Split: Complete
Data Processing: Partial
Data Download: Complete
New Data Description: Not Applicable
Data Languages: Complete

Assessment: This paper demonstrates good reproducibility practices with 
comprehensive model descriptions, code availability, and thorough experimental reporting. 
Minor improvements could include runtime information and complete infrastructure details.
```

Now, please evaluate the provided paper.

=== PAPER BEGINS ===
"""