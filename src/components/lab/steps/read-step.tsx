"use client";

import type { ReadStep } from "@/lib/lab/types";
import { ContinueButton, StepFrame } from "./frame";

export function ReadStepView({ step, onDone }: { step: ReadStep; onDone: () => void }) {
  return (
    <StepFrame
      eyebrow={step.eyebrow ?? `Concept · ${step.minutes} min read`}
      title={step.title}
      footer={<ContinueButton onClick={onDone}>Continue</ContinueButton>}
    >
      <div className="prose-lesson">{step.body}</div>
    </StepFrame>
  );
}
