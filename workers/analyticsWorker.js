const amqp = require('amqplib');

async function start() {
    const amqpUrl = 'amqps://ykcqsgxb:UVQ4zi44sq4UH0IaSM8MbDK_vzfHtpsN@turkey.rmq.cloudamqp.com/ykcqsgxb';

    console.log('[AnalyticsWorker] Conectando ao RabbitMQ...');
    const connection = await amqp.connect(amqpUrl);
    const channel = await connection.createChannel();

    const exchange = 'shopping_events';
    const queue = 'analytics_queue';

    await channel.assertExchange(exchange, 'topic', { durable: true });
    await channel.assertQueue(queue, { durable: true });

    await channel.bindQueue(queue, exchange, 'list.checkout.#');

    console.log(`[AnalyticsWorker] Aguardando mensagens em ${queue}...`);

    channel.consume(queue, (msg) => {
        if (msg !== null) {
            const data = JSON.parse(msg.content.toString());

            const totalGasto = data.items.reduce((acc, item) => {
                return acc + (item.quantity * item.estimatedPrice);
            }, 0);

            console.log(`📊 Atualizando dashboard:`);
            console.log(`   Lista: ${data.listId}`);
            console.log(`   Usuário: ${data.userEmail}`);
            console.log(`   Total gasto estimado: R$ ${totalGasto.toFixed(2)}\n`);

            channel.ack(msg);
        }
    });
}

start().catch(err => {
    console.error('[AnalyticsWorker] Erro:', err.message);
    process.exit(1);
});
