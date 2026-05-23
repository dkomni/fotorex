// Tiny vanilla-JS partials injector.
//
// Replaces every element matching `[data-include="header"]` or
// `[data-include="footer"]` with the contents of /partials/header.html or
// /partials/footer.html. After injection it:
//   - sets aria-current="page" on the nav link whose data-path matches
//     location.pathname (treating "" and "/" as the home page),
//   - wires the mobile hamburger toggle,
//   - applies the .scrolled class to the header after the user scrolls 8px,
//   - fills every <span data-year> with the current year.
//
// All requests are same-origin static fetches. Header/footer markup is fetched
// once each and cached in module scope.

const partialCache = new Map();

async function loadPartial(name) {
  if (partialCache.has(name)) return partialCache.get(name);
  const url = `/partials/${name}.html`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  const html = await res.text();
  partialCache.set(name, html);
  return html;
}

function highlightCurrentNav(root) {
  const path = location.pathname.replace(/index\.html$/, '') || '/';
  root.querySelectorAll('.primary-nav a[data-path]').forEach((a) => {
    const target = a.dataset.path.replace(/index\.html$/, '') || '/';
    if (target === path) {
      a.setAttribute('aria-current', 'page');
    }
  });
}

function wireMobileNav(root) {
  const toggle = root.querySelector('#nav-toggle');
  const nav = root.querySelector('#primary-nav');
  if (!toggle || !nav) return;
  toggle.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(open));
  });
  // Close the panel after a nav-link tap on mobile.
  nav.querySelectorAll('a').forEach((a) => {
    a.addEventListener('click', () => {
      nav.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
    });
  });
}

function wireScrollState() {
  const header = document.querySelector('.site-header');
  if (!header) return;
  const apply = () => header.classList.toggle('scrolled', window.scrollY > 8);
  apply();
  window.addEventListener('scroll', apply, { passive: true });
}

function fillYear() {
  const y = new Date().getFullYear();
  document.querySelectorAll('[data-year]').forEach((el) => { el.textContent = y; });
}

async function injectPartial(slotName, mountSelector) {
  const slot = document.querySelector(mountSelector);
  if (!slot) return null;
  const html = await loadPartial(slotName);
  slot.innerHTML = html;
  return slot;
}

(async function init() {
  try {
    const [header] = await Promise.all([
      injectPartial('header', '[data-include="header"]'),
      injectPartial('footer', '[data-include="footer"]'),
    ]);
    if (header) {
      highlightCurrentNav(header);
      wireMobileNav(header);
    }
    wireScrollState();
    fillYear();
  } catch (err) {
    console.error('[partials] failed to inject', err);
  }
})();
