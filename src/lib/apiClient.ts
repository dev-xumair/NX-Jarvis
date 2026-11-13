/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ApiClientResponse<T = any> {
  ok: boolean;
  status: number;
  correlationId: string;
  data?: T;
  error?: {
    code: string;
    message: string;
    retryable?: boolean;
    requiresUserAction?: boolean;
  };
}

export interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  timeoutMs?: number;
  dedupeKey?: string;
  signal?: AbortSignal;
  correlationId?: string;
}

class NxApiClient {
  private readonly inFlight = new Map<string, Promise<ApiClientResponse<any>>>();

  generateCorrelationId(prefix = 'nx'): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
    }
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  }

  async request<T = any>(url: string, options: ApiRequestOptions = {}): Promise<ApiClientResponse<T>> {
    const method = options.method || 'GET';
    const timeoutMs = options.timeoutMs ?? 20_000;
    const correlationId = options.correlationId || this.generateCorrelationId();
    const dedupeKey = options.dedupeKey || (method === 'GET' ? `GET:${url}` : undefined);

    if (dedupeKey && this.inFlight.has(dedupeKey)) {
      return this.inFlight.get(dedupeKey)!;
    }

    const execute = async (): Promise<ApiClientResponse<T>> => {
      const controller = new AbortController();
      const timeoutHandle = setTimeout(() => controller.abort(new DOMException('Request timeout', 'TimeoutError')), timeoutMs);

      const onExternalAbort = () => controller.abort(options.signal?.reason);
      if (options.signal) {
        if (options.signal.aborted) {
          clearTimeout(timeoutHandle);
          return {
            ok: false,
            status: 0,
            correlationId,
            error: { code: 'REQUEST_CANCELLED', message: 'Request was cancelled before dispatch.', retryable: false },
          };
        }
        options.signal.addEventListener('abort', onExternalAbort, { once: true });
      }

      try {
        const headers: Record<string, string> = {
          'x-correlation-id': correlationId,
        };
        const init: RequestInit = {
          method,
          headers,
          signal: controller.signal,
        };
        if (options.body !== undefined) {
          headers['Content-Type'] = 'application/json';
          init.body = JSON.stringify(options.body);
        }

        const res = await fetch(url, init);
        let parsed: any = null;
        try {
          parsed = await res.json();
        } catch {
          parsed = null;
        }

        if (!res.ok) {
          return {
            ok: false,
            status: res.status,
            correlationId,
            data: parsed ?? undefined,
            error: parsed?.error || {
              code: `HTTP_${res.status}`,
              message: parsed?.message || `Server returned HTTP ${res.status}`,
              retryable: res.status >= 500 || res.status === 429,
            },
          };
        }

        return {
          ok: true,
          status: res.status,
          correlationId,
          data: parsed as T,
        };
      } catch (err: unknown) {
        const isAbort = err instanceof DOMException && (err.name === 'AbortError' || err.name === 'TimeoutError');
        const msg = err instanceof Error ? err.message : 'Network error';
        const isTimeout = isAbort && (err instanceof DOMException && err.name === 'TimeoutError' || msg.toLowerCase().includes('timeout'));
        return {
          ok: false,
          status: 0,
          correlationId,
          error: {
            code: isTimeout ? 'TIMEOUT' : isAbort ? 'REQUEST_CANCELLED' : 'NETWORK_ERROR',
            message: isTimeout
              ? `Request timed out after ${Math.round(timeoutMs / 1000)}s.`
              : isAbort
                ? 'Request cancelled.'
                : msg,
            retryable: !isAbort || isTimeout,
          },
        };
      } finally {
        clearTimeout(timeoutHandle);
        if (options.signal) {
          options.signal.removeEventListener('abort', onExternalAbort);
        }
      }
    };

    const promise = execute().finally(() => {
      if (dedupeKey) {
        this.inFlight.delete(dedupeKey);
      }
    });

    if (dedupeKey) {
      this.inFlight.set(dedupeKey, promise);
    }

    return promise;
  }

  get<T = any>(url: string, options?: Omit<ApiRequestOptions, 'method' | 'body'>) {
    return this.request<T>(url, { ...options, method: 'GET' });
  }

  post<T = any>(url: string, body?: unknown, options?: Omit<ApiRequestOptions, 'method' | 'body'>) {
    return this.request<T>(url, { ...options, method: 'POST', body });
  }

  patch<T = any>(url: string, body?: unknown, options?: Omit<ApiRequestOptions, 'method' | 'body'>) {
    return this.request<T>(url, { ...options, method: 'PATCH', body });
  }

  put<T = any>(url: string, body?: unknown, options?: Omit<ApiRequestOptions, 'method' | 'body'>) {
    return this.request<T>(url, { ...options, method: 'PUT', body });
  }

  delete<T = any>(url: string, options?: Omit<ApiRequestOptions, 'method' | 'body'>) {
    return this.request<T>(url, { ...options, method: 'DELETE' });
  }
}

export const apiClient = new NxApiClient();
