const express = require('express');
const router = express.Router();
const { originalDB, replicaDB } = require('../db'); // Conexiones a MySQL y PostgreSQL
const PDFDocument = require('pdfkit'); // Para generar PDFs
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process'); // Para ejecutar comandos del sistema

// Middleware de autenticación
const isAuthenticated = (req, res, next) => {
    if (req.session.user) {
        return next();
    } else {
        res.redirect('/login');
    }
};

// Ruta de inicio de sesión
router.get('/', (req, res) => {
    res.render('login');
});

// Ruta para el dashboard (requiere autenticación)
router.get('/dashboard', isAuthenticated, (req, res) => {
    res.render('dashboard', { clientes: [], message: req.query.message || null });
});

// Función para eliminar los archivos del día anterior
function eliminarArchivosAntiguos() {
    const dirPath = path.join(__dirname, '../public'); // Carpeta donde están los PDFs
    const ahora = new Date();
    const ayer = new Date(ahora.setDate(ahora.getDate() - 1)); // Fecha del día anterior

    fs.readdir(dirPath, (err, files) => {
        if (err) {
            console.error('Error al leer la carpeta:', err);
            return;
        }

        files.forEach(file => {
            const filePath = path.join(dirPath, file);
            fs.stat(filePath, (err, stats) => {
                if (err) {
                    console.error('Error al obtener la información del archivo:', err);
                    return;
                }

                const fileModDate = new Date(stats.mtime);
                if (fileModDate < ayer && file.endsWith('.pdf')) {
                    fs.unlink(filePath, (err) => {
                        if (err) {
                            console.error('Error al eliminar el archivo:', err);
                        } else {
                            console.log(`Archivo ${file} eliminado correctamente.`);
                        }
                    });
                }
            });
        });
    });
}

// Llamada a la función para eliminar archivos antiguos al iniciar
eliminarArchivosAntiguos();

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

// Función para generar PDF con los datos del cliente
function generarPDF(cliente, callback) {
    const doc = new PDFDocument();
    const filePath = path.join(__dirname, `../public/cliente_${cliente.documento}.pdf`);

    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    // Agregar contenido al PDF
    doc.fontSize(20).text('Datos del Cliente', { align: 'center' });
    doc.moveDown();
    doc.fontSize(14).text(`Nombre: ${cliente.nombre}`);
    doc.text(`DNI: ${cliente.documento}`);
    doc.text(`Teléfono: ${cliente.telefono}`);
    doc.text(`Email: ${cliente.email}`);
    doc.text(`Domicilio: ${cliente.domicilio}`);
    doc.text(`Sucursal: ${cliente.sucursal}`);
    doc.end();

    // Cuando el PDF ha sido generado y escrito en el sistema, llama al callback
    stream.on('finish', () => {
        callback(filePath); // Llama al callback con la ruta del archivo
    });
}

// Función para enviar el PDF a la impresora usando rundll32
function imprimirArchivo(filePath) {
    const absolutePath = `"${path.resolve(filePath)}"`; // Obtener la ruta absoluta del archivo PDF y ponerla entre comillas

    // Define el nombre de la impresora "Brother DCP-L5650DN series"
    const nombreImpresora = '"Brother DCP-L5650DN series"'; // Usa el nombre correcto de tu impresora

    // Ejecuta el comando rundll32 para imprimir el archivo en Windows
    if (process.platform === 'win32') {
        exec(`rundll32 printui.dll,PrintUIEntry /y /n ${nombreImpresora} && rundll32 shell32.dll,ShellExec_RunDLL ${absolutePath}`, (err, stdout, stderr) => {
            if (err) {
                console.error('Error al imprimir en Windows:', err);
                return;
            }
            console.log('Impresión enviada en Windows:', stdout);
        });
    } else if (process.platform === 'linux' || process.platform === 'darwin') {
        // Para Linux o macOS, usa `lp` (CUPS)
        exec(`lp ${absolutePath}`, (err, stdout, stderr) => {
            if (err) {
                console.error('Error al imprimir en Linux/macOS:', err);
                return;
            }
            console.log('Impresión enviada en Linux/macOS:', stdout);
        });
    } else {
        console.log('Sistema operativo no soportado para la impresión automática.');
    }
}

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
        } else {
            // Si el cliente no existe, insertarlo en PostgreSQL
            await replicaDB.query(
                `INSERT INTO actualizaciones (Nombre, Documento, Telefono, Email, Domicilio, Sucursal, TelefonoNuevo, EmailNuevo) 
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [nombre, dni, telefono, email, domicilio, sucursal, telefonoNuevo, emailNuevo]
            );
        }

        // Generar el PDF con los datos del cliente y luego enviarlo a imprimir
        generarPDF({ nombre, documento: dni, telefono, email, domicilio, sucursal }, (filePath) => {
            imprimirArchivo(filePath); // Imprimir el archivo generado
            res.redirect('/clients/dashboard?message=Datos guardados e impresos correctamente');
        });

    } catch (err) {
        console.error('Error al guardar los datos:', err);
        res.status(500).send('Error al guardar los datos.');
    }
});

module.exports = router;
