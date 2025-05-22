const express = require("express")
const cors = require("cors")
const fetch = require("node-fetch")

const app = express()
const MASTER_PORT = 3000
const evolutionapi = "http://evolution_api:8080" // Base URL for Evolution API
//const evolutionapi = "http://localhost:8080" // Base URL for Evolution API

// Configure CORS to allow requests from any origin
app.use(
  cors({
    origin: "*", // This allows all origins
  }),
)

app.use(express.json())

// Middleware to log all requests
app.use((req, res, next) => {
  console.log(`Petición a la ruta "${req.path}"`)
  next()
})

// Route to create and start a new process
app.post("/work", async (req, res) => {
  const { id  } = req.body

  if (!id ) {
    return res.status(400).json({ error: "Se requieren los parámetros id y room_key" })
  }

  try {
    const response = await fetch(`${evolutionapi}/instance/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: "juanpatest",
      },
      body: JSON.stringify({
        instanceName: id.toString(), // Convert id to string
        webhook: {
          url: `https://apiwpp.somostuia.com/queue`,
          webhook_by_events: true,
          webhook_base64: true,
          base64:true,
          events: ["MESSAGES_UPSERT", "QRCODE_UPDATED", "CONNECTION_UPDATE"],
        },
        qrcode: false,
        integration: "WHATSAPP-BAILEYS",
        reject_call: false,
        groups_ignore: false,
      }),
    })

    if (response.ok) {
      const data = await response.json()
      res.json({ success: true, message: "Instance created successfully", data })
    } else {
      const errorData = await response.json()
      res.status(response.status).json({ success: false, error: errorData.error || "Error creating instance" })
    }
  } catch (error) {
    console.error("Error al crear la instancia:", error)
    res.status(500).json({ success: false, error: "Error interno del servidor" })
  }
})

// Route to update interface flow
app.post("/updateInterfaceFlow", async (req, res) => {
  const { id, type, url } = req.body

  if (!id || (type === undefined && url === undefined)) {
    return res.status(400).json({ error: "Se requiere id y al menos type o url" })
  }

  try {
    // Step 1: Get existing webhook URL
    const findResponse = await fetch(`${evolutionapi}/webhook/find/${id}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        apikey: "juanpatest",
      },
    })

    if (!findResponse.ok) {
      throw new Error("Failed to fetch existing webhook")
    }

    const webhookData = await findResponse.json()
    const existingUrl = new URL(webhookData.url)
    const roomKey = existingUrl.searchParams.get("roomKey")

    // Step 2: Compose new URL
    const newUrl = new URL("https://apiwpp.somostuia.com/queue")
    newUrl.searchParams.set("roomKey", roomKey)
    newUrl.searchParams.set("type", type !== undefined ? type.toString() : existingUrl.searchParams.get("type"))
    newUrl.searchParams.set("url", url === "" ? "null" : url !== undefined ? url : existingUrl.searchParams.get("url"))

    // Step 3: Update webhook
    const updateResponse = await fetch(`${evolutionapi}/webhook/set/${id}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: "juanpatest",
      },
      body: JSON.stringify({
        webhook: {
          enabled: true,
          events: ["MESSAGES_UPSERT"],
          url: newUrl.toString(),
        },
      }),
    })

    if (updateResponse.ok) {
      res.json({ success: true, message: "Webhook updated successfully" })
    } else {
      const errorData = await updateResponse.json()
      res.status(updateResponse.status).json({ success: false, error: errorData.error || "Error updating webhook" })
    }
  } catch (error) {
    console.error("Error al actualizar el webhook:", error)
    res.status(500).json({ success: false, error: "Error interno del servidor" })
  }
})

// Function to fetch QR code
async function fetchQRCode(id) {
  const qrResponse = await fetch(`${evolutionapi}/instance/connect/${id}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      apikey: "juanpatest",
    },
  })

  if (qrResponse.ok) {
    const qrData = await qrResponse.json()
    return {
      status: "waiting",
      qr: qrData.code,
      type: 1,
      url: null,
    }
  } else {
    throw new Error("Failed to fetch QR code")
  }
}

// Route to get QR
app.get("/getqr", async (req, res) => {
  const { id, connect } = req.query

  if (!id ) {
    return res.status(400).json({ error: "Se requiere el parámetro id" })
  }

  try {
    const response = await fetch(`${evolutionapi}/instance/fetchInstances?instanceName=${id}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        apikey: "juanpatest",
      },
    })

    if (response.status === 404) {
      return res.status(200).json({ error: "Interface no encontrada" })
    }

    const data = await response.json()

    if (Array.isArray(data) && data.length > 0) {
      const instance = data[0]
      switch (instance.connectionStatus) {
        // Fetch QR code for both 'connecting' and 'close' states
        case "connecting":
        case "close":
          if(connect){
            return res.json(await fetchQRCode(id))

          }else{
            return res.json({
              status: "close",
              qr: null,
            })
          }
          
        case "open":
          // Instance is connected
          return res.json({
            status: "ready", 
            url: null,
          })

        default:
          // Return the instance data as is for other statuses
          return res.json(instance)
      }
    } else {
      return res.status(200).json({ error: "Interface data not found" })
    }
  } catch (error) {
    console.error("Error al obtener QR:", error)
    res.status(500).json({ error: "Error interno del servidor" })
  }
})

// Route to delete interface
app.delete("/deleteInterface", async (req, res) => {
  const { id } = req.body

  if (!id) {
    return res.status(400).json({ error: "Se requiere el parámetro id en el cuerpo de la solicitud" })
  }

  try {
    const response = await fetch(`${evolutionapi}/instance/delete/${id}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        apikey: "juanpatest",
      },
    })

    if (response.ok) {
      return res.json({ success: true, message: `Interface ${id} eliminada correctamente` })
    } else {
      const errorData = await response.json()
      return res
        .status(response.status)
        .json({ success: false, error: errorData.error || "Error al eliminar la interface" })
    }
  } catch (error) {
    console.error("Error al eliminar la interface:", error)
    res.status(500).json({ success: false, error: "Error interno del servidor" })
  }
})

// Start the main server
app.listen(MASTER_PORT, () => {
  console.log(`Master Service listening on port ${MASTER_PORT}`)
})

