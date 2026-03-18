    document.addEventListener("DOMContentLoaded", () => {
      const form = document.querySelector("form");

      // Toggle visibilité du mot de passe
      const pwdInput = form.querySelector('input[name="password"]');
      const toggle = document.querySelector('.toggle-password');
      if (pwdInput && toggle) {
        const toggleVisibility = () => {
          const isHidden = pwdInput.type === 'password';
          if (isHidden) {
            pwdInput.type = 'text';
            toggle.classList.remove('fa-eye');
            toggle.classList.add('fa-eye-slash');
            toggle.setAttribute('aria-label', 'Masquer le mot de passe');
            toggle.setAttribute('title', 'Masquer le mot de passe');
          } else {
            pwdInput.type = 'password';
            toggle.classList.remove('fa-eye-slash');
            toggle.classList.add('fa-eye');
            toggle.setAttribute('aria-label', 'Afficher le mot de passe');
            toggle.setAttribute('title', 'Afficher le mot de passe');
          }
        };

        toggle.addEventListener('click', (e) => {
          e.preventDefault();
          toggleVisibility();
        });
        toggle.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggleVisibility();
          }
        });
      }

      form.addEventListener("submit", async (e) => {
        e.preventDefault();

        const pseudo = form.pseudo.value.trim();
        const password = form.password.value.trim();

        if (!pseudo || !password) {
          alert("⚠️ Merci de remplir tous les champs !");
          return;
        }

        try {
          const res = await fetch("/api/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pseudo, password }),
          });

          const data = await res.json();

          if (!res.ok) {
            alert(data.message || "❌ Erreur d'inscription.");
            return;
          }

          window.location.href = "/login"; 
        } catch (err) {;
          alert("🚨 Impossible de contacter le serveur.", err);
        }
      });
    });
  

