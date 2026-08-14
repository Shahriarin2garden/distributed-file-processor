// Tiny DOM helpers. Content is treated as trusted application templates.

export function h(html) {
  const tpl = document.createElement("template");
  tpl.innerHTML = html.trim();
  return tpl.content.firstElementChild;
}

export function renderInto(container, html) {
  container.replaceChildren(h(`<div>${html}</div>`).firstElementChild ?? container);
}

export function clear(container) {
  container.replaceChildren();
}

export function on(container, selector, event, handler) {
  container.addEventListener(event, (e) => {
    const node = e.target.closest(selector);
    if (node && container.contains(node)) handler(node, e);
  });
}

export function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}