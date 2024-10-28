const express = require('express');
const router = express.Router();
const { originalDB, replicaDB } = require('../db'); // Conexiones a MySQL y PostgreSQL

// Middleware de autenticación
const isAuthenticated = (req, res, next) => {
    if (req.session.user) {
        return next();
    } else {
        res.redirect('/login');
    }
};

router.get('/',  (req, res) => {
    res.render('login');
}); 

// Ruta para el dashboard (requiere autenticación)
router.get('/dashboard', isAuthenticated, (req, res) => {
    res.render('dashboard', { clientes: [], message: null });
});

// Ruta para buscar cliente por DNI
// Ruta para buscar cliente por DNI
router.post('/buscar', async (req, res) => {
    const { dni } = req.body;

    try {
        // 1. Buscar en la base de datos PostgreSQL (Replica)
        const resultPostgre = await replicaDB.query('SELECT * FROM actualizaciones WHERE documento = $1', [dni]);

        if (resultPostgre.rows.length > 0) {
            // Si el cliente existe en PostgreSQL, mostrar los datos y los campos "nuevo"
            const cliente = resultPostgre.rows[0];
            return res.render('formulario', {
                cliente,
                editar: true,
                dni,
                message: `Este cliente ya ha sido modificado por la sucursal: ${cliente.sucursal}. Puedes actualizarlo si es necesario.`,
                mostrarCamposNuevos: true // Mostramos los campos para actualizar teléfono y email
            });
        }

        // 2. Si no está en PostgreSQL, buscar en la base de datos Plex (MySQL)
        originalDB.query('SELECT CodCliente, Nombre, Documento, Telefono, Email, Domicilio FROM clientes WHERE Documento = ?', [dni], (err, results) => {
            if (err) {
                console.error('Error al buscar en Plex:', err);
                return res.status(500).send('Error al buscar en Plex.');
            }

            if (results.length > 0) {
                // Si el cliente existe en Plex, rellenar el formulario con esos datos (sin campos "nuevo")
                const cliente = {
                    nombre: results[0].Nombre,
                    documento: results[0].Documento,
                    telefono: results[0].Telefono,
                    email: results[0].Email,
                    domicilio: results[0].Domicilio,
                    sucursal: '',  // No disponible en Plex, se deja vacío
                    telefononuevo: '',  // Se deja vacío
                    emailnuevo: ''  // Se deja vacío
                };
                return res.render('formulario', {
                    cliente,
                    editar: false,
                    dni,
                    message: null,
                    mostrarCamposNuevos: false // No mostramos los campos "nuevo"
                });
            }

            // 3. Si no está en PostgreSQL ni en Plex, mostrar formulario vacío sin campos "nuevo"
            return res.render('formulario', {
                cliente: {},
                editar: false,
                dni,
                message: null,
                mostrarCamposNuevos: false // No mostramos los campos "nuevo"
            });
        });
    } catch (error) {
        console.error('Error al buscar en PostgreSQL:', error);
        return res.status(500).send('Error al buscar en la base de datos.');
    }
});

module.exports = router;
// Ruta para guardar o actualizar datos
router.post('/guardar', isAuthenticated, async (req, res) => {
    const { dni, nombre, telefono, email, domicilio, sucursal, telefonoNuevo, emailNuevo, editar } = req.body;

    try {
        // Verificar si el cliente ya existe en PostgreSQL antes de decidir si se actualiza o se inserta
        const clienteExistente = await replicaDB.query(
            'SELECT * FROM actualizaciones WHERE Documento = $1', 
            [dni]
        );

        if (clienteExistente.rows.length > 0) {
            // Si el cliente ya existe, actualizar los datos en PostgreSQL
            await replicaDB.query(
                `UPDATE actualizaciones SET Nombre = $1, Telefono = $2, Email = $3, Domicilio = $4, Sucursal = $5, TelefonoNuevo = $6, EmailNuevo = $7, FechaModificacion = CURRENT_TIMESTAMP WHERE Documento = $8`,
                [nombre, telefono, email, domicilio, sucursal, telefonoNuevo, emailNuevo, dni]
            );
            res.redirect('/clients/dashboard?message=Datos actualizados correctamente');
        } else {
            // Si el cliente no existe, insertarlo en PostgreSQL
            await replicaDB.query(
                `INSERT INTO actualizaciones (Nombre, Documento, Telefono, Email, Domicilio, Sucursal, TelefonoNuevo, EmailNuevo) 
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [nombre, dni, telefono, email, domicilio, sucursal, telefonoNuevo, emailNuevo]
            );
            res.redirect('/clients/dashboard?message=Datos guardados correctamente');
        }
    } catch (err) {
        console.error('Error al guardar los datos', err);
        res.status(500).send('Error al guardar los datos.');
    }
});

module.exports = router;
