import { createAuthController } from "./auth.js";
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
function renderLogin() {
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
    const status = element("p");
    status.className = "status";
    status.setAttribute("role", "status");
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
        showError(message) {
            root.setAttribute("aria-busy", "false");
            email.disabled = false;
            password.disabled = false;
            submit.disabled = false;
            submit.textContent = "Ingresar";
            status.textContent = message;
            status.setAttribute("role", "alert");
            email.focus();
        }
    };
}
function renderAuthenticated() {
    root.setAttribute("aria-busy", "false");
    root.replaceChildren();
    const page = element("main");
    page.className = "shell";
    const header = element("header");
    const wordmark = element("p", "Finanzas al Toque");
    wordmark.className = "wordmark";
    const signOut = element("button", "Cerrar sesión");
    signOut.type = "button";
    signOut.addEventListener("click", () => auth.signOut());
    header.append(wordmark, signOut);
    const content = element("section");
    const title = element("h1", "Tu espacio está listo");
    const message = element("p", "El detalle de movimientos estará disponible aquí.");
    message.className = "muted";
    content.append(title, message);
    page.append(header, content);
    root.append(page);
}
const auth = createAuthController({ fetch: window.fetch.bind(window), sessionStorage: window.sessionStorage }, renderLogin());
auth.restoreSession();
