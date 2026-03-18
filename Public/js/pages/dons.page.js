        document.addEventListener("DOMContentLoaded", () => {
            const socket = io();
            const recipientSelect = document.getElementById("recipientSelect");
            const amountInput = document.getElementById("amountInput");
            const btnSend = document.getElementById("btnSendDonation");

            // Charger la liste des utilisateurs
            fetch("/api/users/list")
                .then(res => res.json())
                .then(users => {
                    recipientSelect.innerHTML = '<option value="">Choisir un joueur...</option>';
                    users.forEach(user => {
                        const opt = document.createElement("option");
                        opt.value = user.pseudo;
                        opt.textContent = user.pseudo;
                        recipientSelect.appendChild(opt);
                    });
                })
                .catch(err => {
                    console.error("Erreur chargement utilisateurs:", err);
                    recipientSelect.innerHTML = '<option value="">Erreur de chargement</option>';
                });

            btnSend.addEventListener("click", () => {
                const recipient = recipientSelect.value;
                const amount = parseInt(amountInput.value);

                if (!recipient) {
                    alert("Veuillez sélectionner un destinataire.");
                    return;
                }
                if (!amount || amount <= 0) {
                    alert("Montant invalide.");
                    return;
                }

                if (confirm(`Envoyer ${amount} monnaie à ${recipient} ?`)) {
                    // Utiliser le socket global s'il existe pour éviter de multiples connexions
                    const socketToSend = window.socket || socket;
                    socketToSend.emit("user:donate", { recipient, amount });
                    
                    // Petit délai pour s'assurer que le paquet part avant la redirection
                    setTimeout(() => {
                        alert("Demande de don envoyée pour validation admin.");
                        
                        window.location.href = "/";
                    }, 300);
                }
            });
        });
    

