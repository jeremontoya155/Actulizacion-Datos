require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');

const app = express();

// Configuración de vistas y archivos estáticos
app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: false }));

// Configuración de sesión
app.use(session({
    secret: 'secret-key',
    resave: false,
    saveUninitialized: false,
}));

// Rutas
const authRoutes = require('./routes/auth');
const clientRoutes = require('./routes/clients');

app.use('/', authRoutes);
app.use('/clients', clientRoutes);

// Iniciar servidor
const PORT = process.env.PORT ;
app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
