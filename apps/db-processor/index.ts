import redisclient from "@repo/redisclient";
import { CONSUMER_NAME, GROUP_NAME, RESULTS_STREAM } from "./config";
import type {
  ICloseOrderEvent,
  IPlaceOrderEvent,
  OrderEvent,
} from "./types/types";
import prisma from "@repo/db";
import { DecimalsMap } from "@repo/common";
import type { PositionType } from "@repo/db/generated/prisma/enums";
import pLimit from "p-limit";

const limit = pLimit(10);

const createConsumerGroup = async () => {
  try {
    await redisclient.xgroup(
      "CREATE",
      RESULTS_STREAM,
      GROUP_NAME,
      "$",
      "MKSTREAM",
    );
  } catch (error: any) {
    if (error.message.includes("BUSYGROUP")) {
      console.log(`Group with ${GROUP_NAME} already exists`);
    } else {
      console.error(error);
    }
  }
};

function parseStreamData(streams: any[]) {
  const results: any[] = [];
  for (const [, entries] of streams) {
    for (const [id, fields] of entries) {
      const obj: Record<string, string> = {};
      for (let i = 0; i < fields.length; i += 2) {
        obj[fields[i]] = fields[i + 1];
      }
      if (obj.data) {
        results.push({ streamId: id, ...JSON.parse(obj.data) });
      }
    }
  }
  return results;
}

const handleInsertPlacedOrder = async (event: IPlaceOrderEvent) => {
  try {
    await prisma.$transaction(async (tx) => {
      const isAlreadyProcessed = await tx.$executeRaw`
          INSERT INTO "EventLog"(id, type)
          VALUES (${event.streamId}, 'ORDER_OPEN')
          ON CONFLICT DO NOTHING
        `;

      if (isAlreadyProcessed === 0) {
        console.log("Order with orderId " + event.id + " already processed");
        return;
      }

      console.log(event);

      const [user] = await tx.$queryRaw<
        { id: string; usdBalance: number }[]
      >`SELECT * FROM "User" WHERE id = ${event.userId} FOR UPDATE;`;

      if (!user) {
        throw new Error("User not found");
      }

      if (user.usdBalance < event.margin) {
        throw new Error("Insufficient balance");
      }

      await tx.user.update({
        where: {
          id: user.id,
        },
        data: {
          usdBalance: {
            decrement: event.margin,
          },
        },
      });

      await tx.position.create({
        data: {
          id: event.id,
          asset: event.asset,
          margin: event.margin,
          leverage: event.leverage,
          openPrice: event.openPrice,
          qty: event.qty,
          slippage: event.slippage,
          type: event.type as PositionType,
          userId: user.id,
          openedAt: new Date(event.openedAt),
        },
      });
    });
    await redisclient.xack(RESULTS_STREAM, GROUP_NAME, event.streamId);
    console.log(
      "Order with orderId " + event.id + " successfully inserted into db",
    );
  } catch (error) {
    console.error("Error while inserting in db: ", error);
  }
};

const handleInsertClosedOrder = async (event: ICloseOrderEvent) => {
  try {
    await prisma.$transaction(async (tx) => {
      const [user] = await tx.$queryRaw<
        { id: string; usdBalance: number }[]
      >`SELECT * FROM "User" WHERE id = ${event.userId} FOR UPDATE;`;
      if (!user) {
        throw new Error("User not found");
      }

      await tx.user.update({
        where: {
          id: user.id,
        },
        data: {
          usdBalance: event.finalBalance,
        },
      });

      const pnl = event.pnl / 10 ** DecimalsMap["USDT"]!;

      await tx.position.update({
        where: {
          id: event.id,
        },
        data: {
          userId: event.userId,
          closedAt: new Date(event.closedAt),
          pnl,
          closePrice: event.closePrice,
          status: "CLOSE",
        },
      });
    });
    await redisclient.xack(RESULTS_STREAM, GROUP_NAME, event.streamId);
    console.log(
      "Order with orderId " + event.id + " successfully inserted into db",
    );
  } catch (error) {
    console.error("Error while inserting in db: ", error);
  }
};

const handleProcessEvents = async (events: OrderEvent[]) => {
  await Promise.all(
    events.map((event) => {
      if (event.event === "ORDER_PLACED") {
        return limit(() => handleInsertPlacedOrder(event));
      } else if (event.event === "ORDER_CLOSED") {
        return limit(() => handleInsertClosedOrder(event));
      }
    }),
  );
};

async function main() {
  await createConsumerGroup();

  const prevMessages = await redisclient.xreadgroup(
    "GROUP",
    GROUP_NAME,
    CONSUMER_NAME,
    "STREAMS",
    RESULTS_STREAM,
    "0",
  );

  if (prevMessages && prevMessages.length > 0) {
    const data = parseStreamData(prevMessages);
    await handleProcessEvents(data);
  }

  while (true) {
    const newMessages = await redisclient.xreadgroup(
      "GROUP",
      GROUP_NAME,
      CONSUMER_NAME,
      "BLOCK",
      5000,
      "STREAMS",
      RESULTS_STREAM,
      ">",
    );

    if (newMessages && newMessages.length > 0) {
      const data = parseStreamData(newMessages);
      console.log(data);
      await handleProcessEvents(data);
    }
  }
}

main();
