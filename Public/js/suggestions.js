async function submitSuggestion() {
  const suggestionInput = document.getElementById("suggestionInput");
  const statusDisplay = document.getElementById("statusDisplay");
  const submitBtn = document.querySelector("#suggestionForm .btn");

  const content = suggestionInput.value.trim();

  if (!content) {
    showStatus("Veuillez écrire une suggestion.", "error");
    return;
  }

  // Disable button to prevent double submit
  submitBtn.disabled = true;
  submitBtn.textContent = "Envoi en cours...";

  try {
    const response = await fetch("/api/suggestions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ content }),
    });

    const data = await response.json();

    if (response.ok) {
      showStatus("Suggestion envoyée avec succès ! Merci.", "success");
      suggestionInput.value = "";
    } else {
      showStatus(data.message || "Erreur lors de l'envoi.", "error");
      submitBtn.disabled = false;
      submitBtn.textContent = "Envoyer la suggestion";
    }
  } catch (error) {
    console.error("Erreur:", error);
    showStatus("Erreur de connexion au serveur.", "error");
    submitBtn.disabled = false;
    submitBtn.textContent = "Envoyer la suggestion";
  }
}

function showStatus(message, type) {
  const statusDisplay = document.getElementById("statusDisplay");
  statusDisplay.textContent = message;
  statusDisplay.className = "status-message status-" + type;
  statusDisplay.style.display = "block";
}
