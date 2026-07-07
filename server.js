const express = require('express');
const path = require('path');

const app = express();
const adminPassword = process.env.ADMIN_PASSWORD || 'gise18';
const firebaseSecret = process.env.FIREBASE_SECRET;

// O teu link seguro do Firebase
const FIREBASE_URL = `https://convite-giselli-default-rtdb.firebaseio.com/confirmations.json?auth=${firebaseSecret}`;

// 1. MIDDLEWARES (Os assistentes do Express)
// Adeus req.on('data')! Esta linha processa qualquer JSON enviado para o servidor automaticamente.
app.use(express.json());

// Adeus fs.readFile! Esta linha serve todos os teus ficheiros (HTML, CSS, JS, Imagens) automaticamente.
app.use(express.static(__dirname));


// 2. FUNÇÕES DE SUPORTE
async function readConfirmations() {
    try {
        const response = await fetch(FIREBASE_URL);
        const data = await response.json();
        if (!response.ok) {
            console.error('Erro de permissão no Firebase:', data);
            return [];
        }
        if (!data) return [];
        return Object.values(data);
    } catch (error) {
        console.error('Erro ao ler do Firebase:', error);
        return [];
    }
}

function buildSummary(items) {
    return items.reduce(
        (summary, item) => {
            const attendance = String(item.attendance || 'Sim').toLowerCase();
            if (attendance === 'talvez') {
                summary.talvez += 1;
            } else if (attendance === 'não' || attendance === 'nao' || attendance === 'nao vou') {
                summary.nao += 1;
            } else {
                summary.sim += 1;
            }
            summary.total += 1;
            return summary;
        },
        { sim: 0, talvez: 0, nao: 0, total: 0 },
    );
}


// 3. ROTAS DA API (Muito mais limpas e fáceis de ler)

// --- MODO SECRETO: LIMPAR BANCO DE DADOS ---
app.post('/api/admin/wipe', async (req, res) => {
    try {
        const { password } = req.body; // O Express já extrai a senha aqui direto!
        if (password !== adminPassword) {
            return res.status(401).json({ error: 'Acesso negado.' });
        }
        await fetch(FIREBASE_URL, { method: 'DELETE' });
        res.json({ ok: true, message: 'Banco limpo.' });
    } catch (error) {
        res.status(400).json({ error: 'Erro ao processar o comando.' });
    }
});

// --- LER RESUMO DOS CARDS ---
app.get('/api/summary', async (req, res) => {
    const confirmacoes = await readConfirmations();
    res.json(buildSummary(confirmacoes));
});

// --- LER PARA A ÁREA VIP ---
app.get('/api/admin/confirmations', async (req, res) => {
    const { password } = req.query; // Captura parâmetros da URL de forma simples
    if (password !== adminPassword) {
        return res.status(401).json({ error: 'Acesso negado.' });
    }
    const confirmacoes = await readConfirmations();
    res.json(confirmacoes);
});

// --- SALVAR NOVA CONFIRMAÇÃO ---
app.post('/api/confirm', async (req, res) => {
    try {
        const { name, email, attendance, guests, message } = req.body;
        const cleanedName = String(name || '').trim();

        if (!cleanedName) {
            return res.status(400).json({ error: 'O nome é obrigatório.' });
        }

        const numGuests = Number(guests || 1);
        const confirmation = {
            name: cleanedName,
            email: String(email || '').trim(),
            attendance: String(attendance || 'Sim').trim(),
            guests: Number.isFinite(numGuests) && numGuests > 0 ? numGuests : 1,
            message: String(message || '').trim(),
            createdAt: new Date().toISOString(),
        };

        await fetch(FIREBASE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(confirmation)
        });

        res.status(201).json({ ok: true, confirmation });
    } catch (error) {
        res.status(400).json({ error: 'Dados inválidos.' });
    }
});


// 4. LIGAR O MOTOR DO SERVIDOR
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor profissional com Express rodando na porta ${PORT}`);
});
