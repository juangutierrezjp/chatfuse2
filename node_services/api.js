const express = require("express")
const cors = require("cors")
const axios = require("axios")
const fs = require("fs")
const path = require("path")

const app = express()
const PORT = 3001

// Configuración base para las peticiones
const BASE_URL = "http://evolution_api:8080"
const API_KEY = "juanpatest"
const { initializeDbPool, getConnectionById } = require("./dbFunctions")

app.use(express.json({ limit: "100mb" }))
app.use(express.urlencoded({ limit: "100mb", extended: true }))

initializeDbPool() 
console.log(`[API] Iniciando servidor API en el puerto ${PORT}`)

// Habilitar CORS para todas las rutas
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
)

// Asegurar que la carpeta 'temp' exista
const tempDir = path.join(__dirname, "temp")
if (!fs.existsSync(tempDir)) {
  console.log("[API] Creando carpeta temporal")
  fs.mkdirSync(tempDir)
}

// Función para eliminar un archivo después de 2 horas
function deleteFileAfterDelay(filePath) {
  const TWO_HOURS = 2 * 60 * 60 * 1000 // 2 horas en milisegundos
  setTimeout(() => {
    fs.unlink(filePath, (err) => {
      if (err) {
        console.error(`[API] Error al eliminar el archivo ${filePath}:`, err)
      } else {
        console.log(`[API] Archivo eliminado: ${filePath}`)
      }
    })
  }, TWO_HOURS)
}

// Función para procesar el número de teléfono o ID de grupo
function processPhoneNumber(from) {
  if (from.endsWith("@g.us")) {
    return from // Devolver el ID del grupo sin cambios
  } else {
    // Quitar '@s.whatsapp.net' y añadir '+' al principio
    return "+" + from.split("@")[0]
  }
}

// Función para extraer el body según el tipo de mensaje
function extractMessageBody(data) {
  if (data.message) {
    switch (data.messageType) {
      case "conversation":
        return data.message.conversation || ""
      case "imageMessage":
        return data.message.imageMessage?.caption || ""
      case "videoMessage":
        return data.message.videoMessage?.caption || ""
      case "documentMessage":
        return data.message.documentMessage?.caption || ""
      case "audioMessage":
        return "" // Audio messages don't have a caption
      default:
        return ""
    }
  }
  return ""
}

// Función actualizada SaveBase64
function SaveBase64(base64Data, remoteJid, messageType, messageData) {
  try {
    const timestamp = Date.now()
    const cleanRemoteJid = remoteJid.split("@")[0]
    let extension = ""
    let fileName = ""

    switch (messageType) {
      case "imageMessage":
        extension = ".jpg"
        fileName = `${timestamp}_${cleanRemoteJid}${extension}`
        break
      case "videoMessage":
        extension = ".mp4"
        fileName = `${timestamp}_${cleanRemoteJid}${extension}`
        break
      case "audioMessage":
        extension = ".ogg"
        fileName = `${timestamp}_${cleanRemoteJid}${extension}`
        break
      case "documentMessage":
        if (messageData.message.documentMessage && messageData.message.documentMessage.fileName) {
          const originalFileName = messageData.message.documentMessage.fileName
          const originalName = path.parse(originalFileName).name
          extension = path.extname(originalFileName) || ".bin"
          fileName = `${originalName}-${timestamp}-${cleanRemoteJid}${extension}`
        } else {
          extension = ".bin"
          fileName = `documento-${timestamp}-${cleanRemoteJid}${extension}`
        }
        break
      default:
        extension = ".bin"
        fileName = `${timestamp}_${cleanRemoteJid}${extension}`
    }

    const filePath = path.join(tempDir, fileName)

    // Eliminar el prefijo de datos de la cadena base64 si existe
    const base64Content = base64Data.replace(/^data:.*?;base64,/, "")

    fs.writeFileSync(filePath, base64Content, "base64")
    console.log(`[API] Archivo guardado: ${filePath}`)

    // Programar la eliminación del archivo después de 2 horas
    deleteFileAfterDelay(filePath)

    return fileName
  } catch (error) {
    console.error("[API] Error al guardar el archivo base64:", error)
    return null
  }
}

// Función auxiliar para enviar mensajes multimedia
async function sendMediaMessage(instance, number, mediatype, caption, media) {
  try {
    const response = await axios.post(
      `${BASE_URL}/message/sendMedia/${instance}`,
      {
        number: number,
        mediatype: mediatype,
        caption: caption,
        media: media,
      },
      {
        headers: {
          apikey: API_KEY,
        },
      },
    )
    console.log(`[API] Mensaje multimedia (${mediatype}) enviado exitosamente:`, response.data)
    return response.data
  } catch (error) {
    console.error(`[API] Error al enviar mensaje multimedia (${mediatype}):`, error)
    throw error
  }
}

// Función auxiliar para enviar mensajes de texto
async function sendTextMessage(instance, number, text) {
  try {
    const response = await axios.post(
      `${BASE_URL}/message/sendText/${instance}`,
      {
        number: number,
        text: text,
      },
      {
        headers: {
          apikey: API_KEY,
        },
      },
    )
    console.log("[API] Mensaje de texto enviado exitosamente:", response.data)
    return response.data
  } catch (error) {
    console.error("[API] Error al enviar mensaje de texto:", error)
    throw error
  }
}

// Función auxiliar para enviar mensajes de audio
async function sendAudioMessage(instance, number, audio) {
  try {
    const response = await axios.post(
      `${BASE_URL}/message/sendWhatsAppAudio/${instance}`,
      {
        number: number,
        audio: audio,
      },
      {
        headers: {
          apikey: API_KEY,
        },
      },
    )
    console.log("[API] Mensaje de audio enviado exitosamente:", response.data)
    return response.data
  } catch (error) {
    console.error("[API] Error al enviar mensaje de audio:", error)
    throw error
  }
}

app.post("/queue", async (req, res) => {
  console.log("[API] Recibida solicitud POST en /queue")
  try {
    const type = "2"
    //const { roomKey, type, url } = req.query
    const { instance, data, sender } = req.body

    const interfaceId = instance
    const from = processPhoneNumber(data.key.remoteJid)
    const messageType = data.messageType
    const messageBody = extractMessageBody(data)

    console.log(
      `[API] Procesando mensaje para interfaz ${interfaceId}, tipo: ${type}, de: ${from}, messageType: ${messageType}`,
    )

    let savedFilePath = null
    if (messageType !== "conversation") {
      savedFilePath = SaveBase64(data.message.base64, data.key.remoteJid, messageType, data)
    }

    // Manejar el tipo de interfaz
    switch (type) {
      case "0":
        console.log("[API] Procesando interfaz tipo 0")

        // Manejar diferentes tipos de mensajes multimedia
        if (messageType === "imageMessage" || messageType === "videoMessage" || messageType === "documentMessage") {
          console.log(`[API] Procesando mensaje de ${messageType}`)
          let mediaCaption, mediaType

          switch (messageType) {
            case "imageMessage":
              mediaCaption = data.message.imageMessage?.caption || ""
              mediaType = "image"
              break
            case "videoMessage":
              mediaCaption = data.message.videoMessage?.caption || ""
              mediaType = "video"
              break
            case "documentMessage":
              mediaCaption = data.message.documentMessage?.caption || ""
              mediaType = "document"
              break
          }

          if (savedFilePath) {
            await sendMediaMessage(instance, from, mediaType, mediaCaption, savedFilePath)
          } else {
            console.error(`[API] Error: No se pudo guardar el archivo para el mensaje de ${mediaType}`)
          }
        } else if (messageType === "audioMessage") {
          console.log("[API] Procesando mensaje de audio")
          if (savedFilePath) {
            await sendAudioMessage(instance, from, savedFilePath)
          } else {
            console.error("[API] Error: No se pudo guardar el archivo de audio")
          }
        } else {
          // Mantener el comportamiento existente para mensajes de texto
          let message = `Mensaje recibido de ${from}:`
          if (messageBody) {
            message += ` ${messageBody}`
          }
          await sendTextMessage(instance, from, message)
        }
        break

      case "1":
        console.log("[API] Procesando interfaz tipo 1")
        if (messageType !== "conversation") {
          console.log("[API] Rechazando mensaje multimedia para interfaz tipo 1")
          await sendTextMessage(instance, from, "Lo siento, actualmente no puedo entender archivos multimedia.")
        } else {
          try {
            console.log("[API] Enviando solicitud a la API externa")
            const response = await axios.post(
              "https://l.somostuia.com/n8n/session/prompt/stream",
              {
                phoneFrom: from,
                roomKey: roomKey,
                text: messageBody,
              },
              {
                headers: {
                  "x-api-key": "8fK#9xL!32D$wPq@Yt7*Gh&Zv1Jd_4Q",
                },
              },
            )

            console.log("[API] Respuesta recibida de la API externa")
            await sendTextMessage(instance, from, response.data)
          } catch (error) {
            console.error("[API] Error al obtener respuesta de la API externa:", error)
            await sendTextMessage(
              instance,
              from,
              "Lo siento, ha ocurrido un error al procesar tu mensaje. Por favor, intenta de nuevo más tarde.",
            )
          }
        }
        break

        case "2":
          console.log("[API] Procesando interfaz tipo 2")
          
          let webhookUrl = null
          try {
            // Obtener los detalles de la conexión, incluyendo el webhook
            const connection = await getConnectionById(interfaceId)
            webhookUrl = connection ? connection.webhook : null
            
            console.log(`[API] Webhook URL obtenido para la interfaz ${interfaceId}: ${webhookUrl || 'No configurado'}`)
          } catch (dbError) {
            console.error(`[API] Error al obtener webhook para la interfaz ${interfaceId}:`, dbError)
          }
          
          const messageData = {
            interfaceId,
            type: messageType,
            path: savedFilePath || null,
            body: messageBody,
            number: from,
          }
        
          if (!webhookUrl || webhookUrl === "") {
            console.log("[API] URL de webhook no válida. Mostrando datos que se enviarían en la petición:")
            console.log(JSON.stringify(messageData, null, 2))
          } else {
            try {
              console.log(`[API] Enviando mensaje a ${webhookUrl}`)
              const response = await axios.post(webhookUrl, messageData)
              console.log(`[API] Respuesta de la interfaz ${interfaceId}:`, response.data)
            } catch (error) {
              console.error(`[API] Error al enviar mensaje a la interfaz ${interfaceId}:`, error)
            }
          }
          break
          
      default:
        console.log(`[API] Tipo de interfaz no manejado: ${type}`)
    }

    res.status(200).json({ message: "Mensaje procesado correctamente" })
  } catch (error) {
    console.error("[API] Error al procesar el mensaje:", error)
    res.status(500).json({ error: "Error interno del servidor" })
  }
})

app.post("/sendResponse", async (req, res) => {
  console.log("[API] Recibida solicitud POST en /sendResponse")
  try {
    const { interfaceId, type, path, body, number } = req.body

    // Verificar que los campos requeridos estén presentes
    if (!interfaceId || !type || !number) {
      return res.status(400).json({ error: "Faltan campos requeridos: interfaceId, type y number son obligatorios" })
    }

    console.log(`[API] Procesando respuesta para interfaz ${interfaceId}, tipo: ${type}, para: ${number}`)

    let response
    switch (type) {
      case "videoMessage":
      case "imageMessage":
        if (!path) {
          return res.status(400).json({ error: "El campo 'path' es requerido para mensajes de video e imagen" })
        }
        response = await sendMediaMessage(interfaceId, number, type === "videoMessage" ? "video" : "image", body, path)
        break
      case "audioMessage":
        if (!path) {
          return res.status(400).json({ error: "El campo 'path' es requerido para mensajes de audio" })
        }
        response = await sendAudioMessage(interfaceId, number, path)
        break
      case "conversation":
        if (!body) {
          return res.status(400).json({ error: "El campo 'body' es requerido para mensajes de texto" })
        }
        response = await sendTextMessage(interfaceId, number, body)
        break
      default:
        return res.status(400).json({ error: "Tipo de mensaje no válido" })
    }

    res.status(200).json({ message: "Respuesta enviada correctamente", data: response })
  } catch (error) {
    console.error("[API] Error al procesar la respuesta:", error)
    res.status(500).json({ error: "Error interno del servidor" })
  }
})

// Nueva ruta GET para obtener archivos
app.get("/getFile", (req, res) => {
  console.log("[API] Recibida solicitud GET en /getFile")
  const { fileName } = req.query

  if (!fileName) {
    return res.status(400).json({ error: "El parámetro 'fileName' es requerido" })
  }

  const filePath = path.join(tempDir, fileName)

  fs.access(filePath, fs.constants.F_OK, (err) => {
    if (err) {
      console.error(`[API] Error: El archivo ${fileName} no existe`)
      return res.status(404).json({ error: "Archivo no encontrado" })
    }

    res.sendFile(filePath, (err) => {
      if (err) {
        console.error(`[API] Error al enviar el archivo ${fileName}:`, err)
        return res.status(500).json({ error: "Error al enviar el archivo" })
      }
      console.log(`[API] Archivo ${fileName} enviado correctamente`)
    })
  })
})

app.listen(PORT, () => {
  console.log(`[API] Servidor API corriendo en http://localhost:${PORT}`)
})

