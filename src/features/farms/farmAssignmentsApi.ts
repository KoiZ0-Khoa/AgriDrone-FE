import { ApiError, apiRequest } from '../../api/client'
import type { AssignFarmMemberRequest, FarmAssignment, PagedResult, TenantUser } from './types'

export async function getTenantAdmins(token: string, signal?: AbortSignal) {
  const admins: TenantUser[] = []
  let pageNumber = 1
  let hasNextPage = true

  while (hasNextPage) {
    const page = await apiRequest<PagedResult<TenantUser>>(
      `/tenants/current/users?pageNumber=${pageNumber}&pageSize=100`,
      { token, signal },
    )
    admins.push(...page.items.filter((user) => user.role === 1 && user.status === 0))
    hasNextPage = page.hasNextPage
    pageNumber++
  }

  return admins
}

function assignmentPath(farmId: string, userId: string) {
  return `/api/farms/${encodeURIComponent(farmId)}/members/${encodeURIComponent(userId)}/assignment`
}

export async function getFarmAssignment(token: string, farmId: string, userId: string, signal?: AbortSignal) {
  try {
    return await apiRequest<FarmAssignment>(assignmentPath(farmId, userId), { token, signal })
  } catch (error) {
    if (error instanceof ApiError && error.status === 404 && error.code === 'FarmMembership.NotFound') {
      return null
    }
    throw error
  }
}

export function assignFarmMember(token: string, farmId: string, userId: string, request: AssignFarmMemberRequest) {
  return apiRequest<FarmAssignment>(assignmentPath(farmId, userId), {
    method: 'PUT',
    token,
    body: request,
  })
}
