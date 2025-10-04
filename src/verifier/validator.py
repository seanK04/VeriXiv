from typing import Dict, List, Optional


class RubricValidator:
    """Validate and extract rubric assessments."""
    
    VALID_VALUES = ["Complete", "Partial", "Not Present", "Not Applicable"]
    
    def __init__(self, required_fields: List[str]):
        """
        Args:
            required_fields: List of field names that must be present
        """
        self.required_fields = required_fields
    
    def extract_fields(self, text: str) -> Dict[str, str]:
        """Extract field:value pairs from text."""
        if not text:
            return {}
        
        fields = {}
        try:
            for line in text.split('\n'):
                line = line.strip()
                if not line or ':' not in line:
                    continue
                
                parts = line.split(':', 1)
                if len(parts) == 2:
                    field, value = parts
                    fields[field.strip()] = value.strip()
        except Exception as e:
            print(f"Warning: Error extracting fields: {e}")
        
        return fields
    
    def validate(self, text: str) -> Dict:
        """
        Extract and validate rubric fields.
        
        Returns:
            {
                'valid': bool,
                'fields': dict,
                'errors': list,
                'warnings': list
            }
        """
        errors = []
        warnings = []
        fields = {}
        
        try:
            fields = self.extract_fields(text)
        except Exception as e:
            errors.append(f"Failed to extract fields: {e}")
            return {
                'valid': False,
                'fields': {},
                'errors': errors,
                'warnings': warnings
            }
        
        for field in self.required_fields:
            if field not in fields:
                errors.append(f"Missing required field: {field}")
            else:
                value = fields.get(field, "")
                if value not in self.VALID_VALUES:
                    errors.append(f"Invalid value for {field}: '{value}'")
        
        for field in fields:
            if field not in self.required_fields and field != "Assessment":
                warnings.append(f"Unexpected field: {field}")
        
        return {
            'valid': len(errors) == 0,
            'fields': fields,
            'errors': errors,
            'warnings': warnings
        }
    
    def get_assessment(self, text: str) -> Optional[str]:
        """Extract the assessment summary."""
        try:
            fields = self.extract_fields(text)
            return fields.get('Assessment')
        except Exception as e:
            print(f"Warning: Error getting assessment: {e}")
            return None

NLP_REPRODUCABILITY_RUBRIC_FIELDS = [
    "Model Description",
    "Link to Code",
    "Infrastructure",
    "Runtime",
    "Parameters",
    "Validation Performance",
    "Metrics",
    "Number of Training/Eval Runs",
    "Hyperparameter Bounds",
    "Hyperparameter Best Config",
    "Hyperparameter Search",
    "Hyperparameter Method",
    "Expected Performance",
    "Data Statistics",
    "Data Split",
    "Data Processing",
    "Data Download",
    "New Data Description",
    "Data Languages"
]