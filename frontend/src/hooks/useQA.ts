import { useCallback, useState } from "react";
import { parseApi } from "../lib/validate";
import { QAResponseSchema } from "../schemas/api";
import type { QAPair } from "../types";
import { apiFetch } from "../services/api";

export function useQA() {
  const [qaInput, setQaInput] = useState("");
  const [qaHistory, setQaHistory] = useState<QAPair[]>([]);
  const [pendingQuestion, setPendingQuestion] = useState("");

  const resetQA = useCallback(() => {
    setQaInput("");
    setQaHistory([]);
    setPendingQuestion("");
  }, []);

  const askQA = useCallback(async (
    context: string,
    documentId: string,
    deps: {
      setError: (e: string | null) => void;
      setLoading: (v: boolean) => void;
      onAnswered: (newHistory: QAPair[]) => Promise<void>;
    },
  ) => {
    if (!qaInput.trim()) return;
    if (!context && !documentId) {
      alert("⚠️ กรุณาอัปโหลดไฟล์ PDF หรือพิมพ์เนื้อหาในกล่องข้อความก่อนเริ่มถามครับ");
      return;
    }

    const currentQ = qaInput;
    setPendingQuestion(currentQ);
    deps.setLoading(true);
    setQaInput("");

    try {
      const raw = await apiFetch<unknown>("/qa", {
        method: "POST",
        json: { context, question: currentQ, document_id: documentId },
      });
      const json = parseApi(QAResponseSchema, raw, "qa");
      const finalAns = json.answer;
      const newHistory = [{ question: currentQ, answer: finalAns }, ...qaHistory];
      setQaHistory(newHistory);
      await deps.onAnswered(newHistory);
    } catch (e) {
      deps.setError(e instanceof Error ? e.message : String(e));
      setQaInput(currentQ);
    } finally {
      deps.setLoading(false);
      setPendingQuestion("");
    }
  }, [qaInput, qaHistory]);

  return { qaInput, setQaInput, qaHistory, setQaHistory, resetQA, askQA, pendingQuestion };
}
