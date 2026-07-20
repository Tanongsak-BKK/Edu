from fastapi import APIRouter

from app.models.schemas import ContextIn, QuizIn, TopicsOut, EvaluateIn, EvaluateOut
from app.services.quiz_service import QuizService
from app.services.evaluation_service import EvaluationService

router = APIRouter()


@router.post("/evaluate", response_model=EvaluateOut)
def evaluate_answer(body: EvaluateIn):
    result = EvaluationService.evaluate_reasoning(
        question=body.question,
        user_answer=body.user_answer,
        context=body.context or "",
        document_id=body.document_id,
        original_choices=body.original_choices
    )
    return EvaluateOut(**result)


@router.post("/topics", response_model=TopicsOut)
def quiz_topics(body: ContextIn):
    topics = QuizService.extract_topics(body.context or "", document_id=body.document_id)
    return {"topics": topics}


@router.post("/mcq")
def quiz_mcq(body: QuizIn):
    questions = QuizService.generate_mcq(
        body.context or "",
        body.n or 5,
        body.exclude,
        body.topics,
        document_id=body.document_id
    )
    return {"questions": questions}


@router.post("/tf")
def quiz_tf(body: QuizIn):
    questions = QuizService.generate_tf(
        body.context or "",
        body.n or 5,
        body.exclude,
        body.topics,
        document_id=body.document_id
    )
    return {"questions": questions}
