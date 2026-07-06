const http = require('http');
const fs = require('fs');
const path = require('path');

const rootDir = __dirname;
const adminPassword = process.env.ADMIN_PASSWORD || 'gise18';

// O SEU LINK DO FIREBASE AQUI! (Nota: o .json no final é obrigatório no Firebase)
const FIREBASE_URL = 'https://convite-giselli-default-rtdb.firebaseio.com/confirmations.json';

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
};

// 1. Função para LER os dados do Firebase
async function readConfirmations() {
    try {
        const response = await fetch(FIREBASE_URL);
        const data = await response.json();
        
        if (!data) return []; // Se for null (vazio), retorna lista vazia

        // O Firebase salva os itens soltos. Isso junta tudo numa lista normal.
        return Object.values(data);
    } catch (error) {
        console.error('Erro ao ler do Firebase:', error);
        return [];
    }
}

// 2. Função para RESUMIR os dados
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

function sendJson(res, statusCode, payload) {
    res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(payload));
}

function serveStatic(res, requestedPath) {
    const safePath = path.normalize(requestedPath).replace(/^([a-zA-Z]:)?[\\/]+/, '');
    const absolutePath = path.join(rootDir, safePath);

    if (!absolutePath.startsWith(rootDir)) {
        sendJson(res, 403, { error: 'Acesso negado' });
        return;
    }

    fs.readFile(absolutePath, (error, content) => {
        if (error) {
            sendJson(res, 404, { error: 'Arquivo não encontrado' });
            return;
        }

        const ext = path.extname(absolutePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'text/plain; charset=utf-8';
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content);
    });
}

// O SERVIDOR (Note que adicionei 'async' aqui)
const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);

    // --- MODO SECRETO: LIMPAR BANCO DE DADOS ---
    if (req.method === 'POST' && url.pathname === '/api/admin/wipe') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const payload = JSON.parse(body || '{}');
                if (payload.password !== adminPassword) {
                    sendJson(res, 401, { error: 'Acesso negado.' });
                    return;
                }
                
                // Manda um comando DELETE para o Firebase para apagar tudo
                await fetch(FIREBASE_URL, { method: 'DELETE' });
                sendJson(res, 200, { ok: true, message: 'Banco limpo.' });
            } catch {
                sendJson(res, 400, { error: 'Erro.' });
            }
        });
        return;
    }

    // --- LER RESUMO ---
    if (req.method === 'GET' && url.pathname === '/api/summary') {
        const confirmacoes = await readConfirmations();
        sendJson(res, 200, buildSummary(confirmacoes));
        return;
    }

    // --- LER PARA A ÁREA VIP ---
    if (req.method === 'GET' && url.pathname === '/api/admin/confirmations') {
        const password = url.searchParams.get('password');
        if (password !== adminPassword) {
            sendJson(res, 401, { error: 'Acesso negado.' });
            return;
        }
        const confirmacoes = await readConfirmations();
        sendJson(res, 200, confirmacoes);
        return;
    }

    // --- SALVAR NOVA CONFIRMAÇÃO ---
    if (req.method === 'POST' && url.pathname === '/api/confirm') {
        let body = '';
        req.on('data', (chunk) => body += chunk);
        req.on('end', async () => {
            try {
                const payload = JSON.parse(body || '{}');
                const name = String(payload.name || '').trim();
                const attendance = String(payload.attendance || 'Sim').trim();
                const guests = Number(payload.guests || 1);

                if (!name) {
                    sendJson(res, 400, { error: 'O nome é obrigatório.' });
                    return;
                }

                const confirmation = {
                    name,
                    email: String(payload.email || '').trim(),
                    attendance,
                    guests: Number.isFinite(guests) && guests > 0 ? guests : 1,
                    message: String(payload.message || '').trim(),
                    createdAt: new Date().toISOString(),
                };

                // Enviando para o Firebase (POST)
                await fetch(FIREBASE_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(confirmation)
                });

                sendJson(res, 201, { ok: true, confirmation });
            } catch {
                sendJson(res, 400, { error: 'Dados inválidos.' });
            }
        });
        return;
    }

    // Serve os arquivos HTML, CSS, JS
    const requestedPath = url.pathname === '/' ? '/index.html' : url.pathname;
    serveStatic(res, requestedPath);
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
});
