const http = require("http")
const { hashPassword, comparePassword, generateToken } = require("./functions")
const {
  createUser,
  findUserByEmail,
  findUserByPhone,
  getUserConnections: fetchUserConnections,
  insertConnection,
  updateConnectionById,
  deleteConnectionById,
  getConnectionById: fetchConnectionById,
} = require("./dbFunctions")

// Auth handlers
const registerUser = async (req, res) => {
  try {
    console.log("Register request received:", req.body)
    const { email, password, phone } = req.body

    if (!email || !password) {
      console.log("Missing required fields")
      return res.status(400).json({
        success: false,
        message: "Email y contraseña son requeridos",
      })
    }

    try {
      // Check if user already exists
      console.log("Checking if user exists")
      const existingUser = await findUserByEmail(email)
      if (existingUser) {
        console.log("User already exists")
        return res.status(409).json({
          success: false,
          message: "El usuario ya existe",
        })
      }

      // Hash password
      console.log("Hashing password")
      const hashedPassword = await hashPassword(password)
      console.log("Password hashed successfully")

      // Create user with default plan "0" and rol "user"
      console.log("Creating user")
      const newUser = await createUser({
        email,
        password: hashedPassword,
        phone,
        plan: "0",
        rol: "user",
      })
      console.log("User created successfully")

      // Generate token
      console.log("Generating token with user ID and email")
      const token = generateToken({
        id: newUser.id,
        email: newUser.email,
      })
      console.log("Token generated successfully with user ID and email")

      console.log("Registration successful")
      return res.status(201).json({
        success: true,
        message: "Usuario registrado exitosamente",
        token,
        user: {
          id: newUser.id,
          email: newUser.email,
          plan: newUser.plan,
          rol: newUser.rol,
        },
      })
    } catch (error) {
      console.error("Specific error in registration process:", error)
      // Si es un error específico de nuestras validaciones
      if (error.message && error.message.includes("ya está registrado")) {
        return res.status(409).json({
          success: false,
          message: error.message,
        })
      }
      // Para otros errores, enviar un 500
      return res.status(500).json({
        success: false,
        message: "Error al registrar usuario",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      })
    }
  } catch (error) {
    console.error("Error general en registro:", error)
    return res.status(500).json({
      success: false,
      message: "Error interno del servidor",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    })
  }
}

const loginUser = async (req, res) => {
  try {
    console.log("Login request received:", {
      email: req.body.email,
      phone: req.body.phone,
      passwordProvided: !!req.body.password,
    })

    const { email, phone, password } = req.body

    if ((!email && !phone) || !password) {
      console.log("Missing required fields")
      return res.status(400).json({
        success: false,
        message: "Email/teléfono y contraseña son requeridos",
      })
    }

    // Find user by email or phone
    let user
    if (email) {
      console.log("Finding user by email")
      user = await findUserByEmail(email)
    } else if (phone) {
      console.log("Finding user by phone")
      user = await findUserByPhone(phone)
    }

    if (!user) {
      console.log("User not found")
      // Cambiado de 401 a 404 para usuario no encontrado
      return res.status(404).json({
        success: false,
        message: "Usuario no encontrado",
      })
    }

    console.log("User found, comparing password")

    // Compare password
    const isPasswordValid = await comparePassword(password, user.password)

    if (!isPasswordValid) {
      console.log("Invalid password")
      // Cambiado de 401 a 403 para contraseña incorrecta
      return res.status(403).json({
        success: false,
        message: "Contraseña incorrecta",
      })
    }

    // Generate token
    console.log("Generating token with user ID and email")
    const token = generateToken({
      id: user.id,
      email: user.email,
    })
    console.log("Login successful, token includes user ID and email")

    return res.json({
      success: true,
      message: "Login exitoso",
      token,
      user: {
        id: user.id,
        email: user.email,
        plan: user.plan,
        rol: user.rol,
      },
    })
  } catch (error) {
    console.error("Error en login:", error)
    return res.status(500).json({
      success: false,
      message: "Error al iniciar sesión",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    })
  }
}

// Función auxiliar para obtener datos de la instancia
const fetchInstanceData = async (connectionId) => {
  try {
    console.log(`Fetching instance data for connection ID: ${connectionId}`)

    // Opciones para la petición HTTP
    const options = {
      hostname: "evolution_api",
      port: 8080,
      path: `/instance/fetchInstances?instanceName=${connectionId}`,
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        apikey: "juanpatest",
      },
    }

    // Crear la promesa para la petición HTTP
    return await new Promise((resolve, reject) => {
      const req = http.request(options, (res) => {
        let data = ""

        res.on("data", (chunk) => {
          data += chunk
        })

        res.on("end", () => {
          try {
            if (res.statusCode === 404) {
              resolve({
                statusCode: 404,
                data: null,
              })
            } else {
              const parsedData = JSON.parse(data)
              // Si los datos son un array, tomamos el primer elemento
              const instanceData = Array.isArray(parsedData) && parsedData.length > 0 ? parsedData[0] : parsedData

              resolve({
                statusCode: res.statusCode,
                data: instanceData,
              })
            }
          } catch (e) {
            console.error("Error parsing instance data:", e)
            resolve({
              statusCode: res.statusCode || 500,
              data: null,
              error: e.message,
            })
          }
        })
      })

      req.on("error", (error) => {
        console.error("Error fetching instance data:", error)
        // Resolver con null en lugar de rechazar para manejar el error de forma más elegante
        resolve({
          statusCode: 500,
          data: null,
          error: error.message,
        })
      })

      req.end()
    })
  } catch (error) {
    console.error("Error in fetchInstanceData:", error)
    return {
      statusCode: 500,
      data: null,
      error: error.message,
    }
  }
}

// Función para extraer el número de teléfono del ownerJid
const extractPhoneNumber = (ownerJid) => {
  if (!ownerJid) return null

  // Extraer todo lo que está antes del @
  const match = ownerJid.match(/^([^@]+)@/)
  return match ? match[1] : null
}

// Función para obtener el QR code
const fetchQRCode = async (id) => {
  try {
    console.log(`Fetching QR code for instance ID: ${id}`)

    // Opciones para la petición HTTP
    const options = {
      hostname: "evolution_api",
      port: 8080,
      path: `/instance/connect/${id}`,
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        apikey: "juanpatest",
      },
    }

    // Crear la promesa para la petición HTTP
    const response = await new Promise((resolve, reject) => {
      const req = http.request(options, (res) => {
        let data = ""

        res.on("data", (chunk) => {
          data += chunk
        })

        res.on("end", () => {
          try {
            if (res.statusCode === 200) {
              const parsedData = JSON.parse(data)
              resolve({
                statusCode: res.statusCode,
                data: parsedData,
              })
            } else {
              resolve({
                statusCode: res.statusCode,
                data: null,
                error: `Failed to fetch QR code: ${res.statusCode}`,
              })
            }
          } catch (e) {
            console.error("Error parsing QR code data:", e)
            resolve({
              statusCode: res.statusCode || 500,
              data: null,
              error: `Error parsing QR code data: ${e.message}`,
            })
          }
        })
      })

      req.on("error", (error) => {
        console.error("Error fetching QR code:", error)
        reject(error)
      })

      req.end()
    })

    if (response.statusCode === 200 && response.data && response.data.code) {
      return {
        status: "waiting",
        qr: response.data.code,
        type: 1,
        url: null,
      }
    } else {
      throw new Error(response.error || "Failed to fetch QR code")
    }
  } catch (error) {
    console.error("Error in fetchQRCode:", error)
    throw error
  }
}

// Handler para la ruta /getQr
const getQr = async (req, res) => {
  try {
    console.log("Get QR request received:", req.query)
    const { id, connect } = req.query

    // Validar que se proporcionó un ID
    if (!id) {
      console.log("Missing instance ID")
      return res.status(400).json({
        error: "Se requiere el parámetro id",
      })
    }

    // Opciones para la petición HTTP
    const options = {
      hostname: "evolution_api",
      port: 8080,
      path: `/instance/fetchInstances?instanceName=${id}`,
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        apikey: "juanpatest",
      },
    }

    // Crear la promesa para la petición HTTP
    const response = await new Promise((resolve, reject) => {
      const req = http.request(options, (res) => {
        let data = ""

        res.on("data", (chunk) => {
          data += chunk
        })

        res.on("end", () => {
          try {
            if (res.statusCode === 404) {
              resolve({
                statusCode: 404,
                data: null,
              })
            } else {
              const parsedData = JSON.parse(data)
              resolve({
                statusCode: res.statusCode,
                data: parsedData,
              })
            }
          } catch (e) {
            console.error("Error parsing instance data:", e)
            resolve({
              statusCode: res.statusCode || 500,
              data: null,
              error: e.message,
            })
          }
        })
      })

      req.on("error", (error) => {
        console.error("Error fetching instance data:", error)
        reject(error)
      })

      req.end()
    })

    // Manejar respuesta 404
    if (response.statusCode === 404) {
      console.log(`Instance with ID ${id} not found`)
      return res.status(200).json({
        error: "Interface no encontrada",
      })
    }

    // Verificar si hay datos y son un array
    if (Array.isArray(response.data) && response.data.length > 0) {
      const instance = response.data[0]
      console.log(`Instance status: ${instance.connectionStatus}`)

      switch (instance.connectionStatus) {
        // Fetch QR code for both 'connecting' and 'close' states
        case "connecting":
        case "close":
          if (connect === "true") {
            console.log(`Generating QR code for instance ${id}`)
            try {
              const qrData = await fetchQRCode(id)
              return res.json(qrData)
            } catch (qrError) {
              console.error("Error fetching QR code:", qrError)
              return res.status(500).json({
                error: "Error al generar el código QR",
              })
            }
          } else {
            console.log(`Returning close status for instance ${id}`)
            return res.json({
              status: "close",
              qr: null,
            })
          }

        case "open":
          // Instance is connected
          console.log(`Instance ${id} is connected, updating connection status to "connected"`)

          try {
            // Actualizar el estado de la conexión a "connected"
            await updateConnectionById(id, { status: "connected" })
            console.log(`Connection ${id} status updated to "connected"`)
          } catch (updateError) {
            console.error(`Error updating connection ${id} status:`, updateError)
            // Continuar incluso si hay un error en la actualización
          }

          return res.json({
            status: "ready",
            url: null,
          })

        default:
          // Return the instance data as is for other statuses
          console.log(`Returning instance data for status: ${instance.connectionStatus}`)
          return res.json(instance)
      }
    } else {
      console.log("Instance data not found or empty")
      return res.status(200).json({
        error: "Interface data not found",
      })
    }
  } catch (error) {
    console.error("Error al obtener QR:", error)
    return res.status(500).json({
      error: "Error interno del servidor",
    })
  }
}

// Nuevo handler para la ruta /connection?id=id
const getConnectionById = async (req, res) => {
  try {
    console.log("Get connection by ID request received")

    // Obtener el ID de la conexión desde los parámetros de consulta
    const connectionId = req.query.id

    // Validar que se proporcionó un ID
    if (!connectionId) {
      console.log("Missing connection ID")
      return res.status(400).json({
        success: false,
        message: "ID de conexión requerido",
      })
    }

    console.log(`Fetching connection with ID: ${connectionId}`)

    // Obtener la conexión de la base de datos
    const connection = await fetchConnectionById(connectionId)

    // Verificar si la conexión existe
    if (!connection) {
      console.log(`Connection with ID ${connectionId} not found`)
      return res.status(404).json({
        success: false,
        message: "Conexión no encontrada",
      })
    }

    // Verificar que la conexión pertenece al usuario autenticado
    const userId = req.user.id
    if (connection.userid !== userId) {
      console.log(`User ${userId} does not have permission to access connection ${connectionId}`)
      return res.status(403).json({
        success: false,
        message: "No tienes permiso para acceder a esta conexión",
      })
    }

    // Obtener datos adicionales de la instancia
    let instanceData = null
    try {
      const instanceResponse = await fetchInstanceData(connectionId)

      if (instanceResponse.statusCode === 200 && instanceResponse.data) {
        instanceData = instanceResponse.data
        console.log("Instance data received:", instanceData)
      }
    } catch (instanceError) {
      console.error("Error fetching instance data:", instanceError)
    }

    // Extraer el número de teléfono del ownerJid si existe
    const phoneNumber = instanceData && instanceData.ownerJid ? extractPhoneNumber(instanceData.ownerJid) : null

    // Combinar los datos de la conexión con los datos de la instancia
    const connectionWithInstanceData = {
      ...connection,
      qrCode: null, // Mantener qrCode como null por ahora
      qrStatus: instanceData ? instanceData.connectionStatus : "close",
      profilePicUrl: instanceData ? instanceData.profilePicUrl : null,
      phoneNumber: phoneNumber,
    }

    // Retornar los datos combinados
    return res.json({
      success: true,
      connection: connectionWithInstanceData,
    })
  } catch (error) {
    console.error("Error al obtener conexión por ID:", error)
    return res.status(500).json({
      success: false,
      message: "Error al obtener conexión",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    })
  }
}

// Handler para la ruta /editConnection
const editConnection = async (req, res) => {
  try {
    console.log("Edit connection request received")

    // Obtener el ID de la conexión desde los parámetros de consulta
    const connectionId = req.query.id

    // Validar que se proporcionó un ID
    if (!connectionId) {
      console.log("Missing connection ID")
      return res.status(400).json({
        success: false,
        message: "ID de conexión requerido",
      })
    }

    // Extraer el ID de usuario del token JWT
    const userId = req.user.id
    console.log(`User ${userId} attempting to edit connection ${connectionId}`)

    // Verificar que la conexión existe
    const connection = await fetchConnectionById(connectionId)
    if (!connection) {
      console.log(`Connection with ID ${connectionId} not found`)
      return res.status(404).json({
        success: false,
        message: "Conexión no encontrada",
      })
    }

    // Verificar que la conexión pertenece al usuario autenticado
    if (connection.userid !== userId) {
      console.log(`User ${userId} does not have permission to edit connection ${connectionId}`)
      return res.status(403).json({
        success: false,
        message: "No tienes permiso para editar esta conexión",
      })
    }

    // Obtener los campos a actualizar del body
    const updateData = {}
    const allowedFields = [
      "name",
      "type",
      "status",
      "webhook",
      "qrPrivacy",
      "customTitle",
      "customLogo",
      "customDescription",
    ]

    // Filtrar solo los campos permitidos que están presentes en el body
    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field]
      }
    })

    // Verificar que hay al menos un campo para actualizar
    if (Object.keys(updateData).length === 0) {
      console.log("No fields to update")
      return res.status(400).json({
        success: false,
        message: "No se proporcionaron campos para actualizar",
      })
    }

    console.log("Fields to update:", updateData)

    // Validar status si se está actualizando
    if (updateData.status && !["connected", "pause", "offline"].includes(updateData.status)) {
      return res.status(400).json({
        success: false,
        message: "Estado inválido. Valores permitidos: connected, pause, offline",
      })
    }

    // Validar qrPrivacy si se está actualizando
    if (updateData.qrPrivacy && !["public", "private"].includes(updateData.qrPrivacy)) {
      return res.status(400).json({
        success: false,
        message: "Valor de qrPrivacy inválido. Valores permitidos: public, private",
      })
    }

    // Actualizar la conexión
    const updatedConnection = await updateConnectionById(connectionId, updateData)

    // Retornar la conexión actualizada
    return res.json({
      success: true,
      message: "Conexión actualizada exitosamente",
      connection: updatedConnection,
    })
  } catch (error) {
    console.error("Error al editar conexión:", error)
    return res.status(500).json({
      success: false,
      message: "Error al editar conexión",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    })
  }
}

// Nuevo handler para la ruta /createConnection
const createUserConnection = async (req, res) => {
  try {
    console.log("Create connection request received:", req.body)
    const { name, type } = req.body

    // Extraer el ID de usuario del token JWT
    const userId = req.user.id
    console.log("Creating connection for user ID:", userId)

    // Validar campos requeridos
    if (!name || !type) {
      console.log("Missing required fields")
      return res.status(400).json({
        success: false,
        message: "Nombre y tipo son requeridos",
      })
    }

    // Validar que el tipo sea válido (opcional)
    const validTypes = ["whatsapp", "instagram", "telegram"] // Ajustar según tus necesidades
    if (!validTypes.includes(type)) {
      console.log("Invalid connection type:", type)
      return res.status(400).json({
        success: false,
        message: `Tipo de conexión inválido. Valores permitidos: ${validTypes.join(", ")}`,
      })
    }

    // Crear la conexión con valores por defecto
    const newConnection = await insertConnection({
      userid: userId,
      name,
      type,
      status: "offline", // Valor por defecto según lo solicitado
      webhook: "", // Vacío por defecto
      qrPrivacy: "private", // Valor por defecto según lo solicitado
      customTitle: "", // Vacío por defecto
      customLogo: "", // Vacío por defecto
      customDescription: "", // Vacío por defecto
    })

    console.log("Connection created successfully:", newConnection.id)

    // Hacer la petición POST a http://localhost:3000/work con el ID de la conexión
    try {
      console.log(`Making POST request to http://localhost:3000/work with connection ID: ${newConnection.id}`)

      // Preparar los datos para la petición
      const postData = JSON.stringify({
        id: newConnection.id.toString(),
      })

      // Opciones para la petición HTTP
      const options = {
        hostname: "localhost",
        port: 3000,
        path: "/work",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(postData),
        },
      }

      // Crear la promesa para la petición HTTP
      const workResponse = await new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
          let data = ""

          res.on("data", (chunk) => {
            data += chunk
          })

          res.on("end", () => {
            try {
              const parsedData = JSON.parse(data)
              resolve({
                statusCode: res.statusCode,
                data: parsedData,
              })
            } catch (e) {
              resolve({
                statusCode: res.statusCode,
                data: data,
              })
            }
          })
        })

        req.on("error", (error) => {
          console.error("Error making POST request:", error)
          reject(error)
        })

        // Escribir los datos en el cuerpo de la petición
        req.write(postData)
        req.end()
      })

      console.log("Work API response:", workResponse)

      // Verificar la respuesta de la API de trabajo
      if (workResponse.statusCode !== 200 || !workResponse.data.success) {
        console.error("Work API returned an error:", workResponse)
        return res.status(workResponse.statusCode || 500).json({
          success: false,
          message: "Error al crear la instancia de trabajo",
          error: workResponse.data,
        })
      }

      console.log("Work instance created successfully")
    } catch (workError) {
      console.error("Error creating work instance:", workError)
      return res.status(500).json({
        success: false,
        message: "Error al crear la instancia de trabajo",
        error: process.env.NODE_ENV === "development" ? workError.message : undefined,
      })
    }

    // Retornar la conexión creada
    return res.status(201).json({
      success: true,
      message: "Conexión creada exitosamente",
      connection: {
        id: newConnection.id,
        name: newConnection.name,
        type: newConnection.type,
        status: newConnection.status,
        qrPrivacy: newConnection.qrPrivacy,
      },
    })
  } catch (error) {
    console.error("Error al crear conexión:", error)
    return res.status(500).json({
      success: false,
      message: "Error al crear conexión",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    })
  }
}

// Handler para la ruta /getConnections
const getUserConnections = async (req, res) => {
  try {
    console.log("Get user connections request received")

    // Extraer el ID de usuario del token JWT (ya decodificado por el middleware authenticateToken)
    const userId = req.user.id
    console.log("Getting connections for user ID:", userId)

    // Obtener las conexiones del usuario
    const connections = await fetchUserConnections(userId)
    console.log(`Found ${connections.length} connections for user ID ${userId}`)

    // Si no hay conexiones, retornar un mensaje
    if (connections.length === 0) {
      return res.json({
        success: true,
        message: "No se encontraron conexiones para este usuario",
        connections: [],
      })
    }

    // Mapear las conexiones al formato requerido
    const formattedConnections = connections.map((conn) => ({
      id: conn.id,
      name: conn.name,
      type: conn.type,
      status: conn.status,
    }))

    // Retornar las conexiones
    return res.json({
      success: true,
      connections: formattedConnections,
    })
  } catch (error) {
    console.error("Error al obtener conexiones del usuario:", error)
    return res.status(500).json({
      success: false,
      message: "Error al obtener conexiones",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    })
  }
}

// Connection handlers
const getConnections = async (req, res) => {
  try {
    const userId = req.user.id
    const connections = await fetchUserConnections(userId)

    res.json({
      success: true,
      data: connections,
    })
  } catch (error) {
    console.error("Error al obtener conexiones:", error)
    res.status(500).json({
      success: false,
      message: "Error al obtener conexiones",
    })
  }
}

const createConnection = async (req, res) => {
  try {
    const userId = req.user.id
    const { name, type, webhook, qrPrivacy, customTitle, customLogo, customDescription } = req.body

    if (!name || !type) {
      return res.status(400).json({
        success: false,
        message: "Nombre y tipo son requeridos",
      })
    }

    const newConnection = await insertConnection({
      userid: userId,
      name,
      type,
      status: "inactive",
      webhook,
      qrPrivacy,
      customTitle,
      customLogo,
      customDescription,
    })

    res.status(201).json({
      success: true,
      message: "Conexión creada exitosamente",
      data: newConnection,
    })
  } catch (error) {
    console.error("Error al crear conexión:", error)
    res.status(500).json({
      success: false,
      message: "Error al crear conexión",
    })
  }
}

const updateConnection = async (req, res) => {
  try {
    const userId = req.user.id
    const connectionId = req.params.id
    const updateData = req.body

    // Verify connection exists and belongs to user
    const connection = await fetchConnectionById(connectionId)
    if (!connection) {
      return res.status(404).json({
        success: false,
        message: "Conexión no encontrada",
      })
    }

    if (connection.userid !== userId) {
      return res.status(403).json({
        success: false,
        message: "No tienes permiso para modificar esta conexión",
      })
    }

    // Validar status si se está actualizando
    if (updateData.status && !["connected", "pause", "offline"].includes(updateData.status)) {
      return res.status(400).json({
        success: false,
        message: "Estado inválido. Valores permitidos: connected, pause, offline",
      })
    }

    // Validar qrPrivacy si se está actualizando
    if (updateData.qrPrivacy && !["public", "private"].includes(updateData.qrPrivacy)) {
      return res.status(400).json({
        success: false,
        message: "Valor de qrPrivacy inválido. Valores permitidos: public, private",
      })
    }

    const updatedConnection = await updateConnectionById(connectionId, updateData)

    res.json({
      success: true,
      message: "Conexión actualizada exitosamente",
      data: updatedConnection,
    })
  } catch (error) {
    console.error("Error al actualizar conexión:", error)
    res.status(500).json({
      success: false,
      message: "Error al actualizar conexión",
    })
  }
}

const deleteConnection = async (req, res) => {
  try {
    const userId = req.user.id
    const connectionId = req.params.id

    // Verify connection exists and belongs to user
    const connection = await fetchConnectionById(connectionId)
    if (!connection) {
      return res.status(404).json({
        success: false,
        message: "Conexión no encontrada",
      })
    }

    if (connection.userid !== userId) {
      return res.status(403).json({
        success: false,
        message: "No tienes permiso para eliminar esta conexión",
      })
    }

    await deleteConnectionById(connectionId)

    res.json({
      success: true,
      message: "Conexión eliminada exitosamente",
    })
  } catch (error) {
    console.error("Error al eliminar conexión:", error)
    res.status(500).json({
      success: false,
      message: "Error al eliminar conexión",
    })
  }
}

// Handler para la ruta /stopQr
const stopQr = async (req, res) => {
  try {
    console.log("Stop QR request received:", req.query)
    const { id } = req.query

    // Validar que se proporcionó un ID
    if (!id) {
      console.log("Missing instance ID")
      return res.status(400).json({
        success: false,
        error: "Se requiere el parámetro id",
      })
    }

    // Verificar que la conexión existe y pertenece al usuario autenticado
    const connection = await fetchConnectionById(id)
    if (!connection) {
      console.log(`Connection with ID ${id} not found`)
      return res.status(404).json({
        success: false,
        message: "Conexión no encontrada",
      })
    }

    // Verificar que la conexión pertenece al usuario autenticado
    const userId = req.user.id
    if (connection.userid !== userId) {
      console.log(`User ${userId} does not have permission to stop QR for connection ${id}`)
      return res.status(403).json({
        success: false,
        message: "No tienes permiso para detener esta conexión",
      })
    }

    console.log(`Deleting instance with ID: ${id}`)

    // Paso 1: Eliminar la instancia existente
    const deleteOptions = {
      hostname: "evolution_api",
      port: 8080,
      path: `/instance/delete/${id}`,
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        apikey: "juanpatest",
      },
    }

    // Realizar la petición DELETE
    const deleteResponse = await new Promise((resolve, reject) => {
      const req = http.request(deleteOptions, (res) => {
        let data = ""

        res.on("data", (chunk) => {
          data += chunk
        })

        res.on("end", () => {
          try {
            if (data) {
              const parsedData = JSON.parse(data)
              resolve({
                statusCode: res.statusCode,
                data: parsedData,
              })
            } else {
              resolve({
                statusCode: res.statusCode,
                data: null,
              })
            }
          } catch (e) {
            console.error("Error parsing delete response:", e)
            resolve({
              statusCode: res.statusCode,
              data: null,
              error: e.message,
            })
          }
        })
      })

      req.on("error", (error) => {
        console.error("Error deleting instance:", error)
        reject(error)
      })

      req.end()
    })

    console.log("Delete response:", deleteResponse)

    // Actualizar el estado de la conexión a "offline"
    try {
      await updateConnectionById(id, { status: "offline" })
      console.log(`Connection ${id} status updated to "offline"`)
    } catch (updateError) {
      console.error(`Error updating connection ${id} status:`, updateError)
      // Continuar incluso si hay un error en la actualización
    }

    // Añadir un retraso para asegurar que la instancia se elimine completamente
    console.log("Waiting for instance to be fully deleted...")
    await new Promise((resolve) => setTimeout(resolve, 3000)) // Esperar 3 segundos

    // Paso 2: Recrear la interfaz
    console.log(`Recreating interface for connection ID: ${id}`)

    // Preparar los datos para la petición
    const postData = JSON.stringify({
      id: id.toString(),
    })

    // Opciones para la petición HTTP
    const workOptions = {
      hostname: "localhost",
      port: 3000,
      path: "/work",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(postData),
      },
    }

    // Crear la promesa para la petición HTTP
    const workResponse = await new Promise((resolve, reject) => {
      const req = http.request(workOptions, (res) => {
        let data = ""

        res.on("data", (chunk) => {
          data += chunk
        })

        res.on("end", () => {
          try {
            if (data) {
              const parsedData = JSON.parse(data)
              resolve({
                statusCode: res.statusCode,
                data: parsedData,
              })
            } else {
              resolve({
                statusCode: res.statusCode,
                data: null,
              })
            }
          } catch (e) {
            console.error("Error parsing work response:", e)
            resolve({
              statusCode: res.statusCode,
              data: data,
            })
          }
        })
      })

      req.on("error", (error) => {
        console.error("Error making POST request to work:", error)
        reject(error)
      })

      // Escribir los datos en el cuerpo de la petición
      req.write(postData)
      req.end()
    })

    console.log("Work API response:", workResponse)

    // Verificar la respuesta de la API de trabajo
    if (workResponse.statusCode !== 200 || !workResponse.data.success) {
      console.error("Work API returned an error:", workResponse)
      return res.status(workResponse.statusCode || 500).json({
        success: false,
        message: "Error al recrear la instancia de trabajo",
        error: workResponse.data,
      })
    }

    // Retornar respuesta exitosa
    return res.json({
      success: true,
      message: "Conexión detenida y recreada exitosamente",
    })
  } catch (error) {
    console.error("Error al detener QR:", error)
    return res.status(500).json({
      success: false,
      message: "Error al detener QR",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    })
  }
}

// Añadir esta nueva función al final del archivo, antes del module.exports

// Handler para la ruta pública /publicConnection
const getPublicConnection = async (req, res) => {
  try {
    console.log("Get public connection request received")

    // Confirmar que estamos obteniendo el ID desde req.query.id
    // En la función getPublicConnection:

    // Obtener el ID de la conexión desde los parámetros de consulta
    const connectionId = req.query.id

    // Validar que se proporcionó un ID
    if (!connectionId) {
      console.log("Missing connection ID")
      return res.status(400).json({
        success: false,
        message: "ID de conexión requerido",
      })
    }

    console.log(`Fetching public connection with ID: ${connectionId}`)

    // Obtener la conexión de la base de datos
    const connection = await fetchConnectionById(connectionId)

    // Verificar si la conexión existe
    if (!connection) {
      console.log(`Connection with ID ${connectionId} not found`)
      return res.status(404).json({
        success: false,
        message: "Conexión no encontrada",
      })
    }

    // Obtener datos adicionales de la instancia
    let instanceData = null
    try {
      const instanceResponse = await fetchInstanceData(connectionId)

      if (instanceResponse.statusCode === 200 && instanceResponse.data) {
        instanceData = instanceResponse.data
        console.log("Instance data received:", instanceData)
      }
    } catch (instanceError) {
      console.error("Error fetching instance data:", instanceError)
    }

    // Extraer el número de teléfono del ownerJid si existe
    const phoneNumber = instanceData && instanceData.ownerJid ? extractPhoneNumber(instanceData.ownerJid) : null

    // Crear el objeto de respuesta con el formato específico solicitado
    const connectionData = {
      id: connection.id,
      name: connection.name,
      type: connection.type,
      status: connection.status,
      qrPrivacy: connection.qrPrivacy,
      customTitle: connection.customTitle,
      customLogo: connection.customLogo,
      customDescription: connection.customDescription,
      qrStatus: instanceData ? instanceData.connectionStatus : "close",
      profilePicUrl: instanceData ? instanceData.profilePicUrl : null,
      phoneNumber: phoneNumber,
    }

    // Retornar los datos en el formato solicitado
    return res.json({
      success: true,
      connection: connectionData,
    })
  } catch (error) {
    console.error("Error al obtener conexión pública:", error)
    return res.status(500).json({
      success: false,
      message: "Error al obtener conexión",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    })
  }
}

// Actualizar el module.exports para incluir la nueva función
module.exports = {
  registerUser,
  loginUser,
  getUserConnections,
  getConnectionById,
  createUserConnection,
  editConnection,
  getQr,
  stopQr,
  getPublicConnection, // Añadir la nueva función
  getConnections,
  createConnection,
  updateConnection,
  deleteConnection,
}
