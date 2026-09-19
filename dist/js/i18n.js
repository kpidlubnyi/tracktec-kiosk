const translations = {
  en: {
    explore: "Explore our solutions",
    tagline: "Delivering smart solutions for railways of tomorrow",
    sleepers: "Sleepers",
    fastenings: "Rail fastenings",
    turnouts: "Turnouts",
    crossings: "Level crossing panels",
    back: "Back",
    previous: "Previous",
    top: "Top",
    next: "Next",
    categories: "Product categories",
    view3d: "View 3D model",
    no3d: "3D model not available",
    backProduct: "Back to product",
    reset: "Reset",
    rotate: "Rotate",
    cover: "Cover",
    slice: "Slice",
    wireframe: "Wireframe",
    fullscreen: "Fullscreen",
    loading3d: "Loading 3D model…",
    lightTheme: "Switch to light theme",
    darkTheme: "Switch to dark theme",
    rights: "All rights reserved. This presentation and its original contents are the property of Track Tec.",
    progress: "Work in progress",
    soon: "This product section is being prepared."
  },
  pl: {
    explore: "Poznaj nasze rozwiązania",
    tagline: "Inteligentne rozwiązania dla kolei przyszłości",
    sleepers: "Podkłady kolejowe",
    fastenings: "Systemy przytwierdzeń",
    turnouts: "Rozjazdy kolejowe",
    crossings: "Nawierzchnie przejazdowe",
    back: "Wstecz",
    previous: "Poprzednia",
    top: "Góra",
    next: "Następna",
    categories: "Kategorie produktów",
    view3d: "Zobacz model 3D",
    no3d: "Model 3D niedostępny",
    backProduct: "Powrót do produktu",
    reset: "Resetuj",
    rotate: "Obrót",
    cover: "Osłona",
    slice: "Przekrój",
    wireframe: "Siatka",
    fullscreen: "Pełny ekran",
    loading3d: "Wczytywanie modelu 3D…",
    lightTheme: "Włącz jasny motyw",
    darkTheme: "Włącz ciemny motyw",
    rights: "Wszelkie prawa zastrzeżone. Prezentacja i jej oryginalna zawartość są własnością Track Tec.",
    progress: "Prace w toku",
    soon: "Ta sekcja produktowa jest w przygotowaniu."
  },
  de: {
    explore: "Entdecken Sie unsere Lösungen",
    tagline: "Intelligente Lösungen für die Bahn von morgen",
    sleepers: "Bahnschwellen",
    fastenings: "Schienenbefestigungen",
    turnouts: "Weichen",
    crossings: "Bahnübergangsplatten",
    back: "Zurück",
    previous: "Zurück",
    top: "Nach oben",
    next: "Weiter",
    categories: "Produktkategorien",
    view3d: "3D-Modell ansehen",
    no3d: "3D-Modell nicht verfügbar",
    backProduct: "Zurück zum Produkt",
    reset: "Zurücksetzen",
    rotate: "Drehen",
    cover: "Abdeckung",
    slice: "Schnitt",
    wireframe: "Drahtmodell",
    fullscreen: "Vollbild",
    loading3d: "3D-Modell wird geladen…",
    lightTheme: "Zum hellen Design wechseln",
    darkTheme: "Zum dunklen Design wechseln",
    rights: "Alle Rechte vorbehalten. Diese Präsentation und ihre Originalinhalte sind Eigentum von Track Tec.",
    progress: "In Bearbeitung",
    soon: "Dieser Produktbereich wird derzeit vorbereitet."
  }
};

const allowedLanguages = Object.keys(translations);

function setLanguage(language) {
  const lang = allowedLanguages.includes(language) ? language : "en";
  document.documentElement.lang = lang;
  localStorage.setItem("tracktec-language", lang);
  document.querySelectorAll("[data-i18n]").forEach((element) => {
    const key = element.dataset.i18n;
    if (translations[lang][key]) element.textContent = translations[lang][key];
  });
  document.querySelectorAll("[data-copy-en]").forEach((element) => {
    element.textContent = element.getAttribute(`data-copy-${lang}`) || element.getAttribute("data-copy-en");
  });
  document.querySelectorAll("[data-lang]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.lang === lang));
  });
  document.querySelectorAll("a[data-preserve-language]").forEach((link) => {
    const url = new URL(link.href, window.location.href);
    url.searchParams.set("lang", lang);
    link.href = url.href;
  });
  setTheme(currentTheme());
}

function currentTheme() {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

function applyTrackTecLogoVariant() {
  let useStandardLogo = false;
  try { useStandardLogo = localStorage.getItem("tracktec-logo-variant") === "standard"; } catch (error) { /* storage is optional */ }
  const filename = useStandardLogo ? "tt-logo.png" : "tt-logo-black-og.png";
  document.querySelectorAll(".topbar .tracktec-logo").forEach((logo) => {
    const source = logo.getAttribute("src") || "";
    logo.setAttribute("src", source.replace(/tt-logo(?:-black-og)?\.png$/, filename));
  });
}

function setTheme(theme) {
  const nextTheme = theme === "light" ? "light" : "dark";
  if (nextTheme === "light") document.documentElement.dataset.theme = "light";
  else document.documentElement.dataset.theme = "dark";
  try { localStorage.setItem("tracktec-theme", nextTheme); } catch (error) { /* storage is optional */ }
  const labelKey = nextTheme === "light" ? "darkTheme" : "lightTheme";
  const language = allowedLanguages.includes(document.documentElement.lang) ? document.documentElement.lang : "en";
  document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
    button.setAttribute("aria-label", translations[language][labelKey]);
    button.setAttribute("title", translations[language][labelKey]);
    button.setAttribute("aria-pressed", String(nextTheme === "light"));
  });
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = nextTheme === "light" ? "#ffffff" : "#111111";
  document.dispatchEvent(new CustomEvent("tt-themechange", { detail: nextTheme }));
}

function setupProductReturnPosition() {
  if (!document.querySelector(".catalog-shell")) return;

  document.querySelectorAll(".product-detail").forEach((product) => {
    const viewerLink = product.querySelector('.model-button[href*="viewer.html"]');
    if (!viewerLink) return;

    const viewerUrl = new URL(viewerLink.href, window.location.href);
    const item = viewerUrl.searchParams.get("item");
    const returnPath = viewerUrl.searchParams.get("return");
    if (!item || !returnPath) return;

    product.id = `product-${item}`;
    viewerUrl.searchParams.set("return", `${returnPath.split(/[?#]/)[0]}?focus=${encodeURIComponent(item)}`);
    viewerLink.href = viewerUrl.href;

    viewerLink.addEventListener("click", () => {
      const catalogUrl = new URL(window.location.href);
      catalogUrl.searchParams.set("focus", item);
      history.replaceState(history.state, "", catalogUrl.href);
    });
  });

  const restoreProduct = () => {
    const item = new URLSearchParams(window.location.search).get("focus");
    if (!item) return;
    const product = document.getElementById(`product-${item}`);
    if (product) product.scrollIntoView({ block: "center", inline: "nearest" });
  };

  restoreProduct();
  window.addEventListener("load", restoreProduct, { once: true });
  window.addEventListener("pageshow", restoreProduct);
}

let productRevealObserver;

function setupProductScrollReveal(root = document) {
  if (!document.querySelector(".catalog-shell")) return;

  const products = Array.from(root.querySelectorAll(".product-detail:not(.scroll-reveal)"));
  if (!products.length) return;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  products.forEach((product, index) => {
    product.classList.add("scroll-reveal", index % 2 === 0 ? "reveal-left" : "reveal-right");
  });

  if (reduceMotion || !("IntersectionObserver" in window)) {
    products.forEach((product) => product.classList.add("revealed"));
    return;
  }

  if (!productRevealObserver) {
    productRevealObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("revealed");
        productRevealObserver.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
  }

  products.forEach((product) => productRevealObserver.observe(product));
}

document.addEventListener("DOMContentLoaded", () => {
  applyTrackTecLogoVariant();
  const queryLanguage = new URLSearchParams(window.location.search).get("lang");
  const savedLanguage = localStorage.getItem("tracktec-language");
  setLanguage(queryLanguage || savedLanguage || "en");
  document.querySelectorAll("[data-lang]").forEach((button) => {
    button.addEventListener("click", () => setLanguage(button.dataset.lang));
  });
  let savedTheme = "light";
  try { savedTheme = localStorage.getItem("tracktec-theme") || "light"; } catch (error) { /* storage is optional */ }
  setTheme(savedTheme);
  document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
    button.addEventListener("click", () => setTheme(currentTheme() === "light" ? "dark" : "light"));
  });
  document.querySelectorAll(".topbar .tracktec-logo, .topbar .tines-logo").forEach((logo) => {
    logo.setAttribute("role", "link");
    logo.setAttribute("tabindex", "0");
    logo.setAttribute("aria-label", `${logo.alt || "Brand"} home`);
    const openHome = () => {
      const homePath = window.location.pathname.includes("/products/") ? "../index.html" : "index.html";
      window.location.href = homePath;
    };
    logo.addEventListener("click", openHome);
    logo.addEventListener("keydown", (event) => {
      if (event.key === "Enter") openHome();
    });
  });
  setupProductReturnPosition();
  setupProductScrollReveal();
});

window.addEventListener("storage", (event) => {
  if (event.key === "tracktec-logo-variant") applyTrackTecLogoVariant();
});
