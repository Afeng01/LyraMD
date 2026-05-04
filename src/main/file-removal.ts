export interface TrashVerificationDeps {
  trashItem: (filePath: string) => Promise<void>
  exists: (filePath: string) => boolean
}

export async function moveFileToTrashAndVerify(
  filePath: string,
  deps: TrashVerificationDeps,
): Promise<boolean> {
  try {
    await deps.trashItem(filePath)
  } catch {
    return false
  }

  return !deps.exists(filePath)
}
