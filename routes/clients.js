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
router.post('/buscar', isAuthenticated, async (req, res) => {
    const dni = req.body.dni;  // Obtener el DNI del formulario

    try {
        // Verificar primero si el cliente ya está en la base interna (PostgreSQL)
        const clienteInterno = await replicaDB.query(
            'SELECT * FROM actualizaciones WHERE Documento = $1', 
            [dni]
        );

        if (clienteInterno.rows.length > 0) {
            // Si el cliente ya está en la base interna, mostrar el formulario con aviso y sus datos
            const cliente = clienteInterno.rows[0];
            return res.render('formulario', {
                cliente,  // Enviamos todos los datos del cliente para rellenar el formulario
                dni,
                editar: true,
                message: `Este cliente ya ha sido modificado por la sucursal: ${cliente.sucursal}. Puedes actualizarlo si es necesario.`
            });
        }

        // Si el cliente no está en la base interna, buscar en la base externa (MySQL)
        const query = 'SELECT CodCliente, Nombre, Documento, Telefono, Email, Domicilio FROM clientes WHERE Documento = ?';

        originalDB.query(query, [dni], (err, results) => {
            if (err) {
                console.error('Error al buscar el cliente en la base de datos externa', err);
                return res.status(500).send('Error al buscar el cliente en la base de datos externa.');
            }

            if (results.length > 0) {
                // Si se encuentra el cliente en la base externa, mostrar el formulario para editar
                const cliente = results[0];
                res.render('formulario', { cliente, dni, editar: true, message: null });
            } else {
                // Si no se encuentra el cliente, mostrar el formulario para cargar los datos
                res.render('formulario', { dni, cliente: {}, editar: false, message: null });
            }
        });
    } catch (err) {
        console.error('Error al buscar el cliente en la base de datos interna', err);
        res.status(500).send('Error al buscar el cliente en la base de datos interna.');
    }
});

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
