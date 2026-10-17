import { useAppState } from "../lib/AppContext";
import { ONBOARDING_STEPS, isOnboardingValid, nextStep, prevStep } from "../lib/onboarding";
import { Card, SectionTitle, Button } from "../components/ui";

export function OnboardingView() {
  const { state, setState } = useAppState();
  const { onboarding } = state;
  const step = ONBOARDING_STEPS[onboarding.step];
  const valid = isOnboardingValid(onboarding.baseline);

  const setValue = (value: number) => {
    setState((prev) => ({
      ...prev,
      onboarding: { ...prev.onboarding, baseline: { ...prev.onboarding.baseline, [step.field]: value } },
    }));
  };

  const finish = () => {
    setState((prev) => ({
      ...prev,
      onboarding: { ...prev.onboarding, completed: true },
      runwayMonths: prev.onboarding.baseline.runwayMonths,
    }));
  };

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Onboarding"
        subtitle="js/onboarding.js — short wizard that sets the baseline consumed by Leadership Science and the runway slider."
      />
      <Card>
        <div className="mb-4 flex gap-1">
          {ONBOARDING_STEPS.map((s) => (
            <div key={s.id} className={`h-1.5 flex-1 rounded-full ${s.id <= onboarding.step ? "bg-indigo-600" : "bg-slate-200"}`} />
          ))}
        </div>
        <h3 className="text-lg font-semibold text-slate-900">{step.title}</h3>
        <p className="mt-1 text-sm text-slate-500">{step.help}</p>
        <input
          type="number"
          min={step.min}
          max={step.max}
          value={onboarding.baseline[step.field]}
          onChange={(e) => setValue(Number(e.target.value))}
          className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2"
        />
        <div className="mt-4 flex justify-between">
          <Button variant="ghost" onClick={() => setState((prev) => ({ ...prev, onboarding: { ...prev.onboarding, step: prevStep(prev.onboarding.step) } }))} disabled={onboarding.step === 0}>
            Back
          </Button>
          {onboarding.step < ONBOARDING_STEPS.length - 1 ? (
            <Button onClick={() => setState((prev) => ({ ...prev, onboarding: { ...prev.onboarding, step: nextStep(prev.onboarding.step) } }))}>
              Next
            </Button>
          ) : (
            <Button onClick={finish} disabled={!valid}>
              Finish
            </Button>
          )}
        </div>
      </Card>
      {onboarding.completed && (
        <Card className="border-emerald-200 bg-emerald-50">
          <p className="text-sm text-emerald-700">
            Onboarding complete. Baseline saved: team size {onboarding.baseline.teamSize}, manager span{" "}
            {onboarding.baseline.managerSpan}, team age {onboarding.baseline.teamAgeMonths}mo, runway{" "}
            {onboarding.baseline.runwayMonths}mo.
          </p>
        </Card>
      )}
    </div>
  );
}
