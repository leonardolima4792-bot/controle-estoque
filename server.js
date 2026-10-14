const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Inicializar banco de dados SQLite local persistente
const db = new Database('estoque.db');

// Criar tabela de aparelhos se não existir
db.prepare(`
    CREATE TABLE IF NOT EXISTS aparelhos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        marca TEXT NOT NULL,
        modelo TEXT NOT NULL,
        memoria TEXT NOT NULL,
        quantidade INTEGER DEFAULT 1,
        imei TEXT UNIQUE NOT NULL
    )
`).run();

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Rota principal (serve o index.html)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 1. Listar todos os aparelhos em estoque
app.get('/api/aparelhos', (req, res) => {
    try {
        const aparelhos = db.prepare('SELECT * FROM aparelhos').all();
        res.json(aparelhos);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao buscar aparelhos.' });
    }
});

// 2. Cadastrar ou incrementar aparelho
app.post('/api/aparelhos', (req, res) => {
    try {
        const { marca, modelo, memoria, imei } = req.body;
        if (!marca || !modelo || !memoria || !imei) {
            return res.status(400).json({ error: 'Preencha todos os campos.' });
        }

        // Verificar se já existe exatamente a mesma marca, modelo e memória para incrementar quantidade
        const existente = db.prepare('SELECT * FROM aparelhos WHERE marca = ? AND modelo = ? AND memoria = ?').get(marca, modelo, memoria);

        if (existente) {
            // Incrementar quantidade e garantir inserção do novo IMEI se necessário (ou atualizar)
            db.prepare('UPDATE aparelhos SET quantidade = quantidade + 1 WHERE id = ?').run(existente.id);
        }

        // Inserir o registo com o IMEI único
        db.prepare('INSERT INTO aparelhos (marca, modelo, memoria, quantidade, imei) VALUES (?, ?, ?, 1, ?)').run(marca, modelo, memoria, imei);

        res.json({ success: true, message: 'Aparelho registado com sucesso!' });
    } catch (err) {
        if (err.message && err.message.includes('UNIQUE constraint failed')) {
            return res.status(400).json({ error: 'Este IMEI já está registado no sistema.' });
        }
        console.error(err);
        res.status(500).json({ error: 'Erro ao registar aparelho.' });
    }
});

// 3. Registrar Venda / Baixa Unitária por IMEI (Apaga o registo específico do IMEI)
app.delete('/api/aparelhos/:imei', (req, res) => {
    try {
        const { imei } = req.params;
        const stmt = db.prepare('DELETE FROM aparelhos WHERE imei = ?');
        const resultado = stmt.run(imei);

        if (resultado.changes > 0) {
            res.json({ success: true, message: 'Baixa unitária efetuada com sucesso.' });
        } else {
            res.status(404).json({ error: 'IMEI não encontrado no estoque.' });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao processar baixa no banco de dados.' });
    }
});

// 4. Rota para Auditoria Relâmpago (EXTREMELY FAST)
app.post('/api/auditoria', express.json(), (req, res) => {
    try {
        const { imeis } = req.body;
        if (!Array.isArray(imeis)) {
            return res.status(400).json({ error: 'Formato inválido. Envie um array de IMEIs.' });
        }

        const todosAparelhos = db.prepare('SELECT * FROM aparelhos').all();
        const imeisDigitadosSet = new Set(imeis.map(i => String(i).trim()).filter(i => i.length > 0));

        const okList = [];
        const faltantesList = [];
        const invalidosList = new Set();
        const dbImeiMap = new Map();

        todosAparelhos.forEach(ap => {
            if (ap.imei) {
                dbImeiMap.set(ap.imei.trim(), ap);
            }
        });

        imeisDigitadosSet.forEach(imeiDigitado => {
            if (dbImeiMap.has(imeiDigitado)) {
                okList.push(dbImeiMap.get(imeiDigitado));
            } else {
                invalidosList.add(imeiDigitado);
            }
        });

        todosAparelhos.forEach(ap => {
            if (ap.imei && !imeisDigitadosSet.has(ap.imei.trim())) {
                faltantesList.push(ap);
            }
        });

        res.json({
            ok: okList,
            faltantes: faltantesList,
            invalidos: Array.from(invalidosList)
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao processar auditoria.' });
    }
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`Servidor a correr na porta ${PORT}`);
});