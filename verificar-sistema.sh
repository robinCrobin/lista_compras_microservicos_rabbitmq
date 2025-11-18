#!/bin/bash

echo "🔍 Verificando Sistema de Microserviços..."
echo "========================================"

# Cores para output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Função para verificar se um serviço está respondendo
check_service() {
    local name=$1
    local url=$2
    
    echo -n "Verificando $name... "
    
    if curl -s "$url/health" > /dev/null 2>&1; then
        echo -e "${GREEN}✅ OK${NC}"
        return 0
    else
        echo -e "${RED}❌ FALHOU${NC}"
        return 1
    fi
}

# Verificar se os processos estão rodando
echo -e "\n${YELLOW}📋 Processos Node.js ativos:${NC}"
ps aux | grep node | grep -v grep | awk '{print $2, $11, $12, $13}' || echo "Nenhum processo Node.js encontrado"

echo -e "\n${YELLOW}🌐 Verificando Serviços:${NC}"

# Verificar cada serviço
services_ok=0
total_services=4

check_service "API Gateway (3000)" "http://localhost:3000" && ((services_ok++))
check_service "User Service (3001)" "http://localhost:3001" && ((services_ok++))
check_service "List Service (3002)" "http://localhost:3002" && ((services_ok++))
check_service "Item Service (3003)" "http://localhost:3003" && ((services_ok++))

echo -e "\n${YELLOW}📊 Resumo:${NC}"
echo "Serviços funcionando: $services_ok/$total_services"

if [ $services_ok -eq $total_services ]; then
    echo -e "${GREEN}🎉 Todos os serviços estão funcionando!${NC}"
    
    # Teste rápido de funcionalidade
    echo -e "\n${YELLOW}🧪 Teste rápido de funcionalidade:${NC}"
    
    # Testar registro via API Gateway
    echo -n "Testando registro de usuário... "
    response=$(curl -s -X POST http://localhost:3000/api/auth/register \
        -H "Content-Type: application/json" \
        -d '{
            "email": "teste_verificacao@sistema.com",
            "username": "teste_verificacao",
            "password": "senha123",
            "firstName": "Teste",
            "lastName": "Verificacao"
        }')
    
    if echo "$response" | grep -q "success.*true"; then
        echo -e "${GREEN}✅ OK${NC}"
        
        # Extrair token
        token=$(echo "$response" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
        
        if [ ! -z "$token" ]; then
            echo -n "Testando autenticação... "
            auth_test=$(curl -s -X GET http://localhost:3000/api/users \
                -H "Authorization: Bearer $token")
            
            if echo "$auth_test" | grep -q "success.*true"; then
                echo -e "${GREEN}✅ OK${NC}"
            else
                echo -e "${RED}❌ FALHOU${NC}"
            fi
        fi
    else
        echo -e "${RED}❌ FALHOU${NC}"
    fi
    
    echo -e "\n${GREEN}✨ Sistema pronto para demonstração!${NC}"
    echo -e "\n${YELLOW}📝 Próximos passos:${NC}"
    echo "1. Abrir Postman"
    echo "2. Importar: Microservicos_Lista_Compras.postman_collection.json"
    echo "3. Importar ambiente: Microservicos_Environment.postman_environment.json"
    echo "4. Seguir o roteiro em: ROTEIRO_DEMONSTRACAO.md"
    
else
    echo -e "${RED}❌ Alguns serviços não estão funcionando!${NC}"
    echo -e "\n${YELLOW}🔧 Para corrigir:${NC}"
    echo "1. Execute: ./stop-services.sh"
    echo "2. Aguarde 5 segundos"
    echo "3. Execute: ./start-services.sh"
    echo "4. Aguarde 10 segundos"
    echo "5. Execute novamente: ./verificar-sistema.sh"
fi

echo -e "\n${YELLOW}📋 URLs dos serviços:${NC}"
echo "• API Gateway: http://localhost:3000"
echo "• User Service: http://localhost:3001"
echo "• List Service: http://localhost:3002"
echo "• Item Service: http://localhost:3003"

echo -e "\n${YELLOW}📚 Documentação:${NC}"
echo "• Roteiro completo: ROTEIRO_DEMONSTRACAO.md"
echo "• Collection Postman: Microservicos_Lista_Compras.postman_collection.json"
echo "• Environment Postman: Microservicos_Environment.postman_environment.json"
