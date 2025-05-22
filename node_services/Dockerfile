FROM node:18-alpine

WORKDIR /app

# Instalar dependencias del sistema
RUN apk add --no-cache postgresql-client

# Copiar archivos de configuración primero para aprovechar la caché de capas
COPY package*.json ./

# Instalar dependencias
RUN npm install

# Copiar el código fuente
COPY . .

# Exponer puertos
EXPOSE 3000 3001 3010

CMD ["sh", "./start-services.sh"]