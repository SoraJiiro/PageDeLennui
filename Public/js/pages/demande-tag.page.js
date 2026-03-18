        let socket;
        let lastPendingRequest = null;

        function notifyParentAction(action, payload = {}) {
            return;
        }

        function showStatusPending(request) {
            const form = document.getElementById('requestForm');
            const statusDisplay = document.getElementById('statusDisplay');
            if (!request) return;

            form.style.display = 'none';
            statusDisplay.style.display = 'block';
            statusDisplay.className = 'status-message status-pending';

            let tagDisplay = `<strong>${request.tag}</strong>`;
            if (request.colors && Array.isArray(request.colors)) {
                const words = request.tag.split(/\s+/);
                tagDisplay = words
                    .map((w, i) => `<span style="color:${request.colors[i]}">${w}</span>`)
                    .join(' ');
            }

            statusDisplay.innerHTML = `
                <h3>Demande en attente</h3>
                <p>Tag demand� : ${tagDisplay}</p>
                <p>Envoy� le : ${new Date(request.time).toLocaleString()}</p>
                <p><em>En attente de validation par l'admin...</em></p>
            `;
        }

        function showStatusAccepted(tag) {
            const statusDisplay = document.getElementById('statusDisplay');
            const form = document.getElementById('requestForm');

            statusDisplay.style.display = 'block';
            form.style.display = 'none';
            statusDisplay.className = 'status-message status-accepted';
            statusDisplay.innerHTML = `
                <h3>? Demande Accept�e !</h3>
                <p>Votre tag <strong>${tag}</strong> a �t� valid�.</p>
            `;
        }

        function showStatusRejected() {
            const statusDisplay = document.getElementById('statusDisplay');
            const form = document.getElementById('requestForm');

            statusDisplay.style.display = 'block';
            form.style.display = 'none';
            statusDisplay.className = 'status-message status-rejected';
            statusDisplay.innerHTML = `
                <h3>? Demande Refus�e</h3>
                <p>L'admin a refus� votre demande de tag.</p>
            `;
        }

        async function init() {
            try {
                const res = await fetch('/api/session');
                if (res.status === 401 || !res.ok) {
                    window.location.href = '/login';
                    return;
                }
                const sessionData = await res.json();
                const currentUser = sessionData.pseudo;

                socket = io({
                    query: { username: currentUser }
                });

                if (window.initUiColor) {
                    window.initUiColor(socket);
                }

                socket.on('tag:response', (data) => {
                    if (data && data.accepted) {
                        showStatusAccepted(data.tag || (lastPendingRequest && lastPendingRequest.tag) || '');
                        lastPendingRequest = null;
                        notifyParentAction('tag:approved', {
                            tag: data.tag || null
                        });
                    } else {
                        showStatusRejected();
                        lastPendingRequest = null;
                        notifyParentAction('tag:rejected');
                        setTimeout(() => {
                            checkStatus();
                        }, 5000);
                    }
                });

                checkStatus();
            } catch (e) {
                console.error("Init error", e);
            }
        }
        
        async function checkStatus() {
            try {
                const res = await fetch('/api/tag/status');
                if (res.status === 401) {
                    window.location.href = '/login';
                    return;
                }
                const data = await res.json();
                
                const form = document.getElementById('requestForm');
                const statusDisplay = document.getElementById('statusDisplay');

                if (data.hasPending) {
                    lastPendingRequest = data.request;
                    showStatusPending(data.request);
                } else {
                    lastPendingRequest = null;
                    form.style.display = 'block';
                    statusDisplay.style.display = 'none';
                }
            } catch (err) {
                console.error(err);
            }
        }

        async function submitRequest() {
            const tag = document.getElementById('tagInput').value.trim();
            if (!tag) return alert('Veuillez entrer un tag');
            if (tag.length > 32) return alert('Tag trop long');

            const words = tag.split(/\s+/);
            const colors = [];
            for (let i = 0; i < words.length; i++) {
                const picker = document.getElementById(`color-picker-${i}`);
                colors.push(picker ? picker.value : '#ffffff');
            }

            try {
                const res = await fetch('/api/tag/request', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ tag, colors })
                });
                
                const data = await res.json();
                
                if (res.ok) {
                    checkStatus();
                    notifyParentAction('tag:request-sent', {
                        tag
                    });
                } else {
                    alert('Erreur: ' + data.message);
                }
            } catch (err) {
                console.error(err);
                alert('Erreur lors de l\'envoi');
            }
        }

        function updateColorPickers() {
            const tagInput = document.getElementById('tagInput');
            const container = document.getElementById('colorPickersContainer');
            const preview = document.getElementById('tagPreview');
            
            const text = tagInput.value.trim();
            if (!text) {
                container.innerHTML = '';
                preview.innerHTML = '<span style="color: #888;">(Entrez un tag)</span>';
                return;
            }

            const words = text.split(/\s+/);
            
            const existingColors = [];
            const existingPickers = container.querySelectorAll('input[type="color"]');
            existingPickers.forEach(p => existingColors.push(p.value));

            container.innerHTML = '';
            preview.innerHTML = '';

            words.forEach((word, index) => {
                const wrapper = document.createElement('div');
                wrapper.style.display = 'flex';
                wrapper.style.flexDirection = 'column';
                wrapper.style.alignItems = 'center';
                const label = document.createElement('span');
                label.textContent = word;
                label.style.fontSize = '0.8rem';
                label.style.marginBottom = '5px';
                label.style.maxWidth = '100px';
                label.style.overflow = 'hidden';
                label.style.textOverflow = 'ellipsis';
                wrapper.appendChild(label);

                // Picker
                const picker = document.createElement('input');
                picker.type = 'color';
                picker.id = `color-picker-${index}`;
                picker.value = existingColors[index] || '#ffffff';
                picker.style.width = '40px';
                picker.style.height = '30px';
                picker.style.border = 'none';
                picker.style.cursor = 'pointer';
                
                picker.addEventListener('input', updatePreview);
                wrapper.appendChild(picker);

                container.appendChild(wrapper);
            });

            updatePreview();
        }

        function updatePreview() {
            const tagInput = document.getElementById('tagInput');
            const preview = document.getElementById('tagPreview');
            const text = tagInput.value.trim();
            
            if (!text) return;

            const words = text.split(/\s+/);
            preview.innerHTML = '';

            words.forEach((word, index) => {
                const picker = document.getElementById(`color-picker-${index}`);
                const color = picker ? picker.value : '#ffffff';
                
                const span = document.createElement('span');
                span.textContent = word;
                span.style.color = color;
                span.style.marginRight = '4px'; // Space between words
                preview.appendChild(span);
            });
        }

        init();
    

