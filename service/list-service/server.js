const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const axios = require('axios');

// Importar banco NoSQL e service registry
const JsonDatabase = require('../../shared/JsonDatabase');
const serviceRegistry = require('../../shared/serviceRegistry');

class ListService {
    constructor() {
        this.app = express();
        this.port = process.env.PORT || 3002;
        this.serviceName = 'list-service';
        this.serviceUrl = `http://127.0.0.1:${this.port}`;
        
        this.setupDatabase();
        this.setupMiddleware();
        this.setupRoutes();
        this.setupErrorHandling();
    }

    setupDatabase() {
        const dbPath = path.join(__dirname, 'database');
        this.listsDb = new JsonDatabase(dbPath, 'lists');
        console.log('List Service: Banco NoSQL inicializado');
    }

    setupMiddleware() {
        this.app.use(helmet());
        this.app.use(cors());
        this.app.use(morgan('combined'));
        this.app.use(express.json());
        this.app.use(express.urlencoded({ extended: true }));

        // Service info headers
        this.app.use((req, res, next) => {
            res.setHeader('X-Service', this.serviceName);
            res.setHeader('X-Service-Version', '1.0.0');
            res.setHeader('X-Database', 'JSON-NoSQL');
            next();
        });
    }

    setupRoutes() {
        // Health check
        this.app.get('/health', async (req, res) => {
            try {
                const listCount = await this.listsDb.count();
                const activeLists = await this.listsDb.count({ status: 'active' });
                
                res.json({
                    service: this.serviceName,
                    status: 'healthy',
                    timestamp: new Date().toISOString(),
                    uptime: process.uptime(),
                    version: '1.0.0',
                    database: {
                        type: 'JSON-NoSQL',
                        listCount: listCount,
                        activeLists: activeLists
                    }
                });
            } catch (error) {
                res.status(503).json({
                    service: this.serviceName,
                    status: 'unhealthy',
                    error: error.message
                });
            }
        });

        // Service info
        this.app.get('/', (req, res) => {
            res.json({
                service: 'List Service',
                version: '1.0.0',
                description: 'Microsserviço para gerenciamento de listas com NoSQL',
                database: 'JSON-NoSQL',
                endpoints: [
                    'POST /lists',
                    'GET /lists',
                    'GET /lists/:id',
                    'PUT /lists/:id',
                    'DELETE /lists/:id',
                    'POST /lists/:id/items',
                    'PUT /lists/:id/items/:itemId',
                    'DELETE /lists/:id/items/:itemId',
                    'GET /lists/:id/summary'
                ]
            });
        });

        // List routes
        this.app.post('/lists', this.authMiddleware.bind(this), this.createList.bind(this));
        this.app.get('/lists', this.authMiddleware.bind(this), this.getLists.bind(this));
        this.app.get('/lists/:id', this.authMiddleware.bind(this), this.getList.bind(this));
        this.app.put('/lists/:id', this.authMiddleware.bind(this), this.updateList.bind(this));
        this.app.delete('/lists/:id', this.authMiddleware.bind(this), this.deleteList.bind(this));
        this.app.post('/lists/:id/items', this.authMiddleware.bind(this), this.addItemToList.bind(this));
        this.app.put('/lists/:id/items/:itemId', this.authMiddleware.bind(this), this.updateItemInList.bind(this));
        this.app.delete('/lists/:id/items/:itemId', this.authMiddleware.bind(this), this.removeItemFromList.bind(this));
        this.app.get('/lists/:id/summary', this.authMiddleware.bind(this), this.getListSummary.bind(this));
    }

    setupErrorHandling() {
        this.app.use('*', (req, res) => {
            res.status(404).json({
                success: false,
                message: 'Endpoint não encontrado',
                service: this.serviceName
            });
        });

        this.app.use((error, req, res, next) => {
            console.error('List Service Error:', error);
            res.status(500).json({
                success: false,
                message: 'Erro interno do serviço',
                service: this.serviceName
            });
        });
    }

    // Auth middleware (valida token com User Service)
    async authMiddleware(req, res, next) {
        const authHeader = req.header('Authorization');
        
        if (!authHeader?.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                message: 'Token obrigatório'
            });
        }

        try {
            // Descobrir User Service
            const userService = serviceRegistry.discover('user-service');
            
            // Validar token com User Service
            const response = await axios.post(`${userService.url}/auth/validate`, {
                token: authHeader.replace('Bearer ', '')
            }, { timeout: 5000 });

            if (response.data.success) {
                req.user = response.data.data.user;
                next();
            } else {
                res.status(401).json({
                    success: false,
                    message: 'Token inválido'
                });
            }
        } catch (error) {
            console.error('Erro na validação do token:', error.message);
            res.status(503).json({
                success: false,
                message: 'Serviço de autenticação indisponível'
            });
        }
    }

    // Create list
    async createList(req, res) {
        try {
            const { 
                name, 
                description, 
                status = 'active'
            } = req.body;

            if (!name) {
                return res.status(400).json({
                    success: false,
                    message: 'Nome da lista é obrigatório'
                });
            }

            const newList = await this.listsDb.create({
                id: uuidv4(),
                userId: req.user.id,
                name,
                description: description || '',
                status,
                items: [],
                summary: {
                    totalItems: 0,
                    purchasedItems: 0,
                    estimatedTotal: 0
                },
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            });

            res.status(201).json({
                success: true,
                message: 'Lista criada com sucesso',
                data: newList
            });
        } catch (error) {
            console.error('Erro ao criar lista:', error);
            res.status(500).json({
                success: false,
                message: 'Erro interno do servidor'
            });
        }
    }

    // Get lists
    async getLists(req, res) {
        try {
            const lists = await this.listsDb.find({ userId: req.user.id });

            res.json({
                success: true,
                data: lists
            });
        } catch (error) {
            console.error('Erro ao buscar listas:', error);
            res.status(500).json({
                success: false,
                message: 'Erro interno do servidor'
            });
        }
    }

    // Get list by ID
    async getList(req, res) {
        try {
            const { id } = req.params;
            const list = await this.listsDb.findById(id);

            if (!list || list.userId !== req.user.id) {
                return res.status(404).json({
                    success: false,
                    message: 'Lista não encontrada'
                });
            }

            res.json({
                success: true,
                data: list
            });
        } catch (error) {
            console.error('Erro ao buscar lista:', error);
            res.status(500).json({
                success: false,
                message: 'Erro interno do servidor'
            });
        }
    }

    // Update list
    async updateList(req, res) {
        try {
            const { id } = req.params;
            const { 
                name, 
                description, 
                status
            } = req.body;

            const list = await this.listsDb.findById(id);
            if (!list || list.userId !== req.user.id) {
                return res.status(404).json({
                    success: false,
                    message: 'Lista não encontrada'
                });
            }

            const updates = {};
            if (name !== undefined) updates.name = name;
            if (description !== undefined) updates.description = description;
            if (status !== undefined) updates.status = status;

            updates.updatedAt = new Date().toISOString();

            const updatedList = await this.listsDb.update(id, updates);

            res.json({
                success: true,
                message: 'Lista atualizada com sucesso',
                data: updatedList
            });
        } catch (error) {
            console.error('Erro ao atualizar lista:', error);
            res.status(500).json({
                success: false,
                message: 'Erro interno do servidor'
            });
        }
    }

    // Delete list
    async deleteList(req, res) {
        try {
            const { id } = req.params;

            const list = await this.listsDb.findById(id);
            if (!list || list.userId !== req.user.id) {
                return res.status(404).json({
                    success: false,
                    message: 'Lista não encontrada'
                });
            }

            await this.listsDb.delete(id);

            res.json({
                success: true,
                message: 'Lista removida com sucesso'
            });
        } catch (error) {
            console.error('Erro ao deletar lista:', error);
            res.status(500).json({
                success: false,
                message: 'Erro interno do servidor'
            });
        }
    }

    // Add item to list
    async addItemToList(req, res) {
        try {
            const { id } = req.params;
            const { 
                itemId, 
                itemName, 
                quantity, 
                unit, 
                estimatedPrice, 
                purchased = false, 
                notes = ''
            } = req.body;

            const list = await this.listsDb.findById(id);
            if (!list || list.userId !== req.user.id) {
                return res.status(404).json({
                    success: false,
                    message: 'Lista não encontrada'
                });
            }

            const newItem = {
                itemId,
                itemName,
                quantity: parseFloat(quantity),
                unit,
                estimatedPrice: parseFloat(estimatedPrice),
                purchased: purchased === 'true',
                notes,
                addedAt: new Date().toISOString()
            };

            list.items.push(newItem);
            list.summary.totalItems++;
            list.summary.estimatedTotal += newItem.estimatedPrice * newItem.quantity;

            const updatedList = await this.listsDb.update(id, list);

            res.json({
                success: true,
                message: 'Item adicionado à lista com sucesso',
                data: updatedList
            });
        } catch (error) {
            console.error('Erro ao adicionar item à lista:', error);
            res.status(500).json({
                success: false,
                message: 'Erro interno do servidor'
            });
        }
    }

    // Update item in list
    async updateItemInList(req, res) {
        try {
            const { id, itemId } = req.params;
            const { 
                itemName, 
                quantity, 
                unit, 
                estimatedPrice, 
                purchased, 
                notes
            } = req.body;

            const list = await this.listsDb.findById(id);
            if (!list || list.userId !== req.user.id) {
                return res.status(404).json({
                    success: false,
                    message: 'Lista não encontrada'
                });
            }

            const itemIndex = list.items.findIndex(item => item.itemId === itemId);
            if (itemIndex === -1) {
                return res.status(404).json({
                    success: false,
                    message: 'Item não encontrado na lista'
                });
            }

            const item = list.items[itemIndex];
            if (itemName !== undefined) item.itemName = itemName;
            if (quantity !== undefined) item.quantity = parseFloat(quantity);
            if (unit !== undefined) item.unit = unit;
            if (estimatedPrice !== undefined) item.estimatedPrice = parseFloat(estimatedPrice);
            if (purchased !== undefined) item.purchased = purchased === 'true';
            if (notes !== undefined) item.notes = notes;

            list.summary.estimatedTotal = list.items.reduce((total, item) => total + (item.estimatedPrice * item.quantity), 0);
            list.summary.purchasedItems = list.items.filter(item => item.purchased).length;

            const updatedList = await this.listsDb.update(id, list);

            res.json({
                success: true,
                message: 'Item atualizado na lista com sucesso',
                data: updatedList
            });
        } catch (error) {
            console.error('Erro ao atualizar item na lista:', error);
            res.status(500).json({
                success: false,
                message: 'Erro interno do servidor'
            });
        }
    }

    // Remove item from list
    async removeItemFromList(req, res) {
        try {
            const { id, itemId } = req.params;

            const list = await this.listsDb.findById(id);
            if (!list || list.userId !== req.user.id) {
                return res.status(404).json({
                    success: false,
                    message: 'Lista não encontrada'
                });
            }

            const itemIndex = list.items.findIndex(item => item.itemId === itemId);
            if (itemIndex === -1) {
                return res.status(404).json({
                    success: false,
                    message: 'Item não encontrado na lista'
                });
            }

            const [removedItem] = list.items.splice(itemIndex, 1);
            list.summary.totalItems--;
            list.summary.estimatedTotal -= removedItem.estimatedPrice * removedItem.quantity;

            const updatedList = await this.listsDb.update(id, list);

            res.json({
                success: true,
                message: 'Item removido da lista com sucesso',
                data: updatedList
            });
        } catch (error) {
            console.error('Erro ao remover item da lista:', error);
            res.status(500).json({
                success: false,
                message: 'Erro interno do servidor'
            });
        }
    }

    // Get list summary
    async getListSummary(req, res) {
        try {
            const { id } = req.params;

            const list = await this.listsDb.findById(id);
            if (!list || list.userId !== req.user.id) {
                return res.status(404).json({
                    success: false,
                    message: 'Lista não encontrada'
                });
            }

            res.json({
                success: true,
                data: list.summary
            });
        } catch (error) {
            console.error('Erro ao buscar resumo da lista:', error);
            res.status(500).json({
                success: false,
                message: 'Erro interno do servidor'
            });
        }
    }

    // Register with service registry
    registerWithRegistry() {
        serviceRegistry.register(this.serviceName, {
            url: this.serviceUrl,
            version: '1.0.0',
            database: 'JSON-NoSQL',
            endpoints: ['/health', '/lists', '/lists/:id', '/lists/:id/items', '/lists/:id/summary']
        });
    }

    // Start health check reporting
    startHealthReporting() {
        setInterval(() => {
            serviceRegistry.updateHealth(this.serviceName, true);
        }, 30000);
    }

    start() {
        this.app.listen(this.port, () => {
            console.log('=====================================');
            console.log(`List Service iniciado na porta ${this.port}`);
            console.log(`URL: ${this.serviceUrl}`);
            console.log(`Health: ${this.serviceUrl}/health`);
            console.log(`Database: JSON-NoSQL`);
            console.log('=====================================');
            
            this.registerWithRegistry();
            this.startHealthReporting();
        });
    }
}

// Start service
if (require.main === module) {
    const listService = new ListService();
    listService.start();

    // Graceful shutdown
    process.on('SIGTERM', () => {
        serviceRegistry.unregister('list-service');
        process.exit(0);
    });
    process.on('SIGINT', () => {
        serviceRegistry.unregister('list-service');
        process.exit(0);
    });
}

module.exports = ListService;

