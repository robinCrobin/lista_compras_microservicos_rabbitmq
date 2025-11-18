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

class ItemService {
    constructor() {
        this.app = express();
        this.port = process.env.PORT || 3003;
        this.serviceName = 'item-service';
        this.serviceUrl = `http://127.0.0.1:${this.port}`;
        
        this.setupDatabase();
        this.setupMiddleware();
        this.setupRoutes();
        this.setupErrorHandling();
    }

    setupDatabase() {
        const dbPath = path.join(__dirname, 'database');
        this.itemsDb = new JsonDatabase(dbPath, 'items');
        console.log('Item Service: Banco NoSQL inicializado');
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
                const itemCount = await this.itemsDb.count();
                const activeItems = await this.itemsDb.count({ active: true });
                
                res.json({
                    service: this.serviceName,
                    status: 'healthy',
                    timestamp: new Date().toISOString(),
                    uptime: process.uptime(),
                    version: '1.0.0',
                    database: {
                        type: 'JSON-NoSQL',
                        itemCount: itemCount,
                        activeItems: activeItems
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
                service: 'Item Service',
                version: '1.0.0',
                description: 'Microsserviço para gerenciamento de itens com NoSQL',
                database: 'JSON-NoSQL',
                endpoints: [
                    'GET /items',
                    'GET /items/:id',
                    'POST /items',
                    'PUT /items/:id',
                    'GET /categories',
                    'GET /search'
                ]
            });
        });

        // Item routes
        this.app.get('/items', this.getItems.bind(this));
        this.app.get('/items/:id', this.getItem.bind(this));
        this.app.post('/items', this.authMiddleware.bind(this), this.createItem.bind(this));
        this.app.put('/items/:id', this.authMiddleware.bind(this), this.updateItem.bind(this));

        // Category routes (extraídas dos itens)
        this.app.get('/categories', this.getCategories.bind(this));

        // Search route
        this.app.get('/search', this.searchItems.bind(this));
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
            console.error('Item Service Error:', error);
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

    // Get items (com filtros e paginação)
    async getItems(req, res) {
        try {
            const { 
                page = 1, 
                limit = 10, 
                category, 
                name,
                active = true
            } = req.query;
            
            const skip = (page - 1) * parseInt(limit);
            
            // Filtros NoSQL flexíveis
            const filter = { active: active === 'true' || active === true };

            // Filtrar por categoria
            if (category) {
                filter.category = category;
            }

            // Filtrar por nome
            if (name) {
                filter.name = { $regex: name, $options: 'i' };
            }

            const items = await this.itemsDb.find(filter, {
                skip: skip,
                limit: parseInt(limit),
                sort: { createdAt: -1 }
            });

            const total = await this.itemsDb.count(filter);

            res.json({
                success: true,
                data: items,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: total,
                    pages: Math.ceil(total / parseInt(limit))
                }
            });
        } catch (error) {
            console.error('Erro ao buscar itens:', error);
            res.status(500).json({
                success: false,
                message: 'Erro interno do servidor'
            });
        }
    }

    // Get item by ID
    async getItem(req, res) {
        try {
            const { id } = req.params;
            const item = await this.itemsDb.findById(id);

            if (!item) {
                return res.status(404).json({
                    success: false,
                    message: 'Item não encontrado'
                });
            }

            res.json({
                success: true,
                data: item
            });
        } catch (error) {
            console.error('Erro ao buscar item:', error);
            res.status(500).json({
                success: false,
                message: 'Erro interno do servidor'
            });
        }
    }

    // Create item
    async createItem(req, res) {
        try {
            const { 
                name, 
                category, 
                brand, 
                unit, 
                averagePrice, 
                barcode, 
                description,
                active = true
            } = req.body;

            if (!name || !category || !brand || !unit || !averagePrice || !barcode) {
                return res.status(400).json({
                    success: false,
                    message: 'Campos obrigatórios não preenchidos'
                });
            }

            const newItem = await this.itemsDb.create({
                id: uuidv4(),
                name,
                category,
                brand,
                unit,
                averagePrice: parseFloat(averagePrice),
                barcode,
                description: description || '',
                active: active === 'true',
                createdAt: new Date().toISOString(),
                metadata: {
                    createdBy: req.user.id,
                    createdByName: `${req.user.firstName} ${req.user.lastName}`
                }
            });

            res.status(201).json({
                success: true,
                message: 'Item criado com sucesso',
                data: newItem
            });
        } catch (error) {
            console.error('Erro ao criar item:', error);
            res.status(500).json({
                success: false,
                message: 'Erro interno do servidor'
            });
        }
    }

    // Update item
    async updateItem(req, res) {
        try {
            const { id } = req.params;
            const { 
                name, 
                category, 
                brand, 
                unit, 
                averagePrice, 
                barcode, 
                description,
                active
            } = req.body;

            const item = await this.itemsDb.findById(id);
            if (!item) {
                return res.status(404).json({
                    success: false,
                    message: 'Item não encontrado'
                });
            }

            const updates = {};
            if (name !== undefined) updates.name = name;
            if (category !== undefined) updates.category = category;
            if (brand !== undefined) updates.brand = brand;
            if (unit !== undefined) updates.unit = unit;
            if (averagePrice !== undefined) updates.averagePrice = parseFloat(averagePrice);
            if (barcode !== undefined) updates.barcode = barcode;
            if (description !== undefined) updates.description = description;
            if (active !== undefined) updates.active = active === 'true';

            updates['metadata.lastUpdatedBy'] = req.user.id;
            updates['metadata.lastUpdatedByName'] = `${req.user.firstName} ${req.user.lastName}`;
            updates['metadata.lastUpdatedAt'] = new Date().toISOString();

            const updatedItem = await this.itemsDb.update(id, updates);

            res.json({
                success: true,
                message: 'Item atualizado com sucesso',
                data: updatedItem
            });
        } catch (error) {
            console.error('Erro ao atualizar item:', error);
            res.status(500).json({
                success: false,
                message: 'Erro interno do servidor'
            });
        }
    }

    // Get categories (extraídas dos itens)
    async getCategories(req, res) {
        try {
            const items = await this.itemsDb.find({ active: true });
            
            const categoriesMap = new Map();
            items.forEach(item => {
                if (item.category) {
                    const key = item.category;
                    if (!categoriesMap.has(key)) {
                        categoriesMap.set(key, {
                            name: item.category,
                            productCount: 0
                        });
                    }
                    categoriesMap.get(key).productCount++;
                }
            });

            const categories = Array.from(categoriesMap.values())
                .sort((a, b) => a.name.localeCompare(b.name));
            
            res.json({
                success: true,
                data: categories
            });
        } catch (error) {
            console.error('Erro ao buscar categorias:', error);
            res.status(500).json({
                success: false,
                message: 'Erro interno do servidor'
            });
        }
    }

    // Search items
    async searchItems(req, res) {
        try {
            const { q, limit = 20, category } = req.query;

            if (!q) {
                return res.status(400).json({
                    success: false,
                    message: 'Parâmetro de busca "q" é obrigatório'
                });
            }

            let items = await this.itemsDb.search(q, ['name']);
            
            items = items.filter(item => item.active);

            if (category) {
                items = items.filter(item => item.category === category);
            }

            items = items.slice(0, parseInt(limit));

            res.json({
                success: true,
                data: {
                    query: q,
                    category: category || null,
                    results: items,
                    total: items.length
                }
            });
        } catch (error) {
            console.error('Erro na busca de itens:', error);
            res.status(500).json({
                success: false,
                message: 'Erro interno do servidor'
            });
        }
    }

    async seedInitialData() {
        // Aguardar inicialização e criar itens exemplo
        setTimeout(async () => {
            try {
                const existingItems = await this.itemsDb.find();
                
                if (existingItems.length === 0) {
                    const sampleItems = [
                        // Alimentos
                        { id: uuidv4(), name: 'Arroz', category: 'Alimentos', brand: 'Marca A', unit: 'kg', averagePrice: 5.99, barcode: '1234567890123', description: 'Arroz branco tipo 1', active: true, createdAt: new Date().toISOString() },
                        { id: uuidv4(), name: 'Feijão', category: 'Alimentos', brand: 'Marca B', unit: 'kg', averagePrice: 7.49, barcode: '1234567890124', description: 'Feijão carioca', active: true, createdAt: new Date().toISOString() },
                        { id: uuidv4(), name: 'Macarrão', category: 'Alimentos', brand: 'Marca C', unit: 'kg', averagePrice: 4.29, barcode: '1234567890125', description: 'Macarrão espaguete', active: true, createdAt: new Date().toISOString() },
                        { id: uuidv4(), name: 'Açúcar', category: 'Alimentos', brand: 'Marca D', unit: 'kg', averagePrice: 3.89, barcode: '1234567890126', description: 'Açúcar refinado', active: true, createdAt: new Date().toISOString() },
                        // Limpeza
                        { id: uuidv4(), name: 'Detergente', category: 'Limpeza', brand: 'Marca E', unit: 'un', averagePrice: 2.99, barcode: '1234567890127', description: 'Detergente líquido', active: true, createdAt: new Date().toISOString() },
                        { id: uuidv4(), name: 'Sabão em Pó', category: 'Limpeza', brand: 'Marca F', unit: 'kg', averagePrice: 8.99, barcode: '1234567890128', description: 'Sabão em pó para roupas', active: true, createdAt: new Date().toISOString() },
                        { id: uuidv4(), name: 'Água Sanitária', category: 'Limpeza', brand: 'Marca G', unit: 'litro', averagePrice: 3.49, barcode: '1234567890129', description: 'Água sanitária', active: true, createdAt: new Date().toISOString() },
                        // Higiene
                        { id: uuidv4(), name: 'Shampoo', category: 'Higiene', brand: 'Marca H', unit: 'un', averagePrice: 12.99, barcode: '1234567890130', description: 'Shampoo para cabelos', active: true, createdAt: new Date().toISOString() },
                        { id: uuidv4(), name: 'Condicionador', category: 'Higiene', brand: 'Marca I', unit: 'un', averagePrice: 13.99, barcode: '1234567890131', description: 'Condicionador para cabelos', active: true, createdAt: new Date().toISOString() },
                        { id: uuidv4(), name: 'Sabonete', category: 'Higiene', brand: 'Marca J', unit: 'un', averagePrice: 1.99, barcode: '1234567890132', description: 'Sabonete em barra', active: true, createdAt: new Date().toISOString() },
                        // Bebidas
                        { id: uuidv4(), name: 'Refrigerante', category: 'Bebidas', brand: 'Marca K', unit: 'litro', averagePrice: 6.49, barcode: '1234567890133', description: 'Refrigerante sabor cola', active: true, createdAt: new Date().toISOString() },
                        { id: uuidv4(), name: 'Suco de Laranja', category: 'Bebidas', brand: 'Marca L', unit: 'litro', averagePrice: 4.99, barcode: '1234567890134', description: 'Suco de laranja natural', active: true, createdAt: new Date().toISOString() },
                        { id: uuidv4(), name: 'Água Mineral', category: 'Bebidas', brand: 'Marca M', unit: 'litro', averagePrice: 1.49, barcode: '1234567890135', description: 'Água mineral sem gás', active: true, createdAt: new Date().toISOString() },
                        // Padaria
                        { id: uuidv4(), name: 'Pão Francês', category: 'Padaria', brand: 'Padaria N', unit: 'un', averagePrice: 0.99, barcode: '1234567890136', description: 'Pão francês fresco', active: true, createdAt: new Date().toISOString() },
                        { id: uuidv4(), name: 'Bolo de Chocolate', category: 'Padaria', brand: 'Padaria O', unit: 'un', averagePrice: 15.99, barcode: '1234567890137', description: 'Bolo de chocolate', active: true, createdAt: new Date().toISOString() },
                        { id: uuidv4(), name: 'Croissant', category: 'Padaria', brand: 'Padaria P', unit: 'un', averagePrice: 3.49, barcode: '1234567890138', description: 'Croissant de manteiga', active: true, createdAt: new Date().toISOString() },
                        { id: uuidv4(), name: 'Torta de Frango', category: 'Padaria', brand: 'Padaria Q', unit: 'un', averagePrice: 19.99, barcode: '1234567890139', description: 'Torta de frango', active: true, createdAt: new Date().toISOString() },
                        { id: uuidv4(), name: 'Biscoito de Polvilho', category: 'Padaria', brand: 'Padaria R', unit: 'un', averagePrice: 2.99, barcode: '1234567890140', description: 'Biscoito de polvilho', active: true, createdAt: new Date().toISOString() }
                    ];

                    for (const item of sampleItems) {
                        await this.itemsDb.create(item);
                    }

                    console.log('Itens de exemplo criados no Item Service');
                }
            } catch (error) {
                console.error('Erro ao criar dados iniciais:', error);
            }
        }, 1000);
    }

    // Register with service registry
    registerWithRegistry() {
        serviceRegistry.register(this.serviceName, {
            url: this.serviceUrl,
            version: '1.0.0',
            database: 'JSON-NoSQL',
            endpoints: ['/health', '/items', '/categories', '/search']
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
            console.log(`Item Service iniciado na porta ${this.port}`);
            console.log(`URL: ${this.serviceUrl}`);
            console.log(`Health: ${this.serviceUrl}/health`);
            console.log(`Database: JSON-NoSQL`);
            console.log('=====================================');
            
            this.registerWithRegistry();
            this.startHealthReporting();
            this.seedInitialData(); // Chamar a função de seed
        });
    }
}

// Start service
if (require.main === module) {
    const itemService = new ItemService();
    itemService.start();

    // Graceful shutdown
    process.on('SIGTERM', () => {
        serviceRegistry.unregister('item-service');
        process.exit(0);
    });
    process.on('SIGINT', () => {
        serviceRegistry.unregister('item-service');
        process.exit(0);
    });
}

module.exports = ItemService;
