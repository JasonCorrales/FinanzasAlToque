export interface TransactionItem {
  id: string;
  amount: string;
  currency: string;
  concept: string;
  paymentMethod: string;
  createdAt: string;
}

export interface CurrencyTotal {
  currency: string;
  amount: string;
}

export interface DashboardResponse {
  items: TransactionItem[];
  totalCount: number;
  totalsByCurrency: CurrencyTotal[];
  nextCursor: string | null;
}

export interface DashboardFilters {
  from: string;
  to: string;
  paymentMethod: string;
}

export interface DashboardBrowser {
  fetch: typeof fetch;
  sessionStorage: Pick<Storage, "getItem">;
}

export interface DashboardView {
  render(data: DashboardResponse): void;
  setLoading(loading: boolean): void;
  showEmpty(): void;
  showNoResults(): void;
  showError(message: string): void;
  showSessionExpired(): void;
}

const accessTokenKey = "finanzas.access-token";
const genericError = "No pudimos obtener los movimientos. Intentá nuevamente.";
const invalidPeriodError = "Elegí un período válido: la fecha de inicio no puede ser posterior a la fecha de fin.";
const decimalPattern = /^-?\d+\.\d{2}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}

function isDecimal(value: unknown): value is string {
  return typeof value === "string" && decimalPattern.test(value);
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isTransaction(value: unknown): value is TransactionItem {
  if (!isRecord(value) || !hasOnlyKeys(value, ["id", "amount", "currency", "concept", "paymentMethod", "createdAt"])) return false;
  return typeof value.id === "string"
    && isDecimal(value.amount)
    && typeof value.currency === "string"
    && typeof value.concept === "string"
    && typeof value.paymentMethod === "string"
    && isIsoDate(value.createdAt);
}

function isCurrencyTotal(value: unknown): value is CurrencyTotal {
  if (!isRecord(value) || !hasOnlyKeys(value, ["currency", "amount"])) return false;
  return typeof value.currency === "string" && isDecimal(value.amount);
}

export function isDashboardResponse(value: unknown): value is DashboardResponse {
  if (!isRecord(value) || !hasOnlyKeys(value, ["items", "totalCount", "totalsByCurrency", "nextCursor"])) return false;
  return Array.isArray(value.items)
    && value.items.every(isTransaction)
    && typeof value.totalCount === "number"
    && Number.isSafeInteger(value.totalCount)
    && value.totalCount >= 0
    && Array.isArray(value.totalsByCurrency)
    && value.totalsByCurrency.every(isCurrencyTotal)
    && (typeof value.nextCursor === "string" || value.nextCursor === null);
}

function parseDateInput(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value ? null : date;
}

function queryFor(filters: DashboardFilters, cursor?: string): string | null {
  const from = parseDateInput(filters.from);
  const inclusiveTo = parseDateInput(filters.to);
  if (!from || !inclusiveTo || from > inclusiveTo) return null;

  const exclusiveTo = new Date(inclusiveTo);
  exclusiveTo.setUTCDate(exclusiveTo.getUTCDate() + 1);
  const query = new URLSearchParams({ from: from.toISOString(), to: exclusiveTo.toISOString() });
  if (filters.paymentMethod.trim() !== "") query.set("paymentMethod", filters.paymentMethod);
  if (cursor) query.set("cursor", cursor);
  return query.toString();
}

function newestFirst(items: TransactionItem[]): TransactionItem[] {
  return [...items].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
}

function responseWith(items: TransactionItem[], response: DashboardResponse): DashboardResponse {
  return { ...response, items: newestFirst(items) };
}

export function createDashboardController(browser: DashboardBrowser, view: DashboardView) {
  let data: DashboardResponse | null = null;
  let filters: DashboardFilters | null = null;

  async function request(query: string): Promise<DashboardResponse | null> {
    const token = browser.sessionStorage.getItem(accessTokenKey);
    if (!token) {
      view.showSessionExpired();
      return null;
    }

    try {
      const response = await browser.fetch(`/v1/transactions?${query}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.status === 401) {
        view.showSessionExpired();
        return null;
      }
      if (!response.ok) throw new Error("Transaction request failed");
      const payload: unknown = await response.json();
      if (!isDashboardResponse(payload)) throw new Error("Invalid transaction response");
      return responseWith(payload.items, payload);
    } catch {
      view.showError(genericError);
      return null;
    }
  }

  return {
    async load(nextFilters: DashboardFilters) {
      const query = queryFor(nextFilters);
      if (!query) {
        view.showError(invalidPeriodError);
        return;
      }
      view.setLoading(true);
      try {
        const result = await request(query);
        if (!result) return;
        filters = { ...nextFilters };
        data = result;
        view.render(data);
        if (data.items.length === 0) {
          if (data.totalCount === 0) view.showEmpty();
          else view.showNoResults();
        }
      } finally {
        view.setLoading(false);
      }
    },

    async loadMore() {
      if (!data?.nextCursor || !filters) return;
      const query = queryFor(filters, data.nextCursor);
      if (!query) return;
      view.setLoading(true);
      try {
        const result = await request(query);
        if (!result) return;
        const knownIds = new Set(data.items.map((item) => item.id));
        const appended = result.items.filter((item) => !knownIds.has(item.id));
        data = responseWith([...data.items, ...appended], { ...result, nextCursor: result.nextCursor });
        view.render(data);
      } finally {
        view.setLoading(false);
      }
    },

    canLoadMore() {
      return data?.nextCursor !== null && data?.nextCursor !== undefined;
    }
  };
}

export function formatLocalizedAmount(amount: string, currency: string): string {
  if (!decimalPattern.test(amount)) return `${currency} —`;
  const negative = amount.startsWith("-");
  const [integerPart, fractionPart = ""] = (negative ? amount.slice(1) : amount).split(".");
  const grouped = integerPart!.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${negative ? "-" : ""}${currency} ${grouped},${fractionPart.padEnd(2, "0")}`;
}
