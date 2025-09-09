const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'hotel',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'password',
});

app.use(cors());
app.use(express.json());

let dbConnected = false;
pool.connect((err, client, release) => {
    if (err) {
        console.error('Error conectando a PostgreSQL:', err.message);
        dbConnected = false;
    } else {
        dbConnected = true;
        release();
    }
});

app.get('/api/test', (req, res) => {
    const response = {
        message: 'API funcionando correctamente',
        timestamp: new Date().toISOString(),
        server: 'Hotel',
        database: dbConnected ? 'Conectada' : 'Desconectada',
        port: port
    };
    res.json(response);
});

app.get('/api/estadisticas', async (req, res) => {
    try {
        if (!dbConnected) {
            throw new Error('Base de datos desconectada');
        }

        const testQuery = 'SELECT NOW() as current_time';
        const testResult = await pool.query(testQuery);
        
        const stats = {
            message: 'Estadísticas básicas',
            timestamp: new Date().toISOString(),
            database_time: testResult.rows[0].current_time,
            reservasMesActual: 0,
            porEstado: [],
            porHabitacion: []
        };
        
        res.json(stats);
        
    } catch (error) {
        res.status(500).json({ 
            error: 'Error obteniendo estadísticas: ' + error.message,
            timestamp: new Date().toISOString()
        });
    }
});

app.post('/api/reservas', async (req, res) => {
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

        if (!nombre || !apellido || !correo || !telefono || !fecha_entrada || !fecha_salida || !tipo_habitacion || !num_personas) {
            return res.status(400).json({ error: 'Todos los campos son obligatorios' });
        }

        const fechaEntrada = new Date(fecha_entrada);
        const fechaSalida = new Date(fecha_salida);
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);

        if (fechaEntrada < hoy) {
            return res.status(400).json({ error: 'La fecha de entrada no puede ser anterior a hoy' });
        }

        if (fechaSalida <= fechaEntrada) {
            return res.status(400).json({ error: 'La fecha de salida debe ser posterior a la fecha de entrada' });
        }

        const tableCheck = `
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'reservas'
            );
        `;
        const tableResult = await pool.query(tableCheck);
        
        if (!tableResult.rows[0].exists) {
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
        }

        const query = `
            INSERT INTO reservas (nombre, apellido, correo, telefono, fecha_entrada, fecha_salida, tipo_habitacion, num_personas)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
        `;

        const values = [nombre, apellido, correo, telefono, fecha_entrada, fecha_salida, tipo_habitacion, num_personas];
        const result = await pool.query(query, values);

        res.status(201).json({
            message: 'Reserva creada exitosamente',
            reserva: result.rows[0],
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        res.status(500).json({ 
            error: 'Error interno del servidor: ' + error.message,
            timestamp: new Date().toISOString()
        });
    }
});

app.get('/api/reservas', async (req, res) => {
    try {
        if (!dbConnected) {
            throw new Error('Base de datos no conectada');
        }

        const query = 'SELECT * FROM reservas ORDER BY fecha_creacion DESC';
        const result = await pool.query(query);
        res.json(result.rows);

    } catch (error) {
        res.status(500).json({ 
            error: 'Error obteniendo reservas: ' + error.message,
            timestamp: new Date().toISOString()
        });
    }
});

app.get('/api/reservas/correo/:email', async (req, res) => {
    try {
        if (!dbConnected) {
            throw new Error('Base de datos no conectada');
        }

        const { email } = req.params;
        const query = 'SELECT * FROM reservas WHERE correo = $1 ORDER BY fecha_creacion DESC';
        const result = await pool.query(query, [email]);
        res.json(result.rows);

    } catch (error) {
        res.status(500).json({ 
            error: 'Error obteniendo reservas: ' + error.message,
            timestamp: new Date().toISOString()
        });
    }
});

app.put('/api/reservas/:id', async (req, res) => {
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

        res.json({
            message: 'Reserva actualizada exitosamente',
            reserva: result.rows[0]
        });

    } catch (error) {
        res.status(500).json({ 
            error: 'Error actualizando reserva: ' + error.message,
            timestamp: new Date().toISOString()
        });
    }
});

app.delete('/api/reservas/:id', async (req, res) => {
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

        res.json({
            message: 'Reserva cancelada exitosamente',
            reserva: result.rows[0]
        });

    } catch (error) {
        res.status(500).json({ 
            error: 'Error cancelando reserva: ' + error.message,
            timestamp: new Date().toISOString()
        });
    }
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((req, res) => {
    res.status(404).json({ 
        error: `Ruta no encontrada: ${req.originalUrl}`,
        timestamp: new Date().toISOString()
    });
});

app.listen(port, () => {
    console.log(`\nSERVIDOR HOTEL COLOMBIA INICIADO`);

});