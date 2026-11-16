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

  // [FIX: ISSUE-01/02/03] shared safe JSON parser - อ่าน body เป็น text ก่อน แล้วตรวจ
  // Content-Type/รูปร่างของ body ก่อน parse JSON ก่อนหน้านี้เรียก `response.json()` ตรงๆ
  // ทำให้ body ที่เป็น HTML (เช่น error page) ทำให้เกิด `Unexpected token '<'` และ
  // empty body ทำให้เกิด `Unexpected end of JSON input` โดยที่ caller ไม่มีโอกาสรู้
  // status/ข้อความผิดพลาดที่แท้จริง - DRY: ใช้ร่วมกันระหว่าง authenticate() และ request()
  // หมายเหตุ: throw เฉพาะตอนที่ body ไม่ใช่ JSON เท่านั้น - กรณีที่ backend คืน JSON
  // `{ success: false, ... }` (แม้ HTTP non-ok) ยังคืนกลับให้ caller เพื่อตรวจ `success`
  // ได้ (สอดคล้องกับการแก้ ISSUE-04) - 2026-07-17
  // [FIX: ISSUE-08] เพิ่ม guard ระดับบนสุด - ถ้า text ว่างเปล่า ให้ throw ทันที ไม่สน Content-Type
  // (ก่อนหน้านี้ heuristic `ct.includes("application/json")` ทำให้ empty body ที่มาพร้อม
  // Content-Type ถูกหลอกว่าเป็น JSON → JSON.parse("") throw `Unexpected end of JSON input`
  // เหมือนเดิม - regression ของ ISSUE-02/03 ที่พบจาก UAT runtime probe) - 2026-07-17
  private async safeJson<T>(response: Response, context: string): Promise<T> {
    const text = await response.text();
    if (!text.trim()) {
      throw new Error(
        `Mana API ${context} returned non-JSON response: HTTP ${response.status}${
          response.statusText ? ` ${response.statusText}` : ""
        } - empty body`
      );
    }
    const ct = response.headers.get("content-type") || "";
    const looksJson =
      ct.toLowerCase().includes("application/json") || /^\s*[{[]/.test(text);
    if (!looksJson) {
      const snippet = text.length > 200 ? `${text.slice(0, 200)}...` : text;
      throw new Error(
        `Mana API ${context} returned non-JSON response: HTTP ${response.status}${
          response.statusText ? ` ${response.statusText}` : ""
        }` + (snippet ? ` - ${snippet}` : " - empty body")
      );
    }
    return JSON.parse(text) as T;
  }

  // [PERF/RESILIENCE] timeout ทุก request 30s - กัน tool ค้างตายเมื่อ backend
  // hang (เดิม fetch รอไม่มีที่สิ้นสุด ทำให้ AI client รอ tool call นานเกินจำเป็น)
  private static readonly REQUEST_TIMEOUT_MS = 30_000;

  private async authenticate(): Promise<void> {
    if (this.token && Date.now() < this.tokenExpiry) return;

    const url = `${this.baseUrl}/api-key/verify`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey: this.apiKey }),
      signal: AbortSignal.timeout(ManaClient.REQUEST_TIMEOUT_MS),
    });

    const data = await this.safeJson<ManaResponse<VerifyResponse>>(response, "POST /api-key/verify");
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

    const options: RequestInit = {
      method,
      headers,
      signal: AbortSignal.timeout(ManaClient.REQUEST_TIMEOUT_MS),
    };

    if (body && (method === "POST" || method === "PUT")) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    // [FIX: ISSUE-01/02/03] ใช้ safeJson() ที่แยกออกมา (DRY กับ authenticate) - เห็นรายละเอียด
    // ใน comment ของ safeJson() - 2026-07-17
    const data = await this.safeJson<ManaResponse<T>>(response, `${method} ${path}`);

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
