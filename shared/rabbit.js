const amqp = require('amqplib');

let channel = null;

async function connectRabbit() {
    if (channel) return channel;

    try {
        const connection = await amqp.connect("amqps://ykcqsgxb:UVQ4zi44sq4UH0IaSM8MbDK_vzfHtpsN@turkey.rmq.cloudamqp.com/ykcqsgxb");
        channel = await connection.createChannel();

        console.log('RabbitMQ conectado com sucesso.');

        // Declarar exchange principal
        await channel.assertExchange('shopping_events', 'topic', { durable: true });

        return channel;
    } catch (error) {
        console.error('Erro ao conectar RabbitMQ:', error);
        throw error;
    }
}

async function publish(exchange, routingKey, message) {
    const ch = await connectRabbit();
    ch.publish(exchange, routingKey, Buffer.from(JSON.stringify(message)), {
        persistent: true
    });
}

module.exports = {
    connectRabbit,
    publish
};
