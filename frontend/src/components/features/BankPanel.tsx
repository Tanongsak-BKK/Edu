import { useState, useEffect } from "react";
import type { QuizItem, BankQuestion } from "../../types";
import type { useBank } from "../../hooks/useBank";
import { idxToLetter } from "../../utils/helpers";
import { Modal } from "../ui/Modal";
import { PrimaryBtn } from "../ui/PrimaryBtn";

type BankState = ReturnType<typeof useBank>;

type Props = BankState & {
  questions: QuizItem[];
  onError: (msg: string) => void;
};

function EditQuestionRow({
  originalQ, index, onRemove, onSave
}: {
  originalQ: BankQuestion;
  index: number;
  onRemove: () => void;
  onSave: (updatedQ: BankQuestion) => Promise<void>;
}) {
  const [q, setQ] = useState(originalQ);
  
  useEffect(() => {
    setQ(originalQ);
  }, [originalQ]);

  const isMcq = q.type === "mcq";

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 text-sm space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <label className="block text-[13px] text-zinc-400 mb-1">ข้อที่ {index + 1}</label>
          <input
            className="w-full rounded-xl bg-zinc-900 border border-zinc-800 px-3 py-2 font-medium text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
            value={q.question}
            onChange={(e) => setQ({ ...q, question: e.target.value })}
            placeholder="พิมพ์คำถาม…"
          />
        </div>
        <PrimaryBtn className="bg-red-700 hover:bg-red-600 shrink-0 self-start" onClick={onRemove}>
          ลบออกจากชุด
        </PrimaryBtn>
      </div>
      {isMcq ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <input
              key={i}
              className="rounded-xl bg-zinc-900 border border-zinc-800 px-3 py-2"
              value={(q.choices ?? ["", "", "", ""])[i] ?? ""}
              onChange={(e) => {
                const arr = (q.choices ?? ["", "", "", ""]).slice(0, 4);
                while (arr.length < 4) arr.push("");
                arr[i] = e.target.value;
                setQ({ ...q, choices: arr });
              }}
              placeholder={`ช้อยส์ ${idxToLetter[i]}`}
            />
          ))}
          <select
            className="rounded-xl bg-zinc-900 border border-zinc-800 px-3 py-2"
            value={q.answer}
            onChange={(e) => setQ({ ...q, answer: e.target.value })}
          >
            {idxToLetter.map((l) => (<option key={l} value={l}>{`เฉลย ${l}`}</option>))}
          </select>
        </div>
      ) : (
        <div className="flex gap-3">
          <label className="flex items-center gap-2">
            <input type="radio" name={`tf-${q.id}`} checked={q.answer === "true"} onChange={() => setQ({ ...q, answer: "true" })} /> จริง
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name={`tf-${q.id}`} checked={q.answer === "false"} onChange={() => setQ({ ...q, answer: "false" })} /> เท็จ
          </label>
        </div>
      )}
      <input
        className="w-full rounded-xl bg-zinc-900 border border-zinc-800 px-3 py-2"
        value={q.explain ?? ""}
        onChange={(e) => setQ({ ...q, explain: e.target.value })}
        placeholder="เหตุผล/คำอธิบาย…"
      />
      <div className="flex justify-end">
        <PrimaryBtn
          className="bg-emerald-700 hover:bg-emerald-600"
          onClick={async () => {
            try {
              await onSave(q);
              alert("บันทึกแล้ว");
            } catch {
              alert("บันทึกไม่สำเร็จ");
            }
          }}
        >
          บันทึกข้อนี้
        </PrimaryBtn>
      </div>
    </div>
  );
}

export function BankPanel({
  questions,
  onError,
  setsOpen, setSetsOpen,
  sets,
  saveOpen, setSaveOpen,
  creatingTitle, setCreatingTitle,
  manualOpen, setManualOpen,
  manualSetId, setManualSetId,
  manualType, setManualType,
  manualQ, setManualQ,
  manualChoices, setManualChoices,
  manualAns, setManualAns,
  manualExplain, setManualExplain,
  editOpen, setEditOpen,
  bankQuestions,
  loadSets, loadBank,
  createSet, renameSet, deleteSet,
  exportSetPdf, saveQuestionToSet, updateBankQuestion,
}: Props) {
  return (
    <>
      <Modal
        open={saveOpen.open}
        onClose={() => setSaveOpen({ open: false, qIndex: null })}
        title="บันทึกข้อสอบลงชุด"
        rightInfo={<button className="text-indigo-300 hover:underline" onClick={() => loadSets()}>รีเฟรช</button>}
      >
        <div className="space-y-3">
          {saveOpen.qIndex !== null && questions[saveOpen.qIndex] && (
            <div className="p-3 rounded-xl bg-zinc-800/50 border border-zinc-700/50 text-sm text-zinc-300 mb-4">
              <span className="font-semibold text-indigo-400">ข้อที่เลือก:</span> {questions[saveOpen.qIndex].question}
            </div>
          )}
          <div className="grid gap-2">
            {sets.length === 0 && (
              <div className="text-center text-zinc-500 py-4">ยังไม่มีชุดข้อสอบ (ไปสร้างที่เมนู &quot;จัดการชุดข้อสอบ&quot; ก่อน)</div>
            )}
            {sets.map((s) => (
              <button
                key={s.id}
                className="flex items-center justify-between p-3 rounded-xl border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 transition text-left group"
                onClick={async () => {
                  if (saveOpen.qIndex === null) return;
                  const q = questions[saveOpen.qIndex];
                  try {
                    await saveQuestionToSet(s.id, q);
                    alert(`บันทึกข้อนี้ลงชุด "${s.title}" เรียบร้อยแล้ว`);
                    setSaveOpen({ open: false, qIndex: null });
                  } catch (e) {
                    alert(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
                  }
                }}
              >
                <span className="font-medium">{s.title}</span>
                <span className="text-xs bg-zinc-800 px-2 py-1 rounded text-zinc-400 group-hover:bg-zinc-700">
                  {s.question_ids.length} ข้อ
                </span>
              </button>
            ))}
          </div>
        </div>
      </Modal>

      <Modal open={setsOpen} onClose={() => setSetsOpen(false)} title="จัดการชุดข้อสอบ">
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              className="flex-1 rounded-2xl bg-zinc-900/50 border border-zinc-800 px-4 py-3 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
              placeholder="ตั้งชื่อชุดข้อสอบใหม่…"
              value={creatingTitle}
              onChange={(e) => setCreatingTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && creatingTitle.trim()) {
                  createSet(creatingTitle.trim());
                  setCreatingTitle("");
                }
              }}
            />
            <button
              onClick={async () => {
                if (!creatingTitle.trim()) return;
                await createSet(creatingTitle.trim());
                setCreatingTitle("");
              }}
              className="rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-3 font-semibold text-white shadow-lg shadow-indigo-500/25 hover:from-indigo-500 hover:to-purple-500 transition-all whitespace-nowrap flex items-center justify-center gap-2"
            >
              สร้างชุดใหม่
            </button>
          </div>

          {sets.length === 0 ? (
            <div className="text-center py-12 text-zinc-500 border border-dashed border-zinc-800 rounded-2xl bg-zinc-900/20">
              ยังไม่มีชุดข้อสอบ — ลองสร้างชุดแรกดูสิ
            </div>
          ) : (
            <ul className="space-y-3">
              {sets.map((s) => (
                <li key={s.id} className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 hover:border-zinc-700/80 hover:bg-zinc-800/40 transition-all flex flex-col xl:flex-row xl:items-center justify-between gap-4 group">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="font-semibold text-lg text-zinc-200 truncate">{s.title}</span>
                    <span className="shrink-0 px-2.5 py-1.5 rounded-lg bg-zinc-800/80 border border-zinc-700 text-xs text-zinc-400 font-medium flex items-center gap-1">
                      <span>{s.question_ids.length}</span> ข้อ
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      className="text-xs px-3 py-2 rounded-xl bg-zinc-800/50 text-zinc-300 hover:bg-zinc-700 hover:text-white transition border border-zinc-700/50"
                      onClick={async () => {
                        const name = prompt("แก้ไขชื่อชุดข้อสอบ:", s.title) || s.title;
                        await renameSet(s.id, name);
                      }}
                    >
                      แก้ชื่อ
                    </button>
                    <button
                      className="text-xs px-3 py-2 rounded-xl bg-sky-600/10 text-sky-400 hover:bg-sky-600/20 hover:text-sky-300 transition border border-sky-500/20"
                      onClick={async () => { await loadBank(); setEditOpen({ open: true, set: s }); }}
                    >
                      แก้รายการ
                    </button>
                    <button
                      className="text-xs px-3 py-2 rounded-xl bg-purple-600/10 text-purple-400 hover:bg-purple-600/20 hover:text-purple-300 transition border border-purple-500/20"
                      onClick={() => { setManualSetId(s.id); setManualOpen(true); }}
                    >
                      เพิ่มข้อเอง
                    </button>
                    <button
                      className="text-xs px-3 py-2 rounded-xl bg-emerald-600/10 text-emerald-400 hover:bg-emerald-600/20 hover:text-emerald-300 transition border border-emerald-500/20"
                      onClick={() => exportSetPdf(s.id, onError, { shuffleChoices: false, showAnswers: false })}
                    >
                      ส่งออก PDF
                    </button>
                    <button
                      className="text-xs px-3 py-2 rounded-xl bg-red-600/10 text-red-400 hover:bg-red-600/20 hover:text-red-300 transition border border-red-500/20"
                      onClick={async () => { if (confirm("ต้องการลบชุดนี้ใช่หรือไม่?")) await deleteSet(s.id); }}
                    >
                      ลบ
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Modal>

      <Modal open={manualOpen} onClose={() => setManualOpen(false)} title="เพิ่มข้อสอบเองลงชุด" rightInfo={<button className="text-indigo-300 hover:underline" onClick={() => loadSets()}>รีเฟรชเซ็ต</button>}>
        <div className="space-y-3">
          <div className="flex gap-2">
            <select className="rounded-xl bg-zinc-900 border border-zinc-800 px-3 py-2" value={manualSetId ?? ""} onChange={(e) => setManualSetId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">เลือกชุดที่จะเพิ่ม…</option>
              {sets.map((s) => (<option key={s.id} value={s.id}>{s.title} ({s.question_ids.length} ข้อ)</option>))}
            </select>
            <select className="rounded-xl bg-zinc-900 border border-zinc-800 px-3 py-2" value={manualType} onChange={(e) => setManualType(e.target.value as "mcq" | "tf")}>
              <option value="mcq">แบบปรนัย</option>
              <option value="tf">แบบถูกผิด</option>
            </select>
          </div>
          <textarea className="w-full rounded-xl bg-zinc-900 border border-zinc-800 px-3 py-2" placeholder="พิมพ์คำถาม…" value={manualQ} onChange={(e) => setManualQ(e.target.value)} />
          {manualType === "mcq" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {manualChoices.map((c, i) => (
                <input
                  key={i}
                  className="rounded-xl bg-zinc-900 border border-zinc-800 px-3 py-2"
                  placeholder={`ช้อยส์ ${idxToLetter[i]}`}
                  value={c}
                  onChange={(e) => { const clone = manualChoices.slice(); clone[i] = e.target.value; setManualChoices(clone); }}
                />
              ))}
              <select className="rounded-xl bg-zinc-900 border border-zinc-800 px-3 py-2" value={manualAns} onChange={(e) => setManualAns(e.target.value)}>
                {idxToLetter.map((l) => (<option key={l} value={l}>{`เฉลย ${l}`}</option>))}
              </select>
            </div>
          ) : (
            <div className="flex gap-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name="tfans" value="true" checked={manualAns === "true"} onChange={() => setManualAns("true")} /> จริง (true)
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name="tfans" value="false" checked={manualAns === "false"} onChange={() => setManualAns("false")} /> เท็จ (false)
              </label>
            </div>
          )}
          <input className="w-full rounded-xl bg-zinc-900 border border-zinc-800 px-3 py-2" placeholder="เหตุผล/คำอธิบาย (ถ้ามี)…" value={manualExplain} onChange={(e) => setManualExplain(e.target.value)} />
          <div className="flex justify-end">
            <PrimaryBtn
              onClick={async () => {
                if (!manualSetId) { alert("กรุณาเลือกชุดที่จะเพิ่มก่อน"); return; }
                if (!manualQ.trim()) { alert("กรุณาพิมพ์คำถาม"); return; }
                const qi: QuizItem = manualType === "mcq"
                  ? { type: "mcq", question: manualQ.trim(), choices: manualChoices.map((x) => x.trim()).slice(0, 4), answer: manualAns, explain: manualExplain.trim() }
                  : { type: "tf", question: manualQ.trim(), answer: manualAns.toLowerCase() === "true" ? "true" : "false", explain: manualExplain.trim() };
                try {
                  await loadBank();
                  await saveQuestionToSet(manualSetId, qi);
                  await loadSets();
                  setManualQ("");
                  setManualChoices(["", "", "", ""]);
                  setManualAns(manualType === "mcq" ? "ก" : "true");
                  setManualExplain("");
                  alert("เพิ่มข้อสอบแล้ว");
                } catch (e) {
                  alert(e instanceof Error ? e.message : "เกิดข้อผิดพลาดในการบันทึก");
                }
              }}
            >
              เพิ่มลงชุด
            </PrimaryBtn>
          </div>
        </div>
      </Modal>

      <Modal
        open={editOpen.open}
        onClose={() => setEditOpen({ open: false, set: null })}
        title={`แก้รายการในชุด: ${editOpen.set?.title ?? ""}`}
        rightInfo={<button className="text-indigo-300 hover:underline" onClick={() => { loadBank(); loadSets(); }}>รีเฟรช</button>}
      >
        {!editOpen.set ? (
          <div className="text-sm text-zinc-400">ไม่พบชุด</div>
        ) : (
          <div className="space-y-3">
            {(editOpen.set?.question_ids ?? []).length === 0 && (
              <div className="text-sm text-zinc-400">ยังไม่มีข้อสอบในชุดนี้</div>
            )}
            {(editOpen.set?.question_ids ?? []).map((qid, index) => {
              const q = bankQuestions.find((b) => b.id === qid);
              if (!q) {
                return (
                  <div key={qid} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <div className="text-red-300">ไม่พบข้อสอบ ID {qid}</div>
                      <PrimaryBtn
                        className="bg-red-700 hover:bg-red-600"
                        onClick={async () => {
                          if (!editOpen.set) return;
                          const ids = editOpen.set.question_ids.filter((id) => id !== qid);
                          await renameSet(editOpen.set.id, editOpen.set.title, ids);
                          await loadSets();
                          setEditOpen((e) => ({ ...e, set: { ...e.set!, question_ids: ids } }));
                        }}
                      >
                        ลบออกจากชุด
                      </PrimaryBtn>
                    </div>
                  </div>
                );
              }

              return (
                <EditQuestionRow
                  key={qid}
                  originalQ={q}
                  index={index}
                  onRemove={async () => {
                    if (!editOpen.set) return;
                    const ids = editOpen.set.question_ids.filter((id) => id !== qid);
                    await renameSet(editOpen.set.id, editOpen.set.title, ids);
                    await loadSets();
                    setEditOpen((e) => ({ ...e, set: { ...e.set!, question_ids: ids } }));
                  }}
                  onSave={async (updatedQ) => {
                    await updateBankQuestion(updatedQ);
                  }}
                />
              );
            })}
          </div>
        )}
      </Modal>
    </>
  );
}
