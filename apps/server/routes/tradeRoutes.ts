import { Router } from "express";
import authMiddleware from "../middleware/authMiddleware";
import { OrderSchema } from "@repo/common";
import redisclient from "@repo/redisclient";
import {
  CONSUMER_NAME,
  ENGINE_STREAM,
  GROUP_NAME,
  RESULTS_STREAM,
} from "../config";

const tradeRouter = Router();

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

const waitForResults = async (
  orderId: string,
  timeoutInMs: number,
): Promise<any | null> => {
  return new Promise((resolve) => {
    let isResolved = false;

    const check = async () => {
      const msgs = await redisclient.xread(
        "BLOCK",
        1000,
        "STREAMS",
        RESULTS_STREAM,
        "$",
      );

      if (msgs && msgs.length > 0) {
        const results = parseStreamData(msgs);
        console.log(results);
        const isResult = results.find((res) => res.id === orderId);
        if (isResult) {
          resolve(isResult);
          await redisclient.xack(RESULTS_STREAM, GROUP_NAME, isResult.streamId);
          isResolved = true;
        }
      }

      if (!isResolved) {
        setTimeout(check, 200);
      }
    };

    check();

    setTimeout(() => {
      if (!isResolved) {
        resolve(null);
      }
    }, timeoutInMs);
  });
};

tradeRouter.post("/create", authMiddleware, async (req, res) => {
  const { data, error } = OrderSchema.safeParse(req.body);
  let startTime = Date.now();
  const userId = req.userId!;
  if (error) {
    res.status(400).json({
      message: "invalid inputs",
      error: error.message,
    });
    return;
  }
  const newOrderId = crypto.randomUUID();

  const orderData = {
    event: "PLACE_ORDER",
    data: {
      ...data,
      id: newOrderId,
      userId,
    },
  };

  try {
    await redisclient.xadd(
      ENGINE_STREAM,
      "*",
      "data",
      JSON.stringify(orderData),
    );

    const result = await waitForResults(newOrderId, 10_000);

    if (!result) {
      res.status(504).json({
        message: "Engine timeout",
      });
      return;
    }

    if (result.type === "ERROR") {
      res.status(result.errorStatus).json({
        message: result.errorMessage,
      });
      return;
    }

    res.status(200).json({
      message: "Order successfully Placed",
      result,
      time: Date.now() - startTime,
    });
  } catch (error) {
    res.status(500).json({
      message: "Internal Server Error",
    });
  }
});

tradeRouter.post("/close/:orderId", authMiddleware, async (req, res) => {
  const orderId = req.params.orderId as string;
  const userId = req.userId!;

  const orderData = {
    event: "CANCEL_ORDER",
    data: {
      orderId,
      userId,
    },
  };

  try {
    await redisclient.xadd(
      ENGINE_STREAM,
      "*",
      "data",
      JSON.stringify(orderData),
    );

    const result = await waitForResults(orderId, 10_000);

    if (!result) {
      res.status(400).json({
        message: "Engine timeout",
      });
      return;
    }

    if (result.type === "ERROR") {
      res.status(result.errorStatus).json({
        message: result.errorMessage,
      });
      return;
    }

    res.status(200).json({
      message: "Order Cancelled successfully",
      result,
    });
  } catch (error) {
    res.status(500).json({
      message: "Internal Server Error",
    });
  }
});

export default tradeRouter;
