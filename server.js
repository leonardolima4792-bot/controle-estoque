const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(__dirname));

const dbPath = path.join(__dirname, 'database.db');
const db = new Database(dbPath);

db.prepare(`CREATE TABLE IF NOT EXISTS aparelhos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    marca TEXT NOT NULL,
    modelo TEXT NOT NULL,
    memoria TEXT NOT NULL,
    quantidade INTEGER NOT NULL,
    imei TEXT UNIQUE NOT NULL
)`).run();

app.post('/api/login', (req, res) => {
    const { usuario, senha } = req.body;
    if (usuario === 'admin' && senha === '1234') {
        res.json({ success: true, message: 'Login realizado com sucesso!' });
    } else {
        res.status(401).json({ success: false, message: 'Usuário ou senha incorretos!' });
    }
});

app.get('/api/aparelhos', (req, res) => {
    try {
        const aparelhos = db.prepare(`SELECT * FROM aparelhos`).all();
        res.json(aparelhos);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/aparelhos', (req, res) => {
    const { marca, modelo, memoria, imei } = req.body;
    
    if (!marca || !modelo || !memoria || !imei) {
        return res.status(400).json({ success: false, message: 'Preencha todos os campos!' });
    }

    try {
        const imeiExiste = db.prepare(`SELECT * FROM aparelhos WHERE imei = ?`).get(imei);
        if (imeiExiste) {
            return res.status(400).json({ success: false, message: 'Este número de IMEI já está cadastrado!' });
        }

        const existente = db.prepare(`SELECT * FROM aparelhos WHERE marca = ? AND modelo = ? AND memoria = ?`).get(marca, modelo, memoria);

        if (existente) {
            db.prepare(`UPDATE aparelhos SET quantidade = quantidade + 1 WHERE id = ?`).run(existente.id);
            return res.json({ 
                success: true, 
                message: `Adicionado mais um celular da marca ${marca} e modelo ${modelo} (${memoria})!` 
            });
        } else {
            db.prepare(`INSERT INTO aparelhos (marca, modelo, memoria, quantidade, imei) VALUES (?, ?, ?, 1, ?)`).run(marca, modelo, memoria, imei);
            return res.json({ 
                success: true, 
                message: `Novo aparelho cadastrado: ${marca} ${modelo} (${memoria})!` 
            });
        }
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.delete('/api/aparelhos/:imei', (req, res) => {
    const imei = req.params.imei;

    try {
        const item = db.prepare(`SELECT * FROM aparelhos WHERE imei = ?`).get(imei);

        if (!item) {
            return res.status(404).json({ success: false, message: 'Aparelho não encontrado!' });
        }

        if (item.quantidade > 1) {
            db.prepare(`UPDATE aparelhos SET quantidade = quantidade - 1 WHERE imei = ?`).run(imei);
            res.json({ success: true, message: `Baixa realizada! Restam ${item.quantidade - 1} unidades.` });
        } else {
            db.prepare(`DELETE FROM aparelhos WHERE imei = ?`).run(imei);
            res.json({ success: true, message: 'Última unidade vendida! Aparelho removido.' });
        }
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`Servidor na porta ${PORT}`);
});