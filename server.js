// server.js - Punto de entrada profesional
const express = require('express');
const app = express();
app.use(express.json());

// Simulador de Middleware de Seguridad (RBAC)
const authorize = (role) => (req, res, next) => {
    if (req.user.role !== role) return res.status(403).send("Acceso denegado");
    next();
};

// API: Obtener lección con lógica de Drip Content
app.get('/api/lessons/:id', (req, res) => {
    const { user } = req; // Obtenido del JWT
    // Lógica: Si el usuario no completó la lección anterior, no entregues esta
    if (!user.hasCompletedPrevious(req.params.id)) {
        return res.status(401).json({ error: "Contenido bloqueado: completa el hito anterior." });
    }
    res.json({ title: "British Pronunciation", content: "..." });
});

app.listen(3000, () => console.log('API Academy activa en puerto 3000'));