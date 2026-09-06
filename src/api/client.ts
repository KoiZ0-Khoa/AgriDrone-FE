const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5080').replace(/\/$/, '')

type ProblemDetails = {
  title?: string
  detail?: string
  errorCode?: string
  traceId?: string
  errors?: Record<string, string[]>
}

export class ApiError extends Error {
  readonly status: number
  readonly code?: string
  readonly traceId?: string
  readonly validationErrors?: Record<string, string[]>

  constructor(
    status: number,
    message: string,
    code?: string,
    traceId?: string,
    validationErrors?: Record<string, string[]>,
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.traceId = traceId
    this.validationErrors = validationErrors
  }
}

type ApiRequestOptions = Omit<RequestInit, 'body'> & { body?: unknown; token?: string }

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { body, token, headers, ...requestOptions } = options
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...requestOptions,
    headers: {
      Accept: 'application/json',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  if (!response.ok) {
    let problem: ProblemDetails | undefined
    try {
      problem = (await response.json()) as ProblemDetails
    } catch {
      problem = undefined
    }

    const firstValidationMessage = problem?.errors
      ? Object.values(problem.errors).flat()[0]
      : undefined
    throw new ApiError(
      response.status,
      firstValidationMessage ?? problem?.detail ?? problem?.title ?? 'Không thể xử lý yêu cầu.',
      problem?.errorCode,
      problem?.traceId,
      problem?.errors,
    )
  }

  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

export async function checkApiHealth(): Promise<boolean> {
  const response = await fetch(`${API_BASE_URL}/health/live`, {
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) throw new ApiError(response.status, 'Backend chưa sẵn sàng.')
  return true
}
