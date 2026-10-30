export type PreflightChecklistStatus = 'DRAFT' | 'ACTIVE' | 'RETIRED'
export type PreflightChecklistItem = { key: string; prompt: string; required: boolean }
export type PreflightChecklistDefinition = {
  id: string; code: string; versionNumber: number; status: PreflightChecklistStatus
  items: PreflightChecklistItem[]; effectiveFrom: string; retiredAt: string | null
  createdBy: string; createdAt: string
}
