const express = require("express")
const {
  registerUser,
  loginUser,
  getConnections,
  getUserConnections,
  getConnectionById,
  createConnection,
  createUserConnection,
  updateConnection,
  deleteConnection,
  editConnection,
  getQr,
  stopQr,
  getPublicConnection, // Importar la nueva función
} = require("./handlers")
const { authenticateToken } = require("./functions")

const router = express.Router()

// Auth routes
router.post("/register", registerUser)
router.post("/login", loginUser)

// User profile route (protected)
router.get("/profile", authenticateToken, (req, res) => {
  // req.user contiene la información decodificada del token JWT
  res.json({
    success: true,
    message: "Perfil de usuario obtenido exitosamente",
    user: {
      id: req.user.id,
      email: req.user.email,
    },
  })
})

// Rutas de conexiones
router.get("/getConnections", authenticateToken, getUserConnections)
router.post("/createConnection", authenticateToken, createUserConnection)
router.get("/connection", authenticateToken, getConnectionById)
router.post("/editConnection", authenticateToken, editConnection)
router.get("/getQr", getQr) // Ruta para obtener QR
router.get("/stopQr", authenticateToken, stopQr) // Ruta para detener QR
router.get("/publicConnection", getPublicConnection) // Nueva ruta pública sin middleware de autenticación

// Connection routes (protected)
router.get("/connections", authenticateToken, getConnections)
router.post("/connections", authenticateToken, createConnection)
router.put("/connections/:id", authenticateToken, updateConnection)
router.delete("/connections/:id", authenticateToken, deleteConnection)

module.exports = router
