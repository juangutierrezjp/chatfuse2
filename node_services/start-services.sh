#!/bin/sh

# Esperar a que PostgreSQL esté listo
echo "Esperando a que PostgreSQL esté listo..."
until PGPASSWORD=123456juan psql -h postgres -U postgres -c '\q'; do
  echo "PostgreSQL no está disponible aún - esperando..."
  sleep 2
done

# Inicializar la base de datos con el schema
echo "Inicializando la base de datos..."
PGPASSWORD=123456juan psql -h postgres -U postgres -f schema.sql

# Iniciar los tres servicios en paralelo
echo "Iniciando servicios Node.js..."
node master.js &
MASTER_PID=$!

node api.js &
API_PID=$!

node index.js &
INDEX_PID=$!

# Función para manejar señales y terminar los procesos hijos correctamente
handle_sigterm() {
  echo "Recibida señal SIGTERM, terminando procesos..."
  kill -TERM $MASTER_PID $API_PID $INDEX_PID 2>/dev/null
  wait
  exit 0
}

# Capturar SIGTERM para terminar correctamente los procesos hijos
trap handle_sigterm SIGTERM

# Esperar a que cualquiera de los procesos termine
wait -n

# Si cualquier proceso termina, terminar todos
echo "Un proceso ha terminado, finalizando todos los servicios..."
kill -TERM $MASTER_PID $API_PID $INDEX_PID 2>/dev/null
exit 1