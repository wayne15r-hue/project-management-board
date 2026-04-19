"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Columns3,
  MousePointerClick,
  Table2,
  Users,
  ArrowRight,
  ArrowLeft,
  Loader2,
  Sparkles,
  LayoutDashboard,
} from "lucide-react";
import { BOARD_TEMPLATES, type BoardTemplate } from "@/lib/board-templates";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const STORAGE_KEY = "pb-onboarding-complete";

interface OnboardingWizardProps {
  userName: string | null;
  boardCount: number;
  userId: string;
}

export function OnboardingWizard({ userName, boardCount, userId }: OnboardingWizardProps) {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);
  const [selectedTemplate, setSelectedTemplate] = useState<BoardTemplate | null>(null);
  const [boardName, setBoardName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createdBoardId, setCreatedBoardId] = useState<string | null>(null);
  const [tipIndex, setTipIndex] = useState(0);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    // Show onboarding only for users with 0 boards and who haven't completed it
    if (boardCount > 0) return;
    const done = localStorage.getItem(STORAGE_KEY);
    if (done) return;
    setVisible(true);
  }, [boardCount]);

  function finish() {
    localStorage.setItem(STORAGE_KEY, "true");
    setVisible(false);
    if (createdBoardId) {
      router.push(`/dashboard/board/${createdBoardId}`);
      router.refresh();
    }
  }

  async function handleCreateBoard() {
    if (!selectedTemplate) return;
    setCreating(true);

    try {
      const finalName = boardName.trim() || `My ${selectedTemplate.name}`;

      const { data: board, error: boardError } = await supabase
        .from("boards")
        .insert({
          name: finalName,
          description: selectedTemplate.description,
          owner_id: userId,
        })
        .select()
        .single();

      if (boardError) throw boardError;

      const columnsPayload = selectedTemplate.columns.map((col, idx) => ({
        board_id: board.id,
        name: col.name,
        position: idx,
        color: col.color,
      }));

      const { error: colError } = await supabase.from("columns").insert(columnsPayload);
      if (colError) throw colError;

      if (selectedTemplate.labels.length > 0) {
        const labelsPayload = selectedTemplate.labels.map((l) => ({
          board_id: board.id,
          name: l.name,
          color: l.color,
        }));
        await supabase.from("labels").insert(labelsPayload);
      }

      setCreatedBoardId(board.id);
      setStep(2); // go to tips
    } catch {
      toast.error("Failed to create board");
    } finally {
      setCreating(false);
    }
  }

  if (!visible) return null;

  const TIPS = [
    {
      icon: MousePointerClick,
      title: "Drag cards between columns",
      desc: "Move cards across columns to update their status. Just grab and drop!",
      color: "#6366f1",
    },
    {
      icon: Sparkles,
      title: "Rich card details",
      desc: "Click any card to add descriptions, subtasks, labels, due dates, and attachments.",
      color: "#8b5cf6",
    },
    {
      icon: Table2,
      title: "Multiple views",
      desc: "Switch between Board, Table, and Timeline views using the toggle in the header.",
      color: "#3b82f6",
    },
    {
      icon: Users,
      title: "Invite your team",
      desc: "Go to the Teams page to invite collaborators and manage team access.",
      color: "#22c55e",
    },
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="relative w-full max-w-lg animate-fade-in rounded-2xl border border-border bg-card p-8 shadow-2xl sm:p-10">
        {/* Progress */}
        <div className="mb-6 flex items-center gap-2">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={cn(
                "h-1.5 flex-1 rounded-full transition-colors duration-300",
                i <= step ? "bg-gradient-to-r from-indigo-500 to-purple-500" : "bg-muted"
              )}
            />
          ))}
        </div>

        {/* Step 0: Welcome */}
        {step === 0 && (
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-500 text-white shadow-lg">
              <LayoutDashboard className="h-7 w-7" />
            </div>
            <h2 className="text-[24px] font-bold text-foreground">
              Welcome to ProjectBoard{userName ? `, ${userName.split(" ")[0]}` : ""}!
            </h2>
            <p className="mt-2 text-[15px] text-muted-foreground">
              Let's set up your workspace in 30 seconds.
            </p>
            <Button
              onClick={() => setStep(1)}
              className="mt-8 h-11 bg-foreground px-8 text-background hover:bg-foreground/90"
            >
              Get Started
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <button
              onClick={finish}
              className="mt-3 block w-full text-[12px] text-muted-foreground hover:text-foreground"
            >
              Skip for now
            </button>
          </div>
        )}

        {/* Step 1: Pick template */}
        {step === 1 && (
          <div>
            <h2 className="text-[20px] font-bold text-foreground">
              Create your first board
            </h2>
            <p className="mt-1 text-[14px] text-muted-foreground">
              Pick a template or start blank.
            </p>

            <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {BOARD_TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setSelectedTemplate(t);
                    setBoardName("");
                  }}
                  className={cn(
                    "flex items-start gap-3 rounded-lg border p-3 text-left transition",
                    selectedTemplate?.id === t.id
                      ? "border-indigo-500 bg-indigo-500/5 ring-1 ring-indigo-500/30"
                      : "border-border hover:border-foreground/20 hover:bg-accent/50"
                  )}
                >
                  <span className="text-[18px]">{t.icon}</span>
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-foreground">{t.name}</p>
                    <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">
                      {t.description}
                    </p>
                  </div>
                </button>
              ))}
            </div>

            {selectedTemplate && (
              <div className="mt-4">
                <Input
                  placeholder={`Board name (default: My ${selectedTemplate.name})`}
                  value={boardName}
                  onChange={(e) => setBoardName(e.target.value)}
                  className="h-10"
                />
              </div>
            )}

            <div className="mt-6 flex items-center justify-between">
              <Button variant="ghost" size="sm" onClick={() => setStep(0)}>
                <ArrowLeft className="mr-1 h-3.5 w-3.5" />
                Back
              </Button>
              <Button
                onClick={handleCreateBoard}
                disabled={!selectedTemplate || creating}
                className="bg-foreground text-background hover:bg-foreground/90"
              >
                {creating ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Columns3 className="mr-2 h-4 w-4" />
                )}
                Create Board
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Quick tips */}
        {step === 2 && (
          <div>
            <h2 className="text-[20px] font-bold text-foreground">
              Quick tips
            </h2>
            <p className="mt-1 text-[14px] text-muted-foreground">
              Here are a few things you can do.
            </p>

            <div className="mt-5">
              {TIPS.map((tip, i) => (
                <div
                  key={tip.title}
                  className={cn(
                    "overflow-hidden transition-all duration-300",
                    i === tipIndex ? "max-h-40 opacity-100" : "max-h-0 opacity-0"
                  )}
                >
                  <div className="flex items-start gap-4 rounded-lg border border-border bg-muted/30 p-4">
                    <div
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
                      style={{ backgroundColor: `${tip.color}15` }}
                    >
                      <tip.icon className="h-5 w-5" style={{ color: tip.color }} />
                    </div>
                    <div>
                      <p className="text-[14px] font-semibold text-foreground">{tip.title}</p>
                      <p className="mt-0.5 text-[13px] text-muted-foreground">{tip.desc}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 flex items-center justify-center gap-1.5">
              {TIPS.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setTipIndex(i)}
                  className={cn(
                    "h-2 rounded-full transition-all",
                    i === tipIndex ? "w-6 bg-indigo-500" : "w-2 bg-muted-foreground/30"
                  )}
                />
              ))}
            </div>

            <div className="mt-6 flex items-center justify-between">
              <Button variant="ghost" size="sm" onClick={() => setStep(1)}>
                <ArrowLeft className="mr-1 h-3.5 w-3.5" />
                Back
              </Button>
              <Button
                onClick={() => {
                  if (tipIndex < TIPS.length - 1) {
                    setTipIndex(tipIndex + 1);
                  } else {
                    setStep(3);
                  }
                }}
                className="bg-foreground text-background hover:bg-foreground/90"
              >
                {tipIndex < TIPS.length - 1 ? "Next tip" : "Finish"}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Done */}
        {step === 3 && (
          <div className="text-center">
            <div className="mx-auto mb-4 text-[48px]">
              <span role="img" aria-label="party">🎉</span>
            </div>
            <h2 className="text-[24px] font-bold text-foreground">
              You're all set!
            </h2>
            <p className="mt-2 text-[15px] text-muted-foreground">
              Your board is ready. Start adding cards and organizing your work.
            </p>
            <Button
              onClick={finish}
              className="mt-8 h-11 bg-foreground px-8 text-background hover:bg-foreground/90"
            >
              Go to your board
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
