(function () {
  "use strict";

  const params = new URLSearchParams(window.location.search);
  const title = params.get("name") || "3D viewer";
  const returnPath = params.get("return") || "tracktec.html";
  const titleElement = document.getElementById("viewerTitle");
  const backLink = document.getElementById("backProduct");

  if (titleElement) titleElement.textContent = title;
  document.title = `${title} · 3D · Track Tec`;

  if (backLink) {
    const safeReturn = returnPath.startsWith("products/") ? returnPath : "tracktec.html";
    backLink.href = safeReturn;
  }
})();
