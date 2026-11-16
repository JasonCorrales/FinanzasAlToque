import { createAuthController } from "./auth.js";
import { createDashboardController, formatLocalizedAmount } from "./dashboard.js";
const appRoot = document.querySelector("#app");
if (!appRoot)
    throw new Error("Missing application root");
const root = appRoot;
function element(tag, text) {
    const node = document.createElement(tag);
    if (text)
        node.textContent = text;
    return node;
}
function renderLogin(message) {
    root.setAttribute("aria-busy", "false");
    root.replaceChildren();
    const page = element("main");
    page.className = "auth-page";
    const card = element("section");
    card.className = "auth-card";
    card.setAttribute("aria-labelledby", "login-title");
    const wordmark = element("p", "Finanzas al Toque");
    wordmark.className = "wordmark";
    const title = element("h1", "Accedé a tus gastos");
    title.id = "login-title";
    const introduction = element("p", "Ingresá con tu correo y contraseña para consultar tu información.");
    introduction.className = "muted";
    const form = element("form");
    const emailLabel = element("label", "Correo electrónico");
    const email = element("input");
    email.type = "email";
    email.name = "email";
    email.autocomplete = "email";
    email.required = true;
    emailLabel.htmlFor = "email";
    email.id = "email";
    const passwordLabel = element("label", "Contraseña");
    const password = element("input");
    password.type = "password";
    password.name = "password";
    password.autocomplete = "current-password";
    password.required = true;
    passwordLabel.htmlFor = "password";
    password.id = "password";
    const submit = element("button", "Ingresar");
    submit.type = "submit";
    const status = element("p", message);
    status.className = "status";
    status.setAttribute("role", message ? "alert" : "status");
    status.setAttribute("aria-live", "polite");
    form.append(emailLabel, email, passwordLabel, password, submit, status);
    card.append(wordmark, title, introduction, form);
    page.append(card);
    root.append(page);
    form.addEventListener("submit", (event) => {
        event.preventDefault();
        void auth.signIn(email.value, password.value).catch(() => undefined);
    });
    return {
        showLogin: renderLogin,
        showAuthenticated: renderAuthenticated,
        showLoading() {
            root.setAttribute("aria-busy", "true");
            email.disabled = true;
            password.disabled = true;
            submit.disabled = true;
            submit.textContent = "Ingresando…";
            status.setAttribute("role", "status");
            status.textContent = "Estamos verificando tus datos.";
        },
        showError(error) {
            root.setAttribute("aria-busy", "false");
            email.disabled = false;
            password.disabled = false;
            submit.disabled = false;
            submit.textContent = "Ingresar";
            status.textContent = error;
            status.setAttribute("role", "alert");
            email.focus();
        }
    };
}
function defaultPeriod() {
    const today = new Date();
    const to = today.toISOString().slice(0, 10);
    const fromDate = new Date(today);
    fromDate.setUTCDate(fromDate.getUTCDate() - 29);
    return { from: fromDate.toISOString().slice(0, 10), to };
}
function renderAuthenticated() {
    root.setAttribute("aria-busy", "false");
    root.replaceChildren();
    const page = element("main");
    page.className = "shell dashboard";
    const header = element("header");
    const wordmark = element("p", "Finanzas al Toque");
    wordmark.className = "wordmark";
    const signOut = element("button", "Cerrar sesión");
    signOut.type = "button";
    signOut.addEventListener("click", () => auth.signOut());
    header.append(wordmark, signOut);
    const intro = element("section");
    intro.className = "dashboard-intro";
    const introCopy = element("div");
    const eyebrow = element("p", "Resumen de gastos");
    eyebrow.className = "eyebrow";
    const title = element("h1", "Un corte claro de lo registrado.");
    const description = element("p", "Consultá los totales separados por moneda y bajá al detalle de cada movimiento registrado.");
    description.className = "muted";
    introCopy.append(eyebrow, title, description);
    intro.append(introCopy);
    const form = element("form");
    form.className = "dashboard-filters";
    form.setAttribute("aria-label", "Filtros del listado");
    const filtersTitle = element("h2", "Detalle del período");
    const fromLabel = element("label", "Desde");
    const from = element("input");
    from.type = "date";
    from.required = true;
    from.id = "transactions-from";
    fromLabel.htmlFor = from.id;
    const toLabel = element("label", "Hasta");
    const to = element("input");
    to.type = "date";
    to.required = true;
    to.id = "transactions-to";
    toLabel.htmlFor = to.id;
    const paymentLabel = element("label", "Método de pago exacto (opcional)");
    const paymentMethod = element("input");
    paymentMethod.type = "text";
    paymentMethod.id = "transactions-payment-method";
    paymentMethod.autocomplete = "off";
    paymentLabel.htmlFor = paymentMethod.id;
    const apply = element("button", "Consultar período");
    apply.type = "submit";
    const initialPeriod = defaultPeriod();
    from.value = initialPeriod.from;
    to.value = initialPeriod.to;
    fromLabel.append(from);
    toLabel.append(to);
    paymentLabel.append(paymentMethod);
    form.append(filtersTitle, fromLabel, toLabel, paymentLabel, apply);
    const totals = element("section");
    totals.className = "dashboard-totals";
    totals.setAttribute("aria-label", "Totales del período seleccionado");
    const heading = element("div");
    heading.className = "section-head";
    const movementTitle = element("h2", "Movimientos más recientes");
    const count = element("p");
    count.className = "count";
    heading.append(movementTitle, count);
    const status = element("p");
    status.className = "dashboard-status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    const list = element("ol");
    list.className = "transaction-list";
    list.setAttribute("aria-label", "Movimientos ordenados del más reciente al más antiguo");
    const loadMore = element("button", "Cargar más movimientos");
    loadMore.type = "button";
    loadMore.className = "load-more";
    loadMore.hidden = true;
    function render(data) {
        totals.replaceChildren();
        for (const total of data.totalsByCurrency) {
            const card = element("article");
            card.className = "total-card";
            card.append(element("small", `Gastos registrados · ${total.currency}`), element("strong", formatLocalizedAmount(total.amount, total.currency)), element("span", "Total para el período seleccionado"));
            totals.append(card);
        }
        count.textContent = `${data.totalCount} movimiento${data.totalCount === 1 ? "" : "s"} registrado${data.totalCount === 1 ? "" : "s"}`;
        list.replaceChildren();
        for (const item of data.items) {
            const row = element("li");
            row.className = "transaction-row";
            const concept = element("strong", item.concept);
            const registered = element("span", `Registrado el ${new Intl.DateTimeFormat("es-CR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.createdAt))}`);
            registered.className = "registered-at";
            const method = element("span", item.paymentMethod);
            method.className = "payment-method";
            const amount = element("strong", formatLocalizedAmount(item.amount, item.currency));
            amount.className = "transaction-amount";
            row.append(concept, registered, method, amount);
            list.append(row);
        }
        root.setAttribute("aria-busy", "false");
        status.textContent = "";
        loadMore.hidden = !dashboard.canLoadMore();
    }
    const dashboard = createDashboardController({ fetch: window.fetch.bind(window), sessionStorage: window.sessionStorage }, {
        render,
        setLoading(loading) {
            root.setAttribute("aria-busy", String(loading));
            loadMore.disabled = loading;
            if (loading) {
                status.setAttribute("role", "status");
                status.textContent = "Cargando el detalle del período…";
            }
        },
        showEmpty() {
            root.setAttribute("aria-busy", "false");
            status.textContent = "Todavía no hay movimientos registrados para este período.";
        },
        showNoResults() {
            root.setAttribute("aria-busy", "false");
            status.textContent = "No hay movimientos para los filtros elegidos. Ajustalos para ampliar la búsqueda.";
        },
        showError(message) {
            root.setAttribute("aria-busy", "false");
            status.setAttribute("role", "alert");
            status.textContent = message;
        },
        showSessionExpired() {
            auth.signOut();
            renderLogin("Tu sesión venció. Ingresá nuevamente para consultar tus movimientos.");
        }
    });
    form.addEventListener("submit", (event) => {
        event.preventDefault();
        void dashboard.load({ from: from.value, to: to.value, paymentMethod: paymentMethod.value });
    });
    loadMore.addEventListener("click", () => void dashboard.loadMore());
    page.append(header, intro, form, totals, heading, status, list, loadMore);
    root.append(page);
    void dashboard.load({ from: from.value, to: to.value, paymentMethod: paymentMethod.value });
}
const auth = createAuthController({ fetch: window.fetch.bind(window), sessionStorage: window.sessionStorage }, renderLogin());
auth.restoreSession();
