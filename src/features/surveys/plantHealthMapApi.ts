import { apiRequest } from '../../api/client'
import type { FarmPlantHealthMapResult } from './plantHealthMapTypes'

// [AllowAnonymous] on BE, nhưng vẫn gửi token kèm theo cho an toàn (xem nhiệm vụ 17, mission-flight-plan-2026-10-30.md).
export const getFarmPlantHealthMap = (token: string, farmId: string, tenantId: string, signal?: AbortSignal) =>
  apiRequest<FarmPlantHealthMapResult>(`/api/farms/${encodeURIComponent(farmId)}/plant-health-map?${new URLSearchParams({ tenantId })}`, { token, signal })
