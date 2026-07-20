from pydantic import BaseModel
from typing import List, Dict, Optional

class ContextIn(BaseModel):
    context: Optional[str] = ""
    document_id: Optional[str] = None

class QuizIn(BaseModel):
    context: Optional[str] = ""
    document_id: Optional[str] = None
    n: int = 5
    exclude: Optional[List[str]] = None
    topics: Optional[List[str]] = None
    difficulty: Optional[str] = "mixed"

class QAIn(BaseModel):
    context: Optional[str] = ""
    document_id: Optional[str] = None
    question: str

class SummarizeOut(BaseModel):
    overview: str
    key_points: List[str]
    sections: List[Dict[str, str]]
    data_points: List[Dict[str, str]]

class TopicsOut(BaseModel):
    topics: List[str]

class EvaluateIn(BaseModel):
    question: str
    user_answer: str
    context: Optional[str] = ""
    document_id: Optional[str] = None
    original_choices: Optional[List[str]] = None

class EvaluateOut(BaseModel):
    is_correct: bool
    confidence_score: float
    feedback: str
    missing_points: List[str]
