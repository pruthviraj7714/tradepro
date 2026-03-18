import Redis from "ioredis"

const redisclient = new Redis(process.env.REDIS_URL!, {
    port : 6381
});

export default redisclient;