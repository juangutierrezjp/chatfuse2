const jwt = require("jsonwebtoken")
const crypto = require("crypto")
const util = require("util")

// Promisify crypto functions
const pbkdf2 = util.promisify(crypto.pbkdf2)
const randomBytes = util.promisify(crypto.randomBytes)

// Environment variables
const JWT_SECRET = process.env.JWT_SECRET || "chatfuse_secret_key"
const JWT_EXPIRATION = "24h"

// Constants for password hashing
const ITERATIONS = 1000 // Reducido para mejor rendimiento
const KEY_LENGTH = 64
const DIGEST = "sha512"
const SALT_LENGTH = 16

// Password hashing using native crypto (sin bcrypt)
const hashPassword = async (password) => {
  try {
    console.log("Iniciando hash de contraseña con crypto nativo")

    // Generar salt
    const salt = await randomBytes(SALT_LENGTH)
    console.log("Salt generado:", salt.toString("hex").substring(0, 10) + "...")

    // Hash password
    console.log("Generando hash...")
    const hash = await pbkdf2(password, salt, ITERATIONS, KEY_LENGTH, DIGEST)
    console.log("Hash generado:", hash.toString("hex").substring(0, 10) + "...")

    // Format: salt:hash (both hex encoded)
    const result = `${salt.toString("hex")}:${hash.toString("hex")}`
    console.log("Hash completo (formato):", result.substring(0, 20) + "...")

    return result
  } catch (error) {
    console.error("Error en hashPassword:", error)
    // Retornar un error más descriptivo
    throw new Error(`Error al hashear contraseña: ${error.message}`)
  }
}

// Compare password using native crypto
const comparePassword = async (password, hashedPassword) => {
  try {
    console.log("Comparando contraseñas con crypto nativo")

    // Split the stored hash into its components
    const [saltHex, hashHex] = hashedPassword.split(":")
    if (!saltHex || !hashHex) {
      console.error("Formato de contraseña hasheada inválido")
      return false
    }

    // Convert hex salt back to buffer
    const salt = Buffer.from(saltHex, "hex")
    console.log("Salt recuperado:", salt.toString("hex").substring(0, 10) + "...")

    // Hash the input password with the same salt
    console.log("Generando hash para comparación...")
    const inputHash = await pbkdf2(password, salt, ITERATIONS, KEY_LENGTH, DIGEST)
    console.log("Hash generado para comparación")

    // Compare the hashes
    const storedHash = Buffer.from(hashHex, "hex")

    // Comparación segura contra ataques de timing
    const result = crypto.timingSafeEqual(inputHash, storedHash)
    console.log("Resultado de comparación:", result)

    return result
  } catch (error) {
    console.error("Error en comparePassword:", error)
    return false
  }
}

// Modificar la función generateToken para asegurar que incluya el ID y el email
// JWT token generation
const generateToken = (payload) => {
  try {
    console.log("Generando token JWT con payload:", { ...payload, id: payload.id, email: payload.email })

    // Asegurarse de que el payload incluya id y email
    if (!payload.id || !payload.email) {
      throw new Error("El payload del token debe incluir id y email")
    }

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRATION })
    console.log("Token JWT generado exitosamente")
    return token
  } catch (error) {
    console.error("Error en generateToken:", error)
    throw new Error(`Error al generar token: ${error.message}`)
  }
}

// JWT token verification
const verifyToken = (token) => {
  try {
    console.log("Verificando token JWT")
    const decoded = jwt.verify(token, JWT_SECRET)
    console.log("Token JWT verificado")
    return decoded
  } catch (error) {
    console.error("Error en verifyToken:", error)
    return null
  }
}

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"]
  const token = authHeader && authHeader.split(" ")[1]

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Token de autenticación requerido",
    })
  }

  const decoded = verifyToken(token)
  if (!decoded) {
    return res.status(403).json({
      success: false,
      message: "Token inválido o expirado",
    })
  }

  req.user = decoded
  next()
}

module.exports = {
  hashPassword,
  comparePassword,
  generateToken,
  verifyToken,
  authenticateToken,
}
