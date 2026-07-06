const form = document.getElementById('rsvp-form');
const status = document.getElementById('form-status');
const summaryCards = document.getElementById('summary-cards');
const adminForm = document.getElementById('admin-form');
const adminPasswordInput = document.getElementById('admin-password');
const adminMessage = document.getElementById('admin-message');
const adminTable = document.getElementById('admin-table');
const adminBody = document.getElementById('admin-body');

async function loadSummary() {
    try {
        const response = await fetch('/api/summary');
        const data = await response.json();
        renderSummary(data);
    } catch (error) {
        if (summaryCards) {
            summaryCards.innerHTML = '<p>Não foi possível carregar o resumo no momento.</p>';
        }
    }
}

function renderSummary(summary) {
    if (!summaryCards) {
        return;
    }

    const cards = [
        { label: 'Confirmaram', value: summary.sim, type: 'sim' },
        { label: 'Talvez', value: summary.talvez, type: 'talvez' },
        { label: 'Não vão', value: summary.nao, type: 'nao' },
        { label: 'Total', value: summary.total, type: 'total' },
    ];

    summaryCards.innerHTML = cards
        .map((item) => `
            <div class="summary-card ${item.type}">
                <span>${item.label}</span>
                <strong>${item.value}</strong>
            </div>
        `)
        .join('');
}

function renderAdminTable(items) {
    if (!adminTable || !adminBody) {
        return;
    }

    if (!items.length) {
        adminBody.innerHTML = '<tr><td colspan="5">Nenhuma resposta ainda.</td></tr>';
        adminTable.hidden = false;
        return;
    }

    adminBody.innerHTML = items
        .slice()
        .reverse()
        .map((item) => `
            <tr>
                <td>${item.name || '-'}</td>
                <td>${item.attendance || '-'}</td>
                <td>${item.guests || 1}</td>
                <td>${item.email || '-'}</td>
                <td>${item.message || '-'}</td>
            </tr>
        `)
        .join('');

    adminTable.hidden = false;
}

if (form) {
    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const formData = new FormData(form);
        const payload = Object.fromEntries(formData.entries());

        status.textContent = 'Enviando confirmação...';

        try {
            const response = await fetch('/api/confirm', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...payload,
                    guests: Number(payload.guests || 1),
                }),
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Erro ao enviar confirmação.');
            }

            status.textContent = 'Confirmação enviada com sucesso!';
            form.reset();
            form.guests.value = '1';
            loadSummary();
        } catch (error) {
            status.textContent = error.message;
        }
    });
}

if (adminForm) {
    adminForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const password = adminPasswordInput.value.trim();

        if (!password) {
            if (adminMessage) {
                adminMessage.textContent = 'Digite a senha.';
            }
            return;
        }

        if (adminMessage) {
            adminMessage.textContent = 'Carregando...';
        }

        try {
            const response = await fetch(`/api/admin/confirmations?password=${encodeURIComponent(password)}`);
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Senha incorreta.');
            }

            renderAdminTable(data);
            if (adminMessage) {
                adminMessage.textContent = `${data.length} resposta(s) carregada(s).`;
            }
        } catch (error) {
            if (adminMessage) {
                adminMessage.textContent = error.message;
            }
            if (adminTable) {
                adminTable.hidden = true;
            }
        }
    });
}
// --- MODO SECRETO (EASTER EGG) ---
let clickCount = 0;
let clickTimer;

// Escuta os cliques em qualquer lugar da tela
document.addEventListener('click', () => {
    clickCount++;
    
    // Inicia o tempo no primeiro clique
    if (clickCount === 1) {
        clickTimer = setTimeout(() => {
            clickCount = 0; // Zera se demorar mais de 2 segundos
        }, 2000); 
    }

    // Se chegar a 7 cliques rápidos
    if (clickCount === 7) {
        clearTimeout(clickTimer);
        clickCount = 0;
        triggerSecretWipe();
    }
});

async function triggerSecretWipe() {
    // Abre a caixinha nativa do navegador
    const command = prompt("Modo Teste: Digite o comando secreto para continuar:");
    
    if (command === 'wipe') {
        const confirmWipe = confirm("Tem certeza? Isso vai apagar todas as respostas!");
        
        if (confirmWipe) {
            try {
                // Chama a rota secreta no backend
                const response = await fetch('/api/admin/wipe', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password: 'gise18' }) // Usando a senha do sistema por segurança
                });

                if (response.ok) {
                    alert("Banco de dados apagado com sucesso! Recarregando a página...");
                    location.reload(); // Atualiza a página
                } else {
                    alert("Erro ao apagar o banco de dados.");
                }
            } catch (error) {
                alert("Erro de conexão.");
            }
        }
    }
}

loadSummary();
