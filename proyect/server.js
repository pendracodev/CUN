const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Configuración de PostgreSQL
const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'hotel_colombia',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'password',
});

// CORS
app.use(cors());

// Middleware para parsear JSON
app.use(express.json());

// Middleware de logging ANTES de las rutas
app.use((req, res, next) => {
    console.log(`\n📍 ${new Date().toISOString()} - ${req.method} ${req.url}`);
    console.log('📋 Headers:', req.headers['content-type']);
    if (req.body && Object.keys(req.body).length > 0) {
        console.log('📦 Body:', req.body);
    }
    next();
});

// Test de conexión a la base de datos
let dbConnected = false;
pool.connect((err, client, release) => {
    if (err) {
        console.error('❌ Error conectando a PostgreSQL:', err.message);
        dbConnected = false;
    } else {
        console.log('✅ Conexión exitosa a PostgreSQL');
        dbConnected = true;
        release();
    }
});

// ================== RUTAS API (ANTES DE STATIC) ==================

// Ruta de prueba - SIEMPRE debe funcionar
app.get('/api/test', (req, res) => {
    console.log('🧪 Ejecutando ruta /api/test');
    
    const response = {
        message: 'API funcionando correctamente',
        timestamp: new Date().toISOString(),
        server: 'Hotel Colombia',
        database: dbConnected ? 'Conectada' : 'Desconectada',
        port: port
    };
    
    console.log('✅ Enviando respuesta test:', response);
    res.json(response);
});

// Estadísticas (versión simple para debug)
app.get('/api/estadisticas', async (req, res) => {
    console.log('📊 Ejecutando ruta /api/estadisticas');
    
    try {
        if (!dbConnected) {
            throw new Error('Base de datos desconectada');
        }

        // Consulta simple para verificar conexión
        const testQuery = 'SELECT NOW() as current_time';
        const testResult = await pool.query(testQuery);
        
        const stats = {
            message: 'Estadísticas básicas',
            timestamp: new Date().toISOString(),
            database_time: testResult.rows[0].current_time,
            reservasMesActual: 0, // Por ahora en 0 para evitar errores
            porEstado: [],
            porHabitacion: []
        };
        
        console.log('✅ Enviando estadísticas:', stats);
        res.json(stats);
        
    } catch (error) {
        console.error('❌ Error en estadísticas:', error.message);
        res.status(500).json({ 
            error: 'Error obteniendo estadísticas: ' + error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Crear nueva reserva
app.post('/api/reservas', async (req, res) => {
    console.log('📝 Ejecutando POST /api/reservas');
    
    try {
        if (!dbConnected) {
            throw new Error('Base de datos no conectada');
        }

        const {
            nombre,
            apellido,
            correo,
            telefono,
            fecha_entrada,
            fecha_salida,
            tipo_habitacion,
            num_personas
        } = req.body;

        console.log('📋 Validando datos...');

        // Validaciones básicas
        if (!nombre || !apellido || !correo || !telefono || !fecha_entrada || !fecha_salida || !tipo_habitacion || !num_personas) {
            const error = 'Todos los campos son obligatorios';
            console.log('❌ Validación fallida:', error);
            return res.status(400).json({ error });
        }

        // Validar fechas
        const fechaEntrada = new Date(fecha_entrada);
        const fechaSalida = new Date(fecha_salida);
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);

        if (fechaEntrada < hoy) {
            const error = 'La fecha de entrada no puede ser anterior a hoy';
            console.log('❌ Error de fecha:', error);
            return res.status(400).json({ error });
        }

        if (fechaSalida <= fechaEntrada) {
            const error = 'La fecha de salida debe ser posterior a la fecha de entrada';
            console.log('❌ Error de fecha:', error);
            return res.status(400).json({ error });
        }

        console.log('✅ Validaciones pasadas, insertando en BD...');

        // Verificar si la tabla existe
        const tableCheck = `
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'reservas'
            );
        `;
        const tableResult = await pool.query(tableCheck);
        
        if (!tableResult.rows[0].exists) {
            console.log('📋 Tabla reservas no existe, creándola...');
            
            const createTable = `
                CREATE TABLE IF NOT EXISTS reservas (
                    id SERIAL PRIMARY KEY,
                    nombre VARCHAR(100) NOT NULL,
                    apellido VARCHAR(100) NOT NULL,
                    correo VARCHAR(255) NOT NULL,
                    telefono VARCHAR(20) NOT NULL,
                    fecha_entrada DATE NOT NULL,
                    fecha_salida DATE NOT NULL,
                    tipo_habitacion VARCHAR(50) NOT NULL,
                    num_personas INTEGER NOT NULL,
                    estado VARCHAR(20) DEFAULT 'activa',
                    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `;
            
            await pool.query(createTable);
            console.log('✅ Tabla reservas creada');
        }

        const query = `
            INSERT INTO reservas (nombre, apellido, correo, telefono, fecha_entrada, fecha_salida, tipo_habitacion, num_personas)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
        `;

        const values = [nombre, apellido, correo, telefono, fecha_entrada, fecha_salida, tipo_habitacion, num_personas];
        const result = await pool.query(query, values);

        console.log('✅ Reserva creada exitosamente:', result.rows[0]);

        res.status(201).json({
            message: 'Reserva creada exitosamente',
            reserva: result.rows[0],
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Error creando reserva:', error);
        res.status(500).json({ 
            error: 'Error interno del servidor: ' + error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Obtener todas las reservas
app.get('/api/reservas', async (req, res) => {
    console.log('📋 Ejecutando GET /api/reservas');
    
    try {
        if (!dbConnected) {
            throw new Error('Base de datos no conectada');
        }

        const query = 'SELECT * FROM reservas ORDER BY fecha_creacion DESC';
        const result = await pool.query(query);

        console.log(`✅ Encontradas ${result.rows.length} reservas`);
        res.json(result.rows);

    } catch (error) {
        console.error('❌ Error obteniendo reservas:', error);
        res.status(500).json({ 
            error: 'Error obteniendo reservas: ' + error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Obtener reservas por correo
app.get('/api/reservas/correo/:email', async (req, res) => {
    console.log('📧 Ejecutando GET /api/reservas/correo/:email');
    
    try {
        if (!dbConnected) {
            throw new Error('Base de datos no conectada');
        }

        const { email } = req.params;
        const query = 'SELECT * FROM reservas WHERE correo = $1 ORDER BY fecha_creacion DESC';
        const result = await pool.query(query, [email]);

        console.log(`✅ Encontradas ${result.rows.length} reservas para ${email}`);
        res.json(result.rows);

    } catch (error) {
        console.error('❌ Error obteniendo reservas por correo:', error);
        res.status(500).json({ 
            error: 'Error obteniendo reservas: ' + error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Actualizar estado de reserva
app.put('/api/reservas/:id', async (req, res) => {
    console.log('📝 Ejecutando PUT /api/reservas/:id');
    
    try {
        if (!dbConnected) {
            throw new Error('Base de datos no conectada');
        }

        const { id } = req.params;
        const { estado } = req.body;

        if (!estado) {
            return res.status(400).json({ error: 'Estado es requerido' });
        }

        const query = 'UPDATE reservas SET estado = $1 WHERE id = $2 RETURNING *';
        const result = await pool.query(query, [estado, id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Reserva no encontrada' });
        }

        console.log(`✅ Reserva ${id} actualizada a estado: ${estado}`);
        res.json({
            message: 'Reserva actualizada exitosamente',
            reserva: result.rows[0]
        });

    } catch (error) {
        console.error('❌ Error actualizando reserva:', error);
        res.status(500).json({ 
            error: 'Error actualizando reserva: ' + error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Cancelar (eliminar) reserva
app.delete('/api/reservas/:id', async (req, res) => {
    console.log('🗑️ Ejecutando DELETE /api/reservas/:id');
    
    try {
        if (!dbConnected) {
            throw new Error('Base de datos no conectada');
        }

        const { id } = req.params;
        const query = 'UPDATE reservas SET estado = $1 WHERE id = $2 RETURNING *';
        const result = await pool.query(query, ['cancelada', id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Reserva no encontrada' });
        }

        console.log(`✅ Reserva ${id} cancelada`);
        res.json({
            message: 'Reserva cancelada exitosamente',
            reserva: result.rows[0]
        });

    } catch (error) {
        console.error('❌ Error cancelando reserva:', error);
        res.status(500).json({ 
            error: 'Error cancelando reserva: ' + error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// ================== ARCHIVOS ESTÁTICOS (DESPUÉS DE API) ==================
app.use(express.static(path.join(__dirname, 'public')));

// Ruta principal - servir index.html
app.get('/', (req, res) => {
    console.log('🏠 Sirviendo página principal');
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Middleware para rutas no encontradas (debe ir al final)
// CORREGIDO: Cambiamos '*' por una función que capture todas las rutas
app.use((req, res) => {
    console.log('❓ Ruta no encontrada:', req.originalUrl);
    res.status(404).json({ 
        error: `Ruta no encontrada: ${req.originalUrl}`,
        timestamp: new Date().toISOString(),
        availableRoutes: [
            'GET /',
            'GET /api/test',
            'GET /api/estadisticas',
            'GET /api/reservas',
            'GET /api/reservas/correo/:email',
            'POST /api/reservas',
            'PUT /api/reservas/:id',
            'DELETE /api/reservas/:id'
        ]
    });
});

// Iniciar servidor
app.listen(port, () => {
    console.log(`\n🚀 ======================================`);
    console.log(`   SERVIDOR HOTEL COLOMBIA INICIADO`);
    console.log(`🚀 ======================================`);
    console.log(`📍 URL Principal: http://localhost:${port}`);
    console.log(`🧪 Test API: http://localhost:${port}/api/test`);
    console.log(`📁 Archivos: ${path.join(__dirname, 'public')}`);
    console.log(`🔗 Base de datos: ${dbConnected ? '✅ Conectada' : '❌ Desconectada'}`);
    console.log(`🚀 ======================================\n`);
});