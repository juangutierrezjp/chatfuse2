Preparación:
# Asegúrate de que los scripts tengan permisos de ejecución
chmod +x node_services/start-services.sh

# Crea los directorios necesarios si no existen
mkdir -p evolution_postgres evolution_instances evolution_store node_services/temp
# intenta instalar las dependencias antes de levantar el docker
npm install

# Construir y levantar los contenedores:
docker compose up --build

# Para ejecutar en segundo plano:
docker compose up -d --build

# Para verificar los logs:Ver todos los logs
docker compose logs -f

# Ver logs de un servicio específico
docker compose logs -f node_services


# Para detener los servicios:
docker compose down

# borrar cache
docker builder prune -f

# reconstruir la imagen
docker compose build --no-cache node_services