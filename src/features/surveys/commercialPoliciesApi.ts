import { ApiError, apiRequest } from '../../api/client'

const endpoint = '/api/v3/system-admin/commercial-policies'
export const bundleStream = 'DEFAULT_BUNDLE'
export const serviceCodes = ['MAP', 'COMBO'] as const
export type ServiceCode = typeof serviceCodes[number]

type ServiceDetails = { name: string; description: string }
type Money = { currency: 'VND' }
type ServicePrice = Money & { pricePerPole: number }
type Deposit = Money & { amount: number }
type Claim = { calendarWindowDays: number; timeZoneId: string; excludeNoticeDate: boolean }
type Cancellation = {
  refundableBeforeCapture: boolean
  retainDepositAfterCapture: boolean
  allowedFreeNoShowReschedules: number
  operationalPostponementRefundable: boolean
  serviceFailureRefundable: boolean
}
type Gates = { publicIntakeEnabled: boolean; captureEnabled: boolean; releaseEnabled: boolean }
type Audit = { reasonCode: string; evidenceReference: string | null }

export type CommercialService = ServiceDetails & { id: string; code: string; status: 'ACTIVE' | 'EXPERIMENTAL' | 'RETIRED' }
export type Version = { id: string; versionNumber: number; effectiveFrom: string; effectiveTo: string | null }
export type Revision = Version & ServiceDetails & { surveyServiceId: string; mapsPoles: boolean; screensDisease: boolean }
export type Price = Version & ServicePrice & { surveyServiceId: string }
export type DepositPolicy = Version & Deposit
export type ClaimPolicy = Version & Claim
export type CancellationPolicy = Version & Cancellation
export type Bundle = Version & {
  serviceRevisionIds: string[]
  surveyDepositPolicyId: string
  claimPolicyId: string
  cancellationPolicyId: string
}
type Activation = Gates & { activeBusinessPolicyVersionId: string; lastDecisionId: string }

type WriteRequests = {
  services: ServiceDetails & { code: ServiceCode; activateImmediately: boolean }
  revisions: ServiceDetails & Audit & { surveyServiceId: string; mapsPoles: boolean; screensDisease: boolean; expectedLatestVersionNumber: number }
  prices: ServicePrice & Audit & { surveyServiceId: string; expectedLatestPriceVersion: number }
  'deposit-policies': Deposit & Audit & { expectedLatestVersion: number }
  'claim-policies': Claim & Audit & { expectedLatestVersion: number }
  'cancellation-policies': Cancellation & Audit & { expectedLatestVersion: number }
  'bundle-versions': Audit & {
    streamKey: string
    serviceRevisionIds: string[]
    depositPolicyId: string
    claimPolicyId: string
    cancellationPolicyId: string
    pricingCurrency: 'VND'
    expectedLatestVersion: number
  }
  activations: Gates & {
    targetPolicyVersionId: string
    expectedLastDecisionId: string
    decisionReasonCode: string
    decisionEvidenceReference: string | null
  }
}

export function writeCommercialPolicy<K extends keyof WriteRequests>(resource: K, token: string, body: WriteRequests[K]) {
  return apiRequest<unknown>(`${endpoint}/${resource}`, { method: 'POST', token, body })
}

async function list<T>(resource: Exclude<keyof WriteRequests, 'activations'>, token: string, signal: AbortSignal, filters?: Record<string, string>) {
  const all: T[] = []
  const limit = 100
  for (let offset = 0; ; offset += limit) {
    const params = new URLSearchParams({ ...filters, offset: String(offset), limit: String(limit) })
    const page = await apiRequest<T[]>(`${endpoint}/${resource}?${params}`, { token, signal, cache: 'no-store' })
    all.push(...page)
    if (page.length < limit) return all
  }
}

export function getCommercialServicePricing(token: string, signal: AbortSignal) {
  return Promise.all([
    list<CommercialService>('services', token, signal),
    list<Price>('prices', token, signal),
  ])
}

async function getActivation(token: string, signal: AbortSignal) {
  try {
    return await apiRequest<Activation>(`${endpoint}/activations`, { token, signal, cache: 'no-store' })
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null
    throw error
  }
}

export async function getCommercialPolicies(token: string, signal: AbortSignal) {
  const [[services, prices], revisions, deposits, claims, cancellations, bundles, activation] = await Promise.all([
    getCommercialServicePricing(token, signal),
    list<Revision>('revisions', token, signal),
    list<DepositPolicy>('deposit-policies', token, signal),
    list<ClaimPolicy>('claim-policies', token, signal),
    list<CancellationPolicy>('cancellation-policies', token, signal),
    list<Bundle>('bundle-versions', token, signal, { streamKey: bundleStream }),
    getActivation(token, signal),
  ])
  return { services, revisions, prices, deposits, claims, cancellations, bundles, activation }
}

export type CommercialPolicies = Awaited<ReturnType<typeof getCommercialPolicies>>
