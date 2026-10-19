import type { Viewer } from "../../domain/types";
import { successionRepository } from "../../platform/db/successionRepository";
import { peopleRepository } from "../../platform/db/peopleRepository";
import { accessAuditRepository } from "../../platform/db/accessAuditRepository";
import { buildRoleBoard } from "../../domain/people/succession";
import { computeFlightRisk } from "../../domain/people/flightRisk";
import { buildFlightRiskInputs } from "./signals";

const BOARD_ROLES: Viewer["role"][] = ["hr", "exec", "manager"];

export async function getSuccessionBoards(viewer: Viewer) {
  const allowed = BOARD_ROLES.includes(viewer.role);
  await accessAuditRepository.log({
    viewer,
    subjectId: null,
    resource: "succession.board.list",
    fieldsRedacted: allowed ? [] : ["all"],
    allowed,
    reason: allowed ? "Manager/HR/exec may view succession boards." : "Succession boards require manager, HR, or exec access.",
  });
  if (!allowed) return { ok: false as const, error: "forbidden" };

  const roles = await successionRepository.listRoles();
  const boards = await Promise.all(
    roles.map(async (role) => {
      const incumbent = role.incumbentId ? await peopleRepository.getById(role.incumbentId) : null;
      const incumbentFlightRisk = incumbent
        ? computeFlightRisk(await buildFlightRiskInputs(incumbent)).value
        : null;
      const inputs = await successionRepository.buildCoverageInputs(role.id, incumbentFlightRisk);
      return inputs ? buildRoleBoard(inputs) : null;
    }),
  );

  return { ok: true as const, boards: boards.filter((b) => b !== null) };
}

export async function getSuccessionBoard(viewer: Viewer, roleId: number) {
  const allowed = BOARD_ROLES.includes(viewer.role);
  await accessAuditRepository.log({
    viewer,
    subjectId: null,
    resource: "succession.board.get",
    fieldsRedacted: allowed ? [] : ["all"],
    allowed,
    reason: allowed ? "Manager/HR/exec may view this succession board." : "Succession boards require manager, HR, or exec access.",
  });
  if (!allowed) return { ok: false as const, error: "forbidden" };

  const role = await successionRepository.getRoleById(roleId);
  if (!role) return { ok: false as const, error: "not_found" };

  const incumbent = role.incumbentId ? await peopleRepository.getById(role.incumbentId) : null;
  const incumbentFlightRisk = incumbent ? computeFlightRisk(await buildFlightRiskInputs(incumbent)).value : null;
  const inputs = await successionRepository.buildCoverageInputs(roleId, incumbentFlightRisk);
  if (!inputs) return { ok: false as const, error: "not_found" };

  return { ok: true as const, board: buildRoleBoard(inputs) };
}
