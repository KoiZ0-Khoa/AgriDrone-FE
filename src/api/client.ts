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

type ApiRequestOptions = Omit<RequestInit, 'body'> & { body?: unknown; token?: string; skipAuthRefresh?: boolean }

// Khi access token hết hạn (401), AuthProvider đăng ký hàm này để xin token mới bằng refresh cookie.
// Trả về access token mới, hoặc null nếu phiên không còn hợp lệ (người dùng phải đăng nhập lại).
type AccessTokenRefresher = (expiredToken: string) => Promise<string | null>
let accessTokenRefresher: AccessTokenRefresher | null = null
export function setAccessTokenRefresher(refresher: AccessTokenRefresher | null) {
  accessTokenRefresher = refresher
}

// Nhận 401 với Bearer token → refresh một lần rồi gửi lại đúng request đó với token mới.
async function fetchWithAuthRetry(token: string | undefined, skipAuthRefresh: boolean | undefined, send: (token: string | undefined) => Promise<Response>) {
  const response = await send(token)
  if (response.status !== 401 || !token || skipAuthRefresh || !accessTokenRefresher) return response
  const nextToken = await accessTokenRefresher(token).catch(() => null)
  return nextToken ? send(nextToken) : response
}

async function throwIfError(response: Response): Promise<never> {
  let problem: ProblemDetails | undefined
  let text = ''
  try {
    text = await response.text()
    const payload: unknown = JSON.parse(text)
    problem = typeof payload === 'string' ? { detail: payload } : payload as ProblemDetails
  } catch {
    // ASP.NET trả BadRequest("...") dạng text/plain khi request không gửi Accept: application/json (vd. tải file).
    // Chỉ nhận chuỗi ngắn text/plain để không hiện nguyên trang HTML lỗi của proxy.
    const plain = text.trim()
    problem = response.headers.get('Content-Type')?.includes('text/plain') && plain && plain.length <= 300 ? { detail: plain } : undefined
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

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { body, token, headers, skipAuthRefresh, ...requestOptions } = options
  const multipart = body instanceof FormData
  const response = await fetchWithAuthRetry(token, skipAuthRefresh, currentToken => fetch(`${API_BASE_URL}${path}`, {
    ...requestOptions,
    headers: {
      Accept: 'application/json',
      ...(body === undefined || multipart ? {} : { 'Content-Type': 'application/json' }),
      ...(currentToken ? { Authorization: `Bearer ${currentToken}` } : {}),
      ...headers,
    },
    body: multipart ? body : body === undefined ? undefined : JSON.stringify(body),
  }))

  if (!response.ok) return throwIfError(response)
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

// For endpoints that return a raw file stream (e.g. Results.File(...)) instead of JSON.
export async function apiRequestFile(path: string, options: { token?: string; fallbackFileName: string; signal?: AbortSignal }): Promise<{ blob: Blob; fileName: string }> {
  const response = await fetchWithAuthRetry(options.token, false, currentToken => fetch(`${API_BASE_URL}${path}`, {
    headers: { ...(currentToken ? { Authorization: `Bearer ${currentToken}` } : {}) },
    signal: options.signal,
  }))
  if (!response.ok) return throwIfError(response)
  const disposition = response.headers.get('Content-Disposition')
  const match = disposition ? /filename="?([^";]+)"?/i.exec(disposition) : null
  return { blob: await response.blob(), fileName: match?.[1] ?? options.fallbackFileName }
}

export async function checkApiHealth(): Promise<boolean> {
  const response = await fetch(`${API_BASE_URL}/health/live`, {
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) throw new ApiError(response.status, 'Backend chưa sẵn sàng.')
  return true
}
