import type { ManaResponse } from "./types.js";

interface VerifyResponse {
  token: string;
  user: {
    _id: string;
    name: string;
    surname: string;
    email: string;
    level: number;
  };
}

export class ManaClient {
  private baseUrl: string;
  private apiKey: string;
  private token: string | null = null;
  private tokenExpiry: number = 0;

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.apiKey = apiKey;
  }

  private async authenticate(): Promise<void> {
    if (this.token && Date.now() < this.tokenExpiry) return;

    const url = `${this.baseUrl}/api-key/verify`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey: this.apiKey }),
    });

    const data = (await response.json()) as ManaResponse<VerifyResponse>;
    if (!data.success || !data.obj?.token) {
      throw new Error(`Authentication failed: ${data.data || "Invalid API key"}`);
    }

    this.token = data.obj.token;
    this.tokenExpiry = Date.now() + 23 * 60 * 60 * 1000;
  }

  private async request<T = unknown>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<ManaResponse<T>> {
    await this.authenticate();

    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      "Content-Type": "application/json",
    };

    const options: RequestInit = { method, headers };

    if (body && (method === "POST" || method === "PUT")) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    const data = (await response.json()) as ManaResponse<T>;

    if (response.status === 401 && this.token) {
      this.token = null;
      this.tokenExpiry = 0;
      return this.request<T>(method, path, body);
    }

    return data;
  }

  async get<T = unknown>(path: string): Promise<ManaResponse<T>> {
    return this.request<T>("GET", path);
  }

  async post<T = unknown>(path: string, body?: unknown): Promise<ManaResponse<T>> {
    return this.request<T>("POST", path, body);
  }

  async put<T = unknown>(path: string, body?: unknown): Promise<ManaResponse<T>> {
    return this.request<T>("PUT", path, body);
  }

  async del<T = unknown>(path: string): Promise<ManaResponse<T>> {
    return this.request<T>("DELETE", path);
  }
}
