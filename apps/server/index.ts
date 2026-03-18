import express from "express";
import cors from "cors";
import userRouter from "./routes/userRoutes";
import cookieParser from "cookie-parser";
import tradeRouter from "./routes/tradeRoutes";
import assetRouter from "./routes/assetRouer";
import redisclient from "@repo/redisclient";
import klinesRouter from "./routes/candleRouter";
import positionsRouter from "./routes/positionsRouter";
import { GROUP_NAME, PORT, RESULTS_STREAM } from "./config";

const app = express();

app.use(express.json());
app.use(cookieParser());
app.use(cors({
  origin: "http://localhost:3006",
  credentials: true,
}));

const createConsumerGroup = async () => {
  try {
    await redisclient.xgroup(
      "CREATE",
      RESULTS_STREAM,
      GROUP_NAME,
      "$",
      "MKSTREAM"
    );
  } catch (error: any) {
    if (error.message.includes("BUSYGROUP")) {
      console.log(`Group with ${GROUP_NAME} already exists`);
    } else {
      console.error(error);
    }
  }
};

app.use("/api/v1/user", userRouter);
app.use("/api/v1/trade", tradeRouter);
app.use("/api/v1/asset", assetRouter);
app.use("/api/v1/klines", klinesRouter);
app.use("/api/v1/positions", positionsRouter);

createConsumerGroup();

app.listen(PORT, () => {
  console.log(`server is running on port ${PORT}`);
});
