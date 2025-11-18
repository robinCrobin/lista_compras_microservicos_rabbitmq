#!/bin/bash

# Script para parar todos os microsserviços
# Uso: ./stop-services.sh

echo "======================================"
echo "Parando Microsserviços..."
echo "======================================"

# Função para matar processo por PID
kill_process() {
    if [ -f "$1" ]; then
        PID=$(cat "$1")
        if kill -0 "$PID" 2>/dev/null; then
            echo "Parando processo $2 (PID: $PID)..."
            kill -TERM "$PID" 2>/dev/null
            sleep 2
            if kill -0 "$PID" 2>/dev/null; then
                echo "Forçando parada do processo $2..."
                kill -9 "$PID" 2>/dev/null
            fi
        else
            echo "Processo $2 já parado"
        fi
        rm -f "$1"
    fi
}

# Criar diretório de PIDs se não existir
mkdir -p .pids

# Parar serviços pelos PIDs salvos
kill_process ".pids/api-gateway.pid" "API Gateway"
kill_process ".pids/user-service.pid" "User Service"
kill_process ".pids/list-service.pid" "List Service"
kill_process ".pids/item-service.pid" "Item Service"

# Forçar parada por porta (backup)
echo "Verificando portas para cleanup..."

# Função para matar processo por porta
kill_by_port() {
    PID=$(lsof -ti:$1 2>/dev/null)
    if [ ! -z "$PID" ]; then
        echo "Matando processo na porta $1 (PID: $PID)..."
        kill -9 $PID 2>/dev/null || true
    fi
}

kill_by_port 3000  # API Gateway
kill_by_port 3001  # User Service
kill_by_port 3002  # List Service
kill_by_port 3003  # Item Service

# Limpar arquivos temporários
echo "Limpando arquivos temporários..."
rm -rf .pids
rm -f shared/services-registry.json

echo ""
echo "======================================"
echo "Todos os serviços foram parados!"
echo "======================================"
echo ""
echo "Para iniciar novamente, execute: ./start-services.sh"
