const { Pool } = require("pg")

// Database configuration
const dbConfig = {
  user: process.env.POSTGRES_USER || "postgres",
  password: process.env.POSTGRES_PASSWORD || "123456juan",
  host: process.env.POSTGRES_HOST || "evolution_postgres",
  port: process.env.POSTGRES_PORT || 5432,
  database: process.env.POSTGRES_DB || "chatfusedata",
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // How long a client is allowed to remain idle before being closed
  connectionTimeoutMillis: 2000, // How long to wait for a connection
}

// Create a connection pool
let pool

// Reemplazar la función initializeDbPool actual con esta versión mejorada
const initializeDbPool = () => {
  try {
    console.log("Initializing database connection pool with config:", {
      ...dbConfig,
      password: "********", // No mostrar la contraseña en los logs
    })

    pool = new Pool(dbConfig)

    // Test the connection
    pool.query("SELECT NOW()", (err, res) => {
      if (err) {
        console.error("Error connecting to the database:", err)
      } else {
        console.log("Database connected successfully at:", res.rows[0].now)
      }
    })

    // Error handling for the pool
    pool.on("error", (err) => {
      console.error("Unexpected error on idle client", err)
      // No salir del proceso, solo registrar el error
      // process.exit(-1);
    })

    return pool
  } catch (error) {
    console.error("Error initializing database pool:", error)
    throw error
  }
}

// Helper function to execute queries
const query = async (text, params) => {
  const client = await pool.connect()
  try {
    console.log("Executing query:", text, "with params:", params)
    const result = await client.query(text, params)
    return result
  } catch (error) {
    console.error("Database query error:", error)
    throw error // Re-throw the error after logging it
  } finally {
    client.release()
    console.log("Database client released")
  }
}

// User functions
const createUser = async (userData) => {
  const { email, password, phone, plan, rol } = userData

  try {
    console.log("Creating user with email:", email)
    const result = await query(
      "INSERT INTO users (email, password, phone, plan, rol) VALUES ($1, $2, $3, $4, $5) RETURNING id, email, plan, rol",
      [email, password, phone || null, plan, rol],
    )

    console.log("User created successfully")
    return result.rows[0]
  } catch (error) {
    console.error("Error creating user:", error.message)
    // Verificar si es un error de duplicado (código 23505)
    if (error.code === "23505") {
      if (error.constraint.includes("email")) {
        throw new Error("El email ya está registrado")
      } else if (error.constraint.includes("phone")) {
        throw new Error("El teléfono ya está registrado")
      }
    }
    throw error
  }
}

const findUserByEmail = async (email) => {
  const result = await query("SELECT * FROM users WHERE email = $1", [email])

  return result.rows[0]
}

const findUserByPhone = async (phone) => {
  const result = await query("SELECT * FROM users WHERE phone = $1", [phone])

  return result.rows[0]
}

// Connection functions
const getUserConnections = async (userId) => {
  try {
    console.log(`Fetching connections for user ID: ${userId}`)
    const result = await query(
      "SELECT id, name, type, status FROM connections WHERE userid = $1 ORDER BY created_at DESC",
      [userId],
    )
    console.log(`Found ${result.rows.length} connections`)
    return result.rows
  } catch (error) {
    console.error(`Error fetching connections for user ID ${userId}:`, error)
    throw error
  }
}

// Modificar la función getConnectionById para usar los nombres de columnas correctos
const getConnectionById = async (connectionId) => {
  try {
    console.log(`Fetching connection with ID: ${connectionId}`)
    const result = await query(
      `SELECT id, userid, name, type, status, webhook, qrprivacy, 
      customtitle, customlogo, customdescription 
      FROM connections WHERE id = $1`,
      [connectionId],
    )

    if (result.rows.length === 0) {
      console.log(`No connection found with ID: ${connectionId}`)
      return null
    }

    // Convertir los nombres de las columnas a camelCase para mantener la consistencia en la API
    const connection = result.rows[0]
    const formattedConnection = {
      id: connection.id,
      userid: connection.userid,
      name: connection.name,
      type: connection.type,
      status: connection.status,
      webhook: connection.webhook,
      qrPrivacy: connection.qrprivacy,
      customTitle: connection.customtitle,
      customLogo: connection.customlogo,
      customDescription: connection.customdescription,
    }

    console.log(`Connection found: ${formattedConnection.id}`)
    return formattedConnection
  } catch (error) {
    console.error(`Error fetching connection with ID ${connectionId}:`, error)
    throw error
  }
}

const insertConnection = async (connectionData) => {
  try {
    const {
      userid,
      name,
      type,
      status = "offline", // Valor por defecto
      webhook = "",
      qrPrivacy = "private", // Valor por defecto
      customTitle = "",
      customLogo = "",
      customDescription = "",
    } = connectionData

    console.log("Inserting new connection:", {
      userid,
      name,
      type,
      status,
      qrPrivacy,
    })

    // Validar status
    if (!["connected", "pause", "offline"].includes(status)) {
      throw new Error("Estado inválido. Valores permitidos: connected, pause, offline")
    }

    // Validar qrPrivacy
    if (!["public", "private"].includes(qrPrivacy)) {
      throw new Error("Valor de qrPrivacy inválido. Valores permitidos: public, private")
    }

    // Usar los nombres de columnas en minúsculas sin comillas dobles
    const result = await query(
      `INSERT INTO connections 
       (userid, name, type, status, webhook, qrprivacy, customtitle, customlogo, customdescription) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
       RETURNING *`,
      [userid, name, type, status, webhook, qrPrivacy, customTitle, customLogo, customDescription],
    )

    // Convertir los nombres de las columnas a camelCase para mantener la consistencia en la API
    const connection = result.rows[0]
    const formattedConnection = {
      id: connection.id,
      userid: connection.userid,
      name: connection.name,
      type: connection.type,
      status: connection.status,
      webhook: connection.webhook,
      qrPrivacy: connection.qrprivacy,
      customTitle: connection.customtitle,
      customLogo: connection.customlogo,
      customDescription: connection.customdescription,
    }

    console.log("Connection inserted successfully with ID:", formattedConnection.id)
    return formattedConnection
  } catch (error) {
    console.error("Error inserting connection:", error)
    throw error
  }
}

// Corregir la función updateConnectionById
const updateConnectionById = async (connectionId, updateData) => {
  // Build dynamic query based on provided fields
  const keys = Object.keys(updateData)
  const values = Object.values(updateData)

  // Skip update if no fields provided
  if (keys.length === 0) {
    return getConnectionById(connectionId)
  }

  try {
    // Convertir los nombres de las propiedades de camelCase a minúsculas para la base de datos
    const dbKeys = keys.map((key) => {
      if (key === "qrPrivacy") return "qrprivacy"
      if (key === "customTitle") return "customtitle"
      if (key === "customLogo") return "customlogo"
      if (key === "customDescription") return "customdescription"
      return key
    })

    // Build SET clause - Usar $n para los parámetros
    const setClauses = dbKeys.map((key, index) => `${key} = $${index + 2}`)
    const setClause = setClauses.join(", ")

    // Add updated_at timestamp
    const queryText = `
      UPDATE connections 
      SET ${setClause}, updated_at = CURRENT_TIMESTAMP 
      WHERE id = $1 
      RETURNING *
    `

    console.log("Executing update query:", queryText, "with params:", [connectionId, ...values])
    const result = await query(queryText, [connectionId, ...values])

    // Convertir los nombres de las columnas a camelCase para mantener la consistencia en la API
    const connection = result.rows[0]
    const formattedConnection = {
      id: connection.id,
      userid: connection.userid,
      name: connection.name,
      type: connection.type,
      status: connection.status,
      webhook: connection.webhook,
      qrPrivacy: connection.qrprivacy,
      customTitle: connection.customtitle,
      customLogo: connection.customlogo,
      customDescription: connection.customdescription,
    }

    return formattedConnection
  } catch (error) {
    console.error("Error updating connection:", error)
    throw error
  }
}

const deleteConnectionById = async (connectionId) => {
  await query("DELETE FROM connections WHERE id = $1", [connectionId])

  return true
}

module.exports = {
  initializeDbPool,
  createUser,
  findUserByEmail,
  findUserByPhone,
  getUserConnections,
  getConnectionById,
  insertConnection,
  updateConnectionById,
  deleteConnectionById,
}
