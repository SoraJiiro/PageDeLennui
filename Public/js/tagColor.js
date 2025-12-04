export function initTagColor(socket) {
  const tagColorPicker = document.getElementById("tagColorPicker");
  if (tagColorPicker) {
    tagColorPicker.addEventListener("change", (e) => {
      socket.emit("user:setTagColor", { color: e.target.value });
    });
  }

  socket.on("user:tagColor", ({ color }) => {
    if (tagColorPicker && color) {
      tagColorPicker.value = color;
    }
  });

  // Disable picker if cheater
  socket.on("clicker:medals", (medals) => {
    if (!Array.isArray(medals)) return;
    const isCheater = medals.some((m) => m.name === "Tricheur");
    if (tagColorPicker) {
      if (isCheater) {
        tagColorPicker.disabled = true;
        tagColorPicker.title =
          "Les tricheurs ne peuvent pas changer la couleur de leur tag";
        tagColorPicker.style.opacity = "0.5";
        tagColorPicker.style.cursor = "not-allowed";
      } else {
        tagColorPicker.disabled = false;
        tagColorPicker.title = "Changer la couleur du Tag";
        tagColorPicker.style.opacity = "1";
        tagColorPicker.style.cursor = "pointer";
      }
    }
  });
}
