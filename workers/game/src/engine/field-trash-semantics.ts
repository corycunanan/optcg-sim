/** Field-trash replacement rollout is independent of the persisted envelope and
 * cost mode. Deployed9 means native trash; scheduling10 records its prior mode.
 */
export function fieldTrashSemanticsVersion(
  state: { schemaVersion?: unknown; fieldTrashSemanticsVersion?: unknown },
  version = state.schemaVersion ?? 8,
): 8 | 9 {
  if (version === 9) return 9;
  if (version !== 10) return 8;
  if (state.fieldTrashSemanticsVersion === 8 || state.fieldTrashSemanticsVersion === 9) {
    return state.fieldTrashSemanticsVersion;
  }
  throw new Error("native10 requires explicit fieldTrashSemanticsVersion 8 or 9");
}

export function validateFieldTrashCapability(
  state: { fieldTrashSemanticsVersion?: unknown },
  version: number,
  fail: (reason: string) => never,
): void {
  if (version < 10 && "fieldTrashSemanticsVersion" in state) {
    fail("fieldTrashSemanticsVersion requires schemaVersion 10");
  }
  if (version === 10 && state.fieldTrashSemanticsVersion !== 8 && state.fieldTrashSemanticsVersion !== 9) {
    fail("native10 requires explicit fieldTrashSemanticsVersion 8 or 9");
  }
}

/** COST transaction/expected roots have no envelope of their own. Traverse with
 * the enclosing capability instead of manufacturing a native9 wrapper.
 */
export function validateFieldTrashDiscriminators(
  raw: unknown,
  mode: 8 | 9,
  fail: (reason: string) => never,
  path = "",
): void {
  if (mode === 9 || raw === null || typeof raw !== "object") return;
  if (Array.isArray(raw)) {
    raw.forEach((child, i) => validateFieldTrashDiscriminators(child, mode, fail, `${path}[${i}]`));
    return;
  }
  const object = raw as Record<string, unknown>;
  if (object.actionKind === "TRASH_CARD") {
    fail(`${path}.actionKind TRASH_CARD requires schemaVersion 9 or native10 fieldTrashSemanticsVersion 9`);
  }
  for (const [key, child] of Object.entries(object)) {
    validateFieldTrashDiscriminators(child, mode, fail, path ? `${path}.${key}` : key);
  }
}
