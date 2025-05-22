const crypto = require("crypto")
const util = require("util")

// Promisify crypto functions
const pbkdf2 = util.promisify(crypto.pbkdf2)
const randomBytes = util.promisify(crypto.randomBytes)

// Constants
const ITERATIONS = 10000
const KEY_LENGTH = 64
const DIGEST = "sha512"
const SALT_LENGTH = 16

/**
 * Hash a password using PBKDF2
 * @param {string} password - The password to hash
 * @returns {Promise<string>} - The hashed password in format: salt:hash
 */
const hashPassword = async (password) => {
  try {
    console.log("Iniciando hash de contraseña con crypto")
    const salt = await randomBytes(SALT_LENGTH)
    console.log("Salt generado")

    const hash = await pbkdf2(password, salt, ITERATIONS, KEY_LENGTH, DIGEST)

    console.log("Hash completado")
    // Format: salt:hash (both base64 encoded)
    return `${salt.toString("base64")}:${hash.toString("base64")}`
  } catch (error) {
    console.error("Error en hashPassword (crypto):", error)
    throw new Error(`Error al hashear contraseña: ${error.message}`)
  }
}

/**
 * Compare a password with a hashed password
 * @param {string} password - The password to check
 * @param {string} hashedPassword - The hashed password in format: salt:hash
 * @returns {Promise<boolean>} - True if the password matches, false otherwise
 */
const comparePassword = async (password, hashedPassword) => {
  try {
    console.log("Comparando contraseñas con crypto")

    // Split the stored hash into its components
    const [saltBase64, hashBase64] = hashedPassword.split(":")
    if (!saltBase64 || !hashBase64) {
      console.error("Formato de contraseña hasheada inválido")
      return false
    }

    // Convert base64 salt back to buffer
    const salt = Buffer.from(saltBase64, "base64")

    // Hash the input password with the same salt
    const inputHash = await pbkdf2(password, salt, ITERATIONS, KEY_LENGTH, DIGEST)

    // Compare the hashes
    const storedHash = Buffer.from(hashBase64, "base64")
    const result = crypto.timingSafeEqual(inputHash, storedHash)

    console.log("Comparación completada")
    return result
  } catch (error) {
    console.error("Error en comparePassword (crypto):", error)
    return false
  }
}

module.exports = {
  hashPassword,
  comparePassword,
}
