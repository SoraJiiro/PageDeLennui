export function setupPasswordChange(socket) {
  const btn = document.getElementById("btnRequestPasswordChange");
  if (!btn) return;

  const modal = document.getElementById("password-change-modal");
  const currentPassInput = document.getElementById("current-password-input");
  const newPassInput = document.getElementById("new-password-input");
  const confirmPassInput = document.getElementById("confirm-password-input");
  const btnCancel = document.getElementById("password-change-cancel");
  const btnConfirm = document.getElementById("password-change-confirm");

  if (!modal) {
    btn.addEventListener("click", () => {
      const currentPass = prompt("Entrez votre mot de passe actuel :");
      if (!currentPass) return;
      const newPass = prompt("Entrez votre nouveau mot de passe désiré :");
      if (!newPass) return;
      const confirmPass = prompt("Confirmez le nouveau mot de passe :");
      if (newPass !== confirmPass) {
        alert("Les mots de passe ne correspondent pas.");
        return;
      }
      sendRequest(currentPass, newPass);
    });
    return;
  }

  function sendRequest(currentPass, newPass) {
    fetch("/api/request-password-change", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pseudo: window.username,
        currentPassword: currentPass,
        newPassword: newPass,
      }),
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
    currentPassInput.value = "";
    newPassInput.value = "";
    confirmPassInput.value = "";
    modal.style.display = "flex";
    currentPassInput.focus();
  });

  btnCancel.addEventListener("click", () => {
    modal.style.display = "none";
  });

  btnConfirm.addEventListener("click", () => {
    const currentPass = currentPassInput.value;
    const newPass = newPassInput.value;
    const confirmPass = confirmPassInput.value;

    if (!currentPass) {
      alert("Veuillez entrer votre mot de passe actuel.");
      return;
    }
    if (!newPass) {
      alert("Veuillez entrer un mot de passe.");
      return;
    }
    if (newPass !== confirmPass) {
      alert("Les mots de passe ne correspondent pas.");
      return;
    }

    modal.style.display = "none";
    sendRequest(currentPass, newPass);
  });
}
