const express = require('express');
const router = express.Router();
const { replicaDB } = require('../db'); // Importar desde db.js

// Ruta de inicio de sesión
router.get('/login', (req, res) => {
    res.render('login', { error: null });
});

router.get('/', (req, res) => {
    res.render('login', { error: null });
});

router.post('/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        // Validar las credenciales en la base de datos
        const result = await replicaDB.query('SELECT * FROM users WHERE username = $1 AND password = $2', [username, password]);
        
        if (result.rows.length > 0) {
            req.session.user = { username };
            return res.redirect('/clients/dashboard');
        } else {
            return res.render('login', { error: 'Usuario o contraseña incorrectos' });
        }
    } catch (err) {
        console.error('Error en la consulta', err);
        res.status(500).send('Error en el servidor');
    }
});

// Ruta para cerrar sesión
router.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/login');
    });
});

module.exports = router;
