const amqp = require('amqplib');

async function start() {
    const amqpUrl = 'amqps://ykcqsgxb:UVQ4zi44sq4UH0IaSM8MbDK_vzfHtpsN@turkey.rmq.cloudamqp.com/ykcqsgxb';

    console.log('[NotificationWorker] Conectando ao RabbitMQ...');
    const connection = await amqp.connect(amqpUrl);
    const channel = await connection.createChannel();

    const exchange = 'shopping_events';
    const queue = 'notification_queue';

    await channel.assertExchange(exchange, 'topic', { durable: true });
    await channel.assertQueue(queue, { durable: true });

    await channel.bindQueue(queue, exchange, 'list.checkout.#');

    console.log(`[NotificationWorker] Aguardando mensagens em ${queue}...`);

    channel.consume(queue, (msg) => {
        if (msg !== null) {
            const content = JSON.parse(msg.content.toString());

            console.log(
                `📨 Enviando comprovante da lista ${content.listId} ` +
                `para o usuário ${content.userEmail}`
            );

            channel.ack(msg);
        }
    });
}

start().catch(err => {
    console.error('[NotificationWorker] Erro:', err.message);
    process.exit(1);
});
