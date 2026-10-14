const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Inicializar banco de dados SQLite persistente
const db = new Database(path.join(__dirname, 'estoque.db'));

// Criar tabela de aparelhos caso não exista
db.prepare(`
    CREATE TABLE IF NOT EXISTS aparelhos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        marca TEXT NOT NULL,
        modelo TEXT NOT NULL,
        memoria TEXT NOT NULL,
        quantidade INTEGER NOT NULL,
        imei TEXT UNIQUE NOT NULL
    )
`).run();

app.use(express.json());
app.use(express.static(__dirname));

// Listar todos os aparelhos
app.get('/api/aparelhos', (req, res) => {
    try {
        const aparelhos = db.prepare('SELECT * FROM aparelhos').all();
        res.json(aparelhos);
    } catch (err) {
        res.status(500).json({ error: 'Erro ao buscar aparelhos.' });
    }
});

// Cadastrar ou Incrementar Aparelho
app.post('/api/aparelhos', (req, res) => {
    try {
        const { marca, modelo, memoria, imei } = req.body;
        if (!marca || !modelo || !memoria || !imei) {
            return res.status(400).json({ error: 'Preencha todos os campos.' });
        }

        // Verificar se o IMEI já existe
        const imeiExistente = db.prepare('SELECT * FROM aparelhos WHERE imei = ?').get(imei);
        if (imeiExistente) {
            return res.status(400).json({ error: 'Este IMEI já está registado no sistema!' });
        }

        // Verificar se já existe exatamente a mesma marca, modelo e memória para incrementar quantidade
        const aparelhoExistente = db.prepare(
            'SELECT * FROM aparelhos WHERE marca = ? AND modelo = ? AND memoria = ?'
        ).get(marca, modelo, memoria);

        if (aparelhoExistente) {
            // Atualiza a quantidade e insere o novo registo com o IMEI único
            db.prepare('UPDATE aparelhos SET quantidade = quantidade + 1 WHERE id = ?').run(aparelhoExistente.id);
            // Inserimos também na tabela para manter o IMEI individual para a baixa unitária
            db.prepare('INSERT INTO aparelhos (marca, modelo, memoria, quantidade, imei) VALUES (?, ?, ?, 1, ?)').run(marca, modelo, memoria, imei);
        } else {
            db.prepare('INSERT INTO aparelhos (marca, modelo, memoria, quantidade, imei) VALUES (?, ?, ?, 1, ?)').run(marca, modelo, memoria, imei);
        }

        res.json({ success: true, message: 'Aparelho registado com sucesso!' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao salvar aparelho.' });
    }
});

// Baixa Unitária por IMEI
app.delete('/api/aparelhos/imei/:imei', (req, res) => {
    try {
        const { imei } = req.params;
        const aparelho = db.prepare('SELECT * FROM aparelhos WHERE imei = ?').get(imei);

        if (!aparelho) {
            return res.status(404).json({ error: 'IMEI não encontrado no estoque.' });
        }

        // Remover o item exato com este IMEI
        db.prepare('DELETE FROM aparelhos WHERE imei = ?').run(imei);

        // Atualizar contagem dos irmãos com mesma marca, modelo e memória se houverem registos agrupados
        const irmaos = db.prepare('SELECT * FROM aparelhos WHERE marca = ? AND modelo = ? AND memoria = ?').all(aparelho.marca, aparelho.modelo, aparelho.memoria);
        
        if (irmaos.length > 0) {
            db.prepare('UPDATE aparelhos SET quantidade = ? WHERE marca = ? AND modelo = ? AND memoria = ?').run(irmaos.length, aparelho.marca, aparelho.modelo, aparelho.memoria);
        }

        res.json({ success: true, message: 'Baixa unitária realizada com sucesso!' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao dar baixa no aparelho.' });
    }
});

// Rota para auditoria EXTREMELY FAST
app.post('/api/auditoria', (req, res) => {
    try {
        const { imeis } = req.body;
        if (!Array.isArray(imeis)) {
            return res.status(400).json({ error: 'Formato inválido.' });
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

app.listen(PORT, () => {
    console.log(`Servidor a correr na porta ${PORT}`);
});