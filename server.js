const http = require('http');
const fs = require('fs');
const path = require('path');

const rootDir = __dirname;
const dataDir = path.join(rootDir, 'data');
const dataFile = path.join(dataDir, 'confirmations.json');
const adminPassword = process.env.ADMIN_PASSWORD || 'gise18';
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

if (!fs.existsSync(dataFile)) {
    fs.writeFileSync(dataFile, '[]', 'utf8');
}

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

function readConfirmations() {
    try {
        return JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    } catch {
        return [];
    }
}

function writeConfirmations(data) {
    fs.writeFileSync(dataFile, JSON.stringify(data, null, 2), 'utf8');
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

async function syncToSupabase(record) {
    if (!supabaseUrl || !supabaseKey) {
        return;
    }

    try {
        await fetch(`${supabaseUrl}/rest/v1/confirmations`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                apikey: supabaseKey,
                Authorization: `Bearer ${supabaseKey}`,
            },
            body: JSON.stringify(record),
        });
    } catch (error) {
        console.error('Erro ao sincronizar com Supabase:', error.message);
    }
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

const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === 'GET' && url.pathname === '/api/summary') {
        sendJson(res, 200, buildSummary(readConfirmations()));
        return;
    }

    if (req.method === 'GET' && url.pathname === '/api/admin/confirmations') {
        const password = url.searchParams.get('password');

        if (password !== adminPassword) {
            sendJson(res, 401, { error: 'Acesso negado.' });
            return;
        }

        sendJson(res, 200, readConfirmations());
        return;
    }
    // --- ROTA SECRETA PARA LIMPAR DADOS ---
    if (req.method === 'POST' && url.pathname === '/api/admin/wipe') {
        let body = '';

        req.on('data', (chunk) => {
            body += chunk;
        });

        req.on('end', () => {
            try {
                const payload = JSON.parse(body || '{}');

                // Verifica a senha para ninguém apagar seu banco de sacanagem
                if (payload.password !== adminPassword) {
                    sendJson(res, 401, { error: 'Acesso negado.' });
                    return;
                }

                // Limpa o banco de dados local sobrescrevendo com uma lista vazia
                writeConfirmations([]);
                
                // Nota: Se você for usar o Supabase no Vercel depois, 
                // você precisará adicionar o código para deletar os dados no Supabase aqui também!

                sendJson(res, 200, { ok: true, message: 'Banco de dados limpo.' });
            } catch {
                sendJson(res, 400, { error: 'Dados inválidos.' });
            }
        });

        return;
    }

    if (req.method === 'POST' && url.pathname === '/api/confirm') {
        let body = '';

        req.on('data', (chunk) => {
            body += chunk;
        });

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

                const confirmations = readConfirmations();
                confirmations.push(confirmation);
                writeConfirmations(confirmations);
                await syncToSupabase(confirmation);

                sendJson(res, 201, { ok: true, confirmation });
            } catch {
                sendJson(res, 400, { error: 'Dados inválidos.' });
            }
        });

        return;
    }

    const requestedPath = url.pathname === '/' ? '/index.html' : url.pathname;
    serveStatic(res, requestedPath);
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
});
