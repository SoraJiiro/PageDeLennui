(function () {
  document.addEventListener("keydown", (event) => {
    const active = document.activeElement;
    const tag = active && active.tagName;
    const isTyping =
      tag === "INPUT" ||
      tag === "TEXTAREA" ||
      (active && active.isContentEditable);
    if (isTyping) return;

    if (event.key === " " || event.key === "ArrowUp" || event.key === "Enter") {
      event.preventDefault();
    }
  });
})();
