// Projector: executionBoard — heterogeneous: holds both task rows
// (entityId = taskId) and sprint-velocity rows (entityId = sprintId) in the
// same generic projection_state table, disambiguated by `kind`.
// Consumes: execution.task_created, execution.task_completed,
//           execution.sprint_velocity_recorded.
import type { Projector } from "../engine";

export type ExecutionBoardState =
  | { kind: "unknown" }
  | {
      kind: "task";
      taskId: string;
      title: string;
      assigneeId: string;
      dueDate: string;
      status: "open" | "done";
      completedAt: string | null;
    }
  | { kind: "sprint"; sprintId: string; teamId: string; velocityPoints: number };

const initial: ExecutionBoardState = { kind: "unknown" };

export const executionBoardProjector: Projector<ExecutionBoardState> = {
  name: "executionBoard",
  interestedIn: ["execution.task_created", "execution.task_completed", "execution.sprint_velocity_recorded"],
  initial,
  apply(state, e) {
    switch (e.type) {
      case "execution.task_created": {
        const p = e.payload as { taskId: string; title: string; assigneeId: string; dueDate: string };
        return {
          kind: "task",
          taskId: p.taskId,
          title: p.title,
          assigneeId: p.assigneeId,
          dueDate: p.dueDate,
          status: "open",
          completedAt: null,
        };
      }
      case "execution.task_completed": {
        if (state.kind !== "task") return state;
        const p = e.payload as { completedAt: string };
        return { ...state, status: "done", completedAt: p.completedAt };
      }
      case "execution.sprint_velocity_recorded": {
        const p = e.payload as { teamId: string; sprintId: string; velocityPoints: number };
        return { kind: "sprint", sprintId: p.sprintId, teamId: p.teamId, velocityPoints: p.velocityPoints };
      }
      default:
        return state;
    }
  },
};
