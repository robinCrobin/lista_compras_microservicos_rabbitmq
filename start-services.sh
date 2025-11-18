#!/bin/bash

# Script para iniciar todos os microsserviços automaticamente
# Uso: ./start-services.sh

echo "======================================"
echo "Iniciando Microsserviços..."
echo "======================================"

# Função para verificar se uma porta está em uso
check_port() {
    if lsof -Pi :$1 -sTCP:LISTEN -t >/dev/null ; then
        echo "Porta $1 já está em uso. Matando processo..."
        kill -9 $(lsof -ti:$1) 2>/dev/null || true
        sleep 2
    fi
}

# Verificar e limpar portas
echo "Verificando portas..."
check_port 3000  # API Gateway
check_port 3001  # User Service
check_port 3002  # List Service
check_port 3003  # Item Service

# Criar diretório de logs se não existir
mkdir -p logs

echo "Iniciando serviços..."

# 1. Iniciar User Service
echo "Iniciando User Service (porta 3001)..."
cd service/user-service
node server.js > ../../logs/user-service.log 2>&1 &
USER_PID=$!
echo "User Service iniciado (PID: $USER_PID)"
cd ../..

# Aguardar 2 segundos
sleep 2

# 2. Iniciar Item Service
echo "Iniciando Item Service (porta 3003)..."
cd service/item-service
node server.js > ../../logs/item-service.log 2>&1 &
ITEM_PID=$!
echo "Item Service iniciado (PID: $ITEM_PID)"
cd ../..

# Aguardar 2 segundos
sleep 2

# 3. Iniciar List Service
echo "Iniciando List Service (porta 3002)..."
cd service/list-service
node server.js > ../../logs/list-service.log 2>&1 &
LIST_PID=$!
echo "List Service iniciado (PID: $LIST_PID)"
cd ../..

# Aguardar 3 segundos para os serviços se registrarem
sleep 3

# 4. Iniciar API Gateway
echo "Iniciando API Gateway (porta 3000)..."
cd api-gateway
node server.js > ../logs/api-gateway.log 2>&1 &
GATEWAY_PID=$!
echo "API Gateway iniciado (PID: $GATEWAY_PID)"
cd ..

# Aguardar 3 segundos
sleep 3

echo ""
echo "======================================"
echo "Todos os serviços foram iniciados!"
echo "======================================"
echo "PIDs dos processos:"
echo "  User Service: $USER_PID"
echo "  Item Service: $ITEM_PID"
echo "  List Service: $LIST_PID"
echo "  API Gateway: $GATEWAY_PID"
echo ""
echo "URLs dos serviços:"
echo "  API Gateway: http://localhost:3000"
echo "  User Service: http://localhost:3001"
echo "  List Service: http://localhost:3002"
echo "  Item Service: http://localhost:3003"
echo ""
echo "Health checks:"
echo "  API Gateway: http://localhost:3000/health"
echo "  User Service: http://localhost:3001/health"
echo "  List Service: http://localhost:3002/health"
echo "  Item Service: http://localhost:3003/health"
echo ""
echo "Logs disponíveis em:"
echo "  logs/api-gateway.log"
echo "  logs/user-service.log"
echo "  logs/list-service.log"
echo "  logs/item-service.log"
echo ""
echo "Para parar todos os serviços, execute: ./stop-services.sh"
echo "Para testar os serviços, execute: node client-demo.js"
echo ""

# Salvar PIDs em arquivo para o script de parada
mkdir -p .pids
echo "$GATEWAY_PID" > .pids/api-gateway.pid
echo "$USER_PID" > .pids/user-service.pid
echo "$LIST_PID" > .pids/list-service.pid
echo "$ITEM_PID" > .pids/item-service.pid

echo "Serviços iniciados com sucesso!"
