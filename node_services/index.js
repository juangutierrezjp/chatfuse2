require("dotenv").config()
const express = require("express")
const cors = require("cors")
const routes = require("./routes")
const { initializeDbPool } = require("./dbFunctions")
const jwt = require("jsonwebtoken") // Importa jsonwebtoken

const app = express()
const PORT = process.env.PORT || 3010

// Middleware
app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Initialize database connection pool
try {
  initializeDbPool()
} catch (error) {
  console.error("Failed to initialize database pool:", error)
  process.exit(1)
}

// Routes
app.use("/api", routes)

// Agregar una ruta para verificar el token y mostrar su contenido (útil para pruebas)
// Después de la línea: app.use("/api", routes)

// Ruta para verificar el contenido de un token JWT (solo en desarrollo)
if (process.env.NODE_ENV === "development") {
  app.get("/verify-token", (req, res) => {
    const authHeader = req.headers["authorization"]
    const token = authHeader && authHeader.split(" ")[1]

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Token no proporcionado",
      })
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || "chatfuse_secret_key")
      return res.json({
        success: true,
        message: "Token válido",
        decoded,
      })
    } catch (error) {
      return res.status(403).json({
        success: false,
        message: "Token inválido",
        error: error.message,
      })
    }
  })
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Express error handler:", err)

  // Evitar enviar respuesta si ya se ha enviado una
  if (res.headersSent) {
    return next(err)
  }

  res.status(500).json({
    success: false,
    message: "Error interno del servidor",
    error: process.env.NODE_ENV === "development" ? err.message : undefined,
  })
})

// Manejo de promesas no capturadas
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason)
  // No cerramos el servidor, solo registramos el error
})

// Manejo de excepciones no capturadas
process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error)
  // No cerramos el servidor inmediatamente para permitir que se completen las solicitudes en curso
  setTimeout(() => {
    process.exit(1)
  }, 1000)
})

// Start server
app.listen(PORT, () => {
  console.log(`Servidor ChatFuse ejecutándose en el puerto ${PORT}`)
})
