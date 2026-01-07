export function setupPasswordChange(socket) {
  const btn = document.getElementById("btnRequestPasswordChange");
  if (!btn) return;

  const modal = document.getElementById("password-change-modal");
  const newPassInput = document.getElementById("new-password-input");
  const confirmPassInput = document.getElementById("confirm-password-input");
  const btnCancel = document.getElementById("password-change-cancel");
  const btnConfirm = document.getElementById("password-change-confirm");

  if (!modal) {
    // Fallback if modal not present (should not happen if HTML is updated)
    btn.addEventListener("click", () => {
      const newPass = prompt("Entrez votre nouveau mot de passe désiré :");
      if (!newPass) return;
      const confirmPass = prompt("Confirmez le nouveau mot de passe :");
      if (newPass !== confirmPass) {
        alert("Les mots de passe ne correspondent pas.");
        return;
      }
      sendRequest(newPass);
    });
    return;
  }

  function sendRequest(newPass) {
    fetch("/api/request-password-change", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pseudo: window.username, newPassword: newPass }),
    })
      .then((r) => r.json())
      .then((res) => {
        alert(res.message);
      })
      .catch((err) => {
        console.error(err);
        alert("Erreur lors de la demande");
      });
  }

  btn.addEventListener("click", () => {
    newPassInput.value = "";
    confirmPassInput.value = "";
    modal.style.display = "flex";
    newPassInput.focus();
  });

  btnCancel.addEventListener("click", () => {
    modal.style.display = "none";
  });

  btnConfirm.addEventListener("click", () => {
    const newPass = newPassInput.value;
    const confirmPass = confirmPassInput.value;

    if (!newPass) {
      alert("Veuillez entrer un mot de passe.");
      return;
    }
    if (newPass !== confirmPass) {
      alert("Les mots de passe ne correspondent pas.");
      return;
    }

    modal.style.display = "none";
    sendRequest(newPass);
  });
}
