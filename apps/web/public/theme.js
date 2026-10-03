// Apply the saved appearance before CSS/React paints, including on a hard reload.
(() => {
  let theme = "system";
  try {
    theme = localStorage.getItem("reservepay.theme") || "system";
  } catch {}
  const dark =
    theme === "dark" ||
    (theme !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", dark ? "#181c18" : "#f6f7f2");
})();
