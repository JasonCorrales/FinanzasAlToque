import { describe, expect, it, vi } from "vitest";

import {
  createDashboardController,
  formatLocalizedAmount,
  type DashboardResponse,
  type DashboardView,
  type DashboardBrowser
} from "../../web/dashboard.js";

const period = { from: "2025-02-01", to: "2025-02-28", paymentMethod: "" };
const payload: DashboardResponse = {
  items: [
    {
      id: "transaction-2",
      amount: "14.90",
      currency: "USD",
      concept: "Software de trabajo",
      paymentMethod: "Tarjeta",
      createdAt: "2025-02-27T11:03:00.000Z"
    },
    {
      id: "transaction-1",
      amount: "24680.00",
      currency: "ARS",
      concept: "Supermercado",
      paymentMethod: "Débito",
      createdAt: "2025-02-26T19:42:00.000Z"
    }
  ],
  totalCount: 2,
  totalsByCurrency: [{ currency: "USD", amount: "14.90" }, { currency: "ARS", amount: "24680.00" }],
  nextCursor: "next-page"
};

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function browser(fetch = vi.fn(async () => response(payload))): DashboardBrowser {
  return {
    fetch,
    sessionStorage: { getItem: (key) => key === "finanzas.access-token" ? "stored-token" : null }
  };
}

function view(): DashboardView & { renders: DashboardResponse[]; states: string[]; messages: string[] } {
  const renders: DashboardResponse[] = [];
  const states: string[] = [];
  const messages: string[] = [];
  return {
    renders,
    states,
    messages,
    render: (data) => renders.push(data),
    setLoading: (loading) => states.push(loading ? "loading" : "ready"),
    showEmpty: () => states.push("empty"),
    showNoResults: () => states.push("no-results"),
    showError: (message) => messages.push(message),
    showSessionExpired: () => states.push("session-expired")
  };
}

describe("transaction dashboard", () => {
  it("requires a valid date range, translates inclusive dates to an exclusive ISO bound, sends an optional exact payment method, and preserves data on rejection", async () => {
    const fetch = vi.fn(async () => response(payload));
    const ui = view();
    const dashboard = createDashboardController(browser(fetch), ui);

    await dashboard.load({ ...period, paymentMethod: "Tarjeta de débito" });
    await dashboard.load({ from: "2025-02-28", to: "2025-02-28", paymentMethod: "" });
    await dashboard.load({ from: "2025-02-28", to: "2025-02-01", paymentMethod: "" });

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenCalledWith(
      "/v1/transactions?from=2025-02-01T00%3A00%3A00.000Z&to=2025-03-01T00%3A00%3A00.000Z&paymentMethod=Tarjeta+de+d%C3%A9bito",
      { headers: { Authorization: "Bearer stored-token" } }
    );
    expect(fetch).toHaveBeenLastCalledWith(
      "/v1/transactions?from=2025-02-28T00%3A00%3A00.000Z&to=2025-03-01T00%3A00%3A00.000Z",
      { headers: { Authorization: "Bearer stored-token" } }
    );
    expect(ui.renders).toHaveLength(2);
    expect(ui.messages).toEqual(["Elegí un período válido: la fecha de inicio no puede ser posterior a la fecha de fin."]);
  });

  it("uses the same-origin endpoint with one stored-token authorization header, strictly validates its public response, and maps 401 to an expired session", async () => {
    const unauthorized = vi.fn(async () => response({ message: "provider diagnostic" }, 401));
    const expiredUi = view();
    await createDashboardController(browser(unauthorized), expiredUi).load(period);
    expect(unauthorized).toHaveBeenCalledWith(
      "/v1/transactions?from=2025-02-01T00%3A00%3A00.000Z&to=2025-03-01T00%3A00%3A00.000Z",
      { headers: { Authorization: "Bearer stored-token" } }
    );
    expect(expiredUi.states).toContain("session-expired");
    expect(expiredUi.messages).toEqual([]);

    const malformedUi = view();
    await createDashboardController(browser(vi.fn(async () => response({ ...payload, totalCount: "2" }))), malformedUi).load(period);
    expect(malformedUi.messages).toEqual(["No pudimos obtener los movimientos. Intentá nuevamente."]);
    expect(malformedUi.states).toEqual(["loading", "ready"]);
  });

  it("renders separate currency totals, count, newest-first registered movements, truthful registered-time data, and decimal-safe localized amounts", async () => {
    const ui = view();
    await createDashboardController(browser(), ui).load(period);

    expect(ui.renders[0]?.totalsByCurrency).toEqual(payload.totalsByCurrency);
    expect(ui.renders[0]?.totalCount).toBe(2);
    expect(ui.renders[0]?.items.map((item) => item.id)).toEqual(["transaction-2", "transaction-1"]);
    expect(formatLocalizedAmount("24680.00", "ARS")).toBe("ARS 24.680,00");
    expect(formatLocalizedAmount("14.90", "USD")).toBe("USD 14,90");
  });

  it("loads more only on explicit action, retains filters, appends without duplicate rows, exposes loading, and hides the action when the cursor ends", async () => {
    const finalPage: DashboardResponse = { ...payload, items: [{ ...payload.items[1]!, id: "transaction-3", concept: "Internet" }], nextCursor: null };
    const fetch = vi.fn().mockResolvedValueOnce(response(payload)).mockResolvedValueOnce(response(finalPage));
    const ui = view();
    const dashboard = createDashboardController(browser(fetch), ui);

    await dashboard.load(period);
    await dashboard.loadMore();

    expect(fetch).toHaveBeenLastCalledWith(
      "/v1/transactions?from=2025-02-01T00%3A00%3A00.000Z&to=2025-03-01T00%3A00%3A00.000Z&cursor=next-page",
      { headers: { Authorization: "Bearer stored-token" } }
    );
    expect(ui.states).toEqual(["loading", "ready", "loading", "ready"]);
    expect(ui.renders[1]?.items.map((item) => item.id)).toEqual(["transaction-2", "transaction-1", "transaction-3"]);
    expect(dashboard.canLoadMore()).toBe(false);
  });

  it("reports loading, empty, no-results, error, and session-expired feedback through its accessible view contract", async () => {
    const empty: DashboardResponse = { items: [], totalCount: 0, totalsByCurrency: [], nextCursor: null };
    const emptyUi = view();
    await createDashboardController(browser(vi.fn(async () => response(empty))), emptyUi).load(period);
    expect(emptyUi.states).toEqual(["loading", "empty", "ready"]);

    const noResultsUi = view();
    await createDashboardController(browser(vi.fn(async () => response({ ...empty, totalCount: 4 }))), noResultsUi).load(period);
    expect(noResultsUi.states).toEqual(["loading", "no-results", "ready"]);
  });
});
