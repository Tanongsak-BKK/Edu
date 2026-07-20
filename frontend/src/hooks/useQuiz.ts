import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { HistoryItem, QuizItem } from "../types";
import { normalizeFromAPI, shuffleAndRemapBatch } from "../services/api-helpers";
import { apiFetch } from "../services/api";
import { parseApi } from "../lib/validate";
import { QuizApiResponseSchema, TopicsResponseSchema } from "../schemas/api";
import { BATCH_SIZE, MAX_QUESTIONS } from "../constants/quiz";

export function useQuiz(context: string, documentId: string) {
  const [questions, setQuestions] = useState<QuizItem[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [score, setScore] = useState<number | null>(null);
  const [lockedCount, setLockedCount] = useState(0);
  const [difficultyLevel, setDifficultyLevel] = useState<"easy" | "medium" | "hard" | "mixed">("mixed");
  const topicsRef = useRef<string[]>([]);

  const countByType = useCallback(
    (t: "mcq" | "tf") => questions.filter((q) => q.type === t).length,
    [questions],
  );

  const resetQuiz = useCallback(() => {
    setScore(null);
    setQuestions([]);
    setAnswers({});
    topicsRef.current = [];
    setLockedCount(0);
    setDifficultyLevel("mixed");
  }, []);

  const restoreFromHistory = useCallback((item: {
    questions?: QuizItem[];
    answers?: Record<string, string>;
    score: number;
    lockedCount?: number;
  }) => {
    if (item.questions && item.questions.length > 0) {
      setQuestions(item.questions);
      setAnswers(item.answers as Record<number, string>);
      if (item.score < 0) {
        setScore(null);
        setLockedCount(item.lockedCount || 0);
      } else {
        setScore(item.score);
        setLockedCount(item.lockedCount !== undefined ? item.lockedCount : item.questions.length);
        
        // Restore difficulty based on past score
        const accuracy = item.score / (item.questions.length || 1);
        if (accuracy >= 0.8) setDifficultyLevel("hard");
        else if (accuracy < 0.5) setDifficultyLevel("easy");
        else setDifficultyLevel("medium");
      }
    } else {
      setQuestions([]);
      setScore(null);
      setLockedCount(0);
      setAnswers({});
      setDifficultyLevel("mixed");
    }
    topicsRef.current = [];
  }, []);

  const ensureTopics = useCallback(async () => {
    if ((!context && !documentId) || topicsRef.current.length >= 10) return;
    try {
      const raw = await apiFetch<unknown>("/quiz/topics", {
        method: "POST",
        json: { context, document_id: documentId },
      });
      const json = parseApi(TopicsResponseSchema, raw, "quiz topics");
      if (json.topics.length > 0) {
        const exist = new Set(topicsRef.current.map((t) => t.toLowerCase()));
        for (const t of json.topics) {
          const k = String(t).trim().toLowerCase();
          if (k && !exist.has(k)) {
            topicsRef.current.push(t);
            exist.add(k);
          }
        }
      }
    } catch { /* optional */ }
  }, [context, documentId]);

  const addMoreQuiz = useCallback(async (
    type: "mcq" | "tf",
    deps: {
      setError: (e: string | null) => void;
      setLoading: (v: boolean) => void;
      setLoadingText: (t: string) => void;
      onUpdated: (newQuestions: QuizItem[]) => Promise<void>;
    },
  ) => {
    if (!context && !documentId) return;
    deps.setError(null);
    const already = questions.filter((q) => q.type === type).length;
    const remain = MAX_QUESTIONS - already;
    if (remain <= 0) return;

    const want = Math.min(BATCH_SIZE, remain);
    deps.setLoading(true);
    
    // แจ้งเตือนระดับความยาก
    let diffText = "";
    if (difficultyLevel === "hard") diffText = " (ระดับยาก)";
    else if (difficultyLevel === "easy") diffText = " (ระดับง่าย)";
    else if (difficultyLevel === "medium") diffText = " (ระดับปานกลาง)";
    
    deps.setLoadingText(`กำลังสร้างข้อสอบ ${type === "mcq" ? "แบบปรนัย" : "แบบถูกผิด"}${diffText} เพิ่ม`);

    await ensureTopics();
    const topicSlice = topicsRef.current.splice(0, want);

    try {
      const excludeTexts = questions
        .filter((q) => q.type === type)
        .map((q) => q.question);

      const raw = await apiFetch<unknown>(`/quiz/${type}`, {
        method: "POST",
        json: {
          context,
          document_id: documentId,
          n: want,
          exclude: excludeTexts,
          topics: topicSlice.length ? topicSlice : undefined,
          difficulty: difficultyLevel,
        },
      });
      const json = parseApi(QuizApiResponseSchema, raw, `quiz ${type}`);
      const incoming = normalizeFromAPI(json).filter((q) => q.type === type);

      if (incoming.length === 0) {
        deps.setError(`ไม่พบข้อใหม่ ${type}`);
        return;
      }

      const batchReady = shuffleAndRemapBatch(incoming.slice(0, want));
      const newQuestions = [...questions, ...batchReady];
      setQuestions(newQuestions);
      setScore(null);
      await deps.onUpdated(newQuestions);
    } catch (e) {
      deps.setError(e instanceof Error ? e.message : String(e));
    } finally {
      deps.setLoading(false);
      deps.setLoadingText("");
    }
  }, [context, documentId, ensureTopics, questions, difficultyLevel]);

  const submitQuiz = useCallback(async (onSubmitted: (correct: number) => Promise<void>) => {
    let correct = 0;
    questions.forEach((q, i) => {
      const u = (answers[i] || "").toLowerCase();
      if (u === String(q.answer).toLowerCase()) correct++;
    });
    setScore(correct);
    setLockedCount(questions.length);
    
    // ปรับระดับความยากตามคะแนน
    const accuracy = correct / (questions.length || 1);
    if (accuracy >= 0.8) {
      setDifficultyLevel("hard"); // เก่งมาก เพิ่มความยาก
    } else if (accuracy < 0.5) {
      setDifficultyLevel("easy"); // อ่อน ปรับให้อ่านพื้นฐาน
    } else {
      setDifficultyLevel("medium"); // ปานกลาง
    }
    
    await onSubmitted(correct);
  }, [questions, answers]);

  const handleAnswerChange = useCallback((
    idx: number,
    val: string,
    currentHistoryId: string | null,
    setHistoryItems: Dispatch<SetStateAction<HistoryItem[]>>,
  ) => {
    setAnswers((prev) => {
      const newAns = { ...prev, [idx]: val };
      if (currentHistoryId) {
        setHistoryItems((items) =>
          items.map((item) => (item.id === currentHistoryId ? { ...item, answers: newAns } : item)),
        );
      }
      return newAns;
    });
  }, []);

  return {
    questions,
    setQuestions,
    answers,
    setAnswers,
    score,
    setScore,
    lockedCount,
    setLockedCount,
    topicsRef,
    difficultyLevel,
    setDifficultyLevel,
    countByType,
    resetQuiz,
    restoreFromHistory,
    ensureTopics,
    addMoreQuiz,
    submitQuiz,
    handleAnswerChange,
    isOverallSubmitted: score !== null,
    isAllAnswered: questions.length > 0 && Object.keys(answers).length === questions.length,
  };
}
