import { addDays, daysBetween, type Subject } from "@studymaster/core";
import { BookMarked, Brain, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { ChunkList, SubjectFields, WEIGHT_LABEL } from "../components/subjectForm";
import { Badge, Button, Card, EmptyState, Modal, SubjectDot } from "../components/ui";
import { nextColor } from "../lib/colors";
import { formatMinutes, formatShort, newId, relativeDays } from "../lib/format";
import { subjectProgress } from "../lib/stats";
import type { Planner } from "../planner";
import { useStore } from "../store";

export function SubjectsView({ planner }: { planner: Planner }) {
  const subjects = useStore((s) => s.subjects);
  const upsertSubject = useStore((s) => s.upsertSubject);
  const [editing, setEditing] = useState<string | null>(null);
  const progress = subjectProgress(planner.state);
  const status = new Map(planner.shown.plan.subjects.map((s) => [s.subjectId, s]));

  const add = () => {
    const subject: Subject = {
      id: newId(),
      name: "New subject",
      color: nextColor(subjects.map((s) => s.color)),
      weight: 1,
      examDate: addDays(planner.today, 28),
    };
    upsertSubject(subject);
    setEditing(subject.id);
  };

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Subjects</h1>
          <p className="text-slate-500 dark:text-slate-400">Your exams and the material for each.</p>
        </div>
        <Button onClick={add}>
          <Plus size={16} /> Subject
        </Button>
      </header>

      {progress.length === 0 ? (
        <Card>
          <EmptyState icon={<BookMarked size={22} />} title="No subjects yet">
            Add a subject with its exam date, then its chapters and slide decks.
          </EmptyState>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {progress.map((p) => {
            const days = daysBetween(planner.today, p.subject.examDate);
            const deficit = status.get(p.subject.id)?.deficitMinutes ?? 0;
            return (
              <button
                key={p.subject.id}
                type="button"
                onClick={() => setEditing(p.subject.id)}
                className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
              >
                <span className="absolute inset-x-0 top-0 h-1" style={{ background: p.subject.color }} />
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 truncate text-lg font-semibold">
                      <SubjectDot color={p.subject.color} /> {p.subject.name}
                    </p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      Exam {formatShort(p.subject.examDate)} · {days < 0 ? "done" : relativeDays(planner.today, p.subject.examDate)}
                    </p>
                  </div>
                  <Badge className="shrink-0 whitespace-nowrap">{p.subject.weight.toFixed(1)} · {WEIGHT_LABEL[p.subject.weight]}</Badge>
                </div>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.round(p.fraction * 100)}%`, background: p.subject.color }} />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                  <span>{Math.round(p.fraction * 100)}% done</span>
                  <span>{p.chunksDone}/{p.chunks} chunks</span>
                  <span className="inline-flex items-center gap-1"><Brain size={12} /> {p.cardsMade}/{p.cardsEstimated} cards</span>
                  <span>{formatMinutes(p.remainingMinutes)} left</span>
                </div>
                {days >= 0 && p.remainingMinutes > 0 && (
                  <div className="mt-3">{deficit > 0 ? <Badge tone="rose">{formatMinutes(deficit)} short</Badge> : <Badge tone="emerald">on track</Badge>}</div>
                )}
              </button>
            );
          })}
        </div>
      )}

      <SubjectEditor id={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function SubjectEditor({ id, onClose }: { id: string | null; onClose: () => void }) {
  const subject = useStore((s) => s.subjects.find((x) => x.id === id));
  const upsertSubject = useStore((s) => s.upsertSubject);
  const removeSubject = useStore((s) => s.removeSubject);
  const [confirm, setConfirm] = useState(false);

  return (
    <Modal
      open={!!subject}
      onClose={() => {
        setConfirm(false);
        onClose();
      }}
      title={subject?.name || "Subject"}
      wide
      footer={
        <>
          {confirm ? (
            <Button
              variant="danger"
              onClick={() => {
                removeSubject(subject!.id);
                setConfirm(false);
                onClose();
              }}
            >
              <Trash2 size={16} /> Delete subject and its material
            </Button>
          ) : (
            <Button variant="ghost" className="text-rose-600" onClick={() => setConfirm(true)}>
              <Trash2 size={16} /> Delete
            </Button>
          )}
          <Button onClick={onClose}>Done</Button>
        </>
      }
    >
      {subject && (
        <div className="space-y-6">
          <SubjectFields subject={subject} onChange={upsertSubject} />
          <div>
            <h3 className="mb-2 font-semibold">Material</h3>
            <ChunkList subject={subject} />
          </div>
        </div>
      )}
    </Modal>
  );
}
