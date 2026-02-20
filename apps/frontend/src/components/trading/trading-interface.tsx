"use client";

import InstrumentList from "./instrument-list";
import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  CandlestickSeries,
  type ChartOptions,
  createChart,
  type DeepPartial,
  type UTCTimestamp,
} from "lightweight-charts";
import { toast } from "sonner";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import { TrendingDown, TrendingUp } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "../ui/badge";
import PositionRow from "../PositionRow";
import { DecimalsMap } from "@repo/common";
import useSocket from "@/hooks/useSocket";
import useBinanceKlines from "@/hooks/useBinanceKlines";

type Candle = {
  time: UTCTimestamp;
  open: number;
  high: number;
  low: number;
  close: number;
  trades?: number;
};

const INTERVALS = ["1m", "5m", "15m", "30m", "1h", "4h", "1d"] as const;
type Interval = (typeof INTERVALS)[number];

interface Position {
  id: string;
  asset: string;
  type: "LONG" | "SHORT";
  size: number;
  openPrice: number;
  currentPrice: number;
  pnl: number;
  userId?: string;
  openedAt: number;
  leverage: number;
  margin: number;
  closedAt?: number;
  status: "OPEN" | "CLOSE";
  slippage?: number;
  qty: number;
  closePrice?: number;
}

function TradingInterface() {
  const [selectedInstrument, setSelectedInstrument] = useState("BTC");
  const [openPositions, setOpenPositions] = useState<Position[]>([]);
  const [closedPositions, setClosedPositions] = useState<Position[]>([]);
  const [activeTab, setActiveTab] = useState<"open" | "closed">("open");
  const [positionsLoading, setPositionsLoading] = useState(false);
  const [candleData, setCandleData] = useState<Candle[]>([]);
  const [currentPrice, setCurrentPrice] = useState<number>(0);
  const [priceChange, setPriceChange] = useState<number>(0);
  const [percentChange, setPercentChange] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [balance, setBalance] = useState(0);
  const [tradeType, setTradeType] = useState<"LONG" | "SHORT">("LONG");
  const [margin, setMargin] = useState("");
  const [leverage, setLeverage] = useState(1);
  const [slippage, setSlippage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [latestPrices, setLatestPrices] = useState<
    Record<string, { ask: number; decimal: number; bid: number; asset: string }>
  >({});
  const { isConnected, socket } = useSocket();
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<any>(null);
  const candlestickSeriesRef = useRef<any | null>(null);
  const [interval, setTicksInterval] = useState<Interval>("1m");
  const { candleData: liveCandleData, connectionStatus } = useBinanceKlines(
    selectedInstrument,
    interval,
  );

  const usdtDecimals = DecimalsMap["USDT"];

  const fetchChartData = async () => {
    setLoading(true);
    try {
      const endTime = Date.now();
      const startTime = endTime - 90 * 24 * 60 * 60 * 1000;

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/klines?asset=${selectedInstrument.toUpperCase()}&interval=${interval}&startTime=${startTime}&endTime=${endTime}&limit=1000`,
        {
          credentials: "include",
        },
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      const transformedData = data
        .map((candle: any) => ({
          time: Math.floor(candle.openTime / 1000) as UTCTimestamp,
          open: parseFloat(candle.open),
          high: parseFloat(candle.high),
          low: parseFloat(candle.low),
          close: parseFloat(candle.close),
          volume: parseFloat(candle.volume),
        }))
        .sort((a: Candle, b: Candle) => a.time - b.time);

      return transformedData;
    } catch (error: any) {
      console.error("Error fetching klines:", error);
      toast.error(
        error.response?.data?.message ||
          error.message ||
          "Failed to fetch chart data",
      );
      return [];
    } finally {
      setLoading(false);
    }
  };

  const updatePriceInfo = (data: Candle[]) => {
    if (data.length >= 2) {
      const current = data[data.length - 1];
      const previous = data[data.length - 2];

      setCurrentPrice(current.close);
      const change = current.close - previous.close;
      setPriceChange(change);
      setPercentChange((change / previous.close) * 100);
    } else if (data.length === 1) {
      setCurrentPrice(data[0].close);
      setPriceChange(0);
      setPercentChange(0);
    }
  };

  useEffect(() => {
    if (liveCandleData.length > 0 && candlestickSeriesRef.current) {
      setCandleData((prev) => {
        const combined = [...prev];

        liveCandleData.forEach((liveCandle) => {
          const existingIndex = combined.findIndex(
            (c) => c.time === liveCandle.time,
          );
          if (existingIndex >= 0) {
            combined[existingIndex] = liveCandle;
          } else if (
            !combined.length ||
            liveCandle.time > combined[combined.length - 1].time
          ) {
            combined.push(liveCandle);
          }
        });

        combined.sort((a, b) => a.time - b.time);

        updatePriceInfo(combined);
        candlestickSeriesRef.current?.setData(combined);
        return combined;
      });
    }
  }, [liveCandleData]);

  const fetchUserBalanceUntilUpdated = async (
    previousBalance: number,
    retries = 5,
    delay = 500,
  ) => {
    for (let i = 0; i < retries; i++) {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/user/balance/usd`,
        {
          credentials: "include",
        },
      );
      const data = await res.json();
      if (data.usdBalance !== previousBalance) {
        setBalance(data.usdBalance);
        return data.usdBalance;
      }
      await new Promise((r) => setTimeout(r, delay));
    }
    setBalance(previousBalance);
    return previousBalance;
  };

  const fetchOpenPositions = async () => {
    setPositionsLoading(true);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/positions/open`,
        {
          credentials: "include",
          method: "GET",
        },
      );

      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }

      const data = await res.json();
      setOpenPositions(data);
    } catch (error: any) {
      console.error("Error fetching open positions:", error);
      toast.error(
        error.response?.data?.message ??
          error.message ??
          "Failed to fetch open positions",
        {
          position: "top-center",
        },
      );
    } finally {
      setPositionsLoading(false);
    }
  };

  const fetchClosedPositions = async () => {
    setPositionsLoading(true);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/positions/closed`,
        {
          credentials: "include",
        },
      );

      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }

      const data = await res.json();
      setClosedPositions(data);
    } catch (error: any) {
      console.error("Error fetching closed positions:", error);
      toast.error(
        error.response?.data?.message ??
          error.message ??
          "Failed to fetch closed positions",
        {
          position: "top-center",
        },
      );
    } finally {
      setPositionsLoading(false);
    }
  };

  const handleTabChange = (value: string) => {
    setActiveTab(value as "open" | "closed");
    if (value === "open") {
      fetchOpenPositions();
    } else {
      fetchClosedPositions();
    }
  };

  useEffect(() => {
    if (!chartRef.current) return;

    const chartOptions: DeepPartial<ChartOptions> = {
      layout: {
        textColor: "#e5e7eb",
        background: { color: "#0b0b0b" },
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.06)" },
        horzLines: { color: "rgba(255,255,255,0.06)" },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
      },
    };

    const chart = createChart(chartRef.current, chartOptions);
    chartInstanceRef.current = chart;

    chart.applyOptions({
      width: chartRef.current.clientWidth,
      height: 300,
    });

    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#26a69a",
      downColor: "#ef5350",
      borderVisible: false,
      wickUpColor: "#26a69a",
      wickDownColor: "#ef5350",
    });

    candlestickSeriesRef.current = candlestickSeries;

    const loadData = async () => {
      const data = await fetchChartData();
      if (data.length > 0) {
        setCandleData(data);
        updatePriceInfo(data);
        candlestickSeries.setData(data);
        chart.timeScale().fitContent();
      }
    };

    loadData();

    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (cr?.width && chartInstanceRef.current) {
        chartInstanceRef.current.applyOptions({
          width: Math.floor(cr.width),
          height: 350,
        });
      }
    });

    if (chartRef.current) {
      ro.observe(chartRef.current);
    }

    return () => {
      ro.disconnect();
      if (chartInstanceRef.current) {
        chartInstanceRef.current.remove();
        chartInstanceRef.current = null;
      }
      candlestickSeriesRef.current = null;
    };
  }, [selectedInstrument, interval]);

  useEffect(() => {
    if (!socket || !isConnected) return;

    const handleMessage = ({ data }: MessageEvent) => {
      try {
        const payload = JSON.parse(data.toString());

        switch (payload.type) {
          case "ALL_PRICES": {
            const priceData = payload.data;

            setLatestPrices(priceData);

            if (priceData[selectedInstrument]) {
              const instrumentPrice = priceData[selectedInstrument];
              const price =
                (instrumentPrice.bid + instrumentPrice.ask) /
                2 /
                10 ** instrumentPrice.decimal;
              setCurrentPrice(price);
            }
            break;
          }
        }
      } catch (error) {
        console.error("Error parsing socket message:", error);
      }
    };

    socket.onmessage = handleMessage;

    return () => {
      if (socket.onmessage === handleMessage) {
        socket.onmessage = null;
      }
    };
  }, [socket, isConnected, selectedInstrument]);

  useEffect(() => {
    if (!openPositions.length || !Object.keys(latestPrices).length) return;

    setOpenPositions((prevPositions) =>
      prevPositions.map((pos) => {
        const priceData = latestPrices[pos.asset];
        if (!priceData) return pos;

        let currentPrice =
          pos.type === "LONG"
            ? priceData.bid / 10 ** priceData.decimal
            : priceData.ask / 10 ** priceData.decimal;

        const openPrice = pos.openPrice / 10 ** priceData.decimal;

        const pnl =
          pos.type === "LONG"
            ? (currentPrice - openPrice) * pos.qty
            : (openPrice - currentPrice) * pos.qty;

        return {
          ...pos,
          currentPrice,
          pnl,
        };
      }),
    );
  }, [latestPrices]);

  useEffect(() => {
    fetchUserBalanceUntilUpdated(balance);
    fetchOpenPositions();
  }, []);

  const handleCancelPosition = async (positionId: string) => {
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/trade/close/${positionId}`,
        {
          method: "POST",
          credentials: "include",
        },
      );

      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }

      const data = await res.json();
      fetchUserBalanceUntilUpdated(balance);
      toast.success(data.message || "Position closed successfully", {
        position: "top-center",
      });
      setOpenPositions((prev) => prev.filter((pos) => pos.id !== positionId));
    } catch (error: any) {
      console.error("Error closing position:", error);
      toast.error(
        error.response?.data?.message ??
          error.message ??
          "Failed to close position",
        {
          position: "top-center",
        },
      );
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/trade/create`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({
            asset: selectedInstrument,
            type: tradeType,
            margin: Number.parseFloat(margin),
            leverage: leverage,
            slippage: slippage,
          }),
        },
      );

      const result = await response.json();

      if (response.ok) {
        setMargin("");
        setLeverage(1);
        setSlippage(1);
        toast.success(result.message || "Order placed successfully!", {
          position: "top-center",
        });

        if (result.result) {
          setOpenPositions((prev) => [
            ...prev,
            { ...result.result, status: "OPEN" },
          ]);
        }

        fetchUserBalanceUntilUpdated(balance);
      } else {
        toast.error(
          `Error: ${result.error || result.message || "Failed to create order"}`,
        );
      }
    } catch (error: any) {
      console.error("[v0] Order creation error:", error);
      toast.error("Failed to create order");
    } finally {
      setIsLoading(false);
    }
  };

  const isPositive = priceChange >= 0;

  return (
    <div className="space-y-6 p-4">
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-1">
          <InstrumentList
            onSelectInstrument={setSelectedInstrument}
            selectedInstrument={selectedInstrument}
          />
        </div>

        <div className="lg:col-span-2 space-y-6">
          <Card className="border border-zinc-800/50 bg-zinc-950/50 backdrop-blur-xl">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></div>
                  <span className="text-xl font-bold bg-gradient-to-r from-white to-zinc-300 bg-clip-text text-transparent">
                    {selectedInstrument.toUpperCase()}/USDT
                  </span>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-white">
                    ${currentPrice.toFixed(4)}
                    {loading && (
                      <span className="ml-2">
                        <span className="inline-block w-4 h-4 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin"></span>
                      </span>
                    )}
                  </div>
                  <div
                    className={`text-sm font-medium flex items-center ${
                      isPositive ? "text-emerald-400" : "text-red-400"
                    }`}
                  >
                    <span className="mr-1">{isPositive ? "↗" : "↘"}</span>
                    {isPositive ? "+" : ""}
                    {priceChange.toFixed(4)} ({percentChange.toFixed(2)}%)
                  </div>
                </div>
              </CardTitle>

              <div className="flex flex-wrap gap-2 mt-4">
                {INTERVALS.map((int) => (
                  <Button
                    key={int}
                    variant={interval === int ? "default" : "outline"}
                    size="sm"
                    onClick={() => setTicksInterval(int)}
                    disabled={loading}
                    className={`
                    transition-all duration-300 relative overflow-hidden
                    ${
                      interval === int
                        ? "bg-gradient-to-r from-emerald-600 to-emerald-700 text-white shadow-lg shadow-emerald-600/25"
                        : "bg-zinc-900/50 border-zinc-700/50 text-zinc-300 hover:bg-zinc-800/50 hover:border-emerald-500/50 hover:text-emerald-400"
                    }
                  `}
                  >
                    <span className="relative z-10">{int}</span>
                    {interval === int && (
                      <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 animate-pulse"></div>
                    )}
                  </Button>
                ))}
              </div>
            </CardHeader>

            <CardContent className="p-6">
              <div className="relative">
                <div
                  ref={chartRef}
                  className="w-full h-[350px] bg-zinc-900/50 rounded-lg border border-zinc-800/30 shadow-inner"
                />

                <div className="absolute inset-0 bg-gradient-to-t from-zinc-900/20 via-transparent to-zinc-900/20 rounded-lg pointer-events-none"></div>

                {candleData.length === 0 && !loading && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center space-y-2">
                      <div className="text-zinc-400 text-lg">📈</div>
                      <div className="text-zinc-400">
                        No chart data available
                      </div>
                      <div className="text-zinc-500 text-sm">
                        Select a different timeframe or instrument
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border border-zinc-800/50 bg-zinc-950/50 backdrop-blur-xl">
            <Tabs
              value={activeTab}
              onValueChange={handleTabChange}
              className="w-full"
            >
              <TabsList className="grid w-full grid-cols-2 bg-zinc-900/50 border-b border-zinc-800/50 rounded-t-lg rounded-b-none">
                <TabsTrigger
                  value="open"
                  className="relative data-[state=active]:bg-emerald-600/20 data-[state=active]:text-emerald-400 data-[state=active]:border-emerald-500/30"
                >
                  <span className="flex items-center space-x-2">
                    <span>Open Positions</span>
                    {openPositions.length > 0 && (
                      <Badge
                        variant="secondary"
                        className="h-5 text-xs bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                      >
                        {openPositions.length}
                      </Badge>
                    )}
                  </span>
                </TabsTrigger>
                <TabsTrigger
                  value="closed"
                  className="relative data-[state=active]:bg-zinc-700/20 data-[state=active]:text-zinc-300"
                >
                  <span className="flex items-center space-x-2">
                    <span>Closed Positions</span>
                    {closedPositions.length > 0 && (
                      <Badge
                        variant="outline"
                        className="h-5 text-xs border-zinc-600/50 text-zinc-400"
                      >
                        {closedPositions.length}
                      </Badge>
                    )}
                  </span>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="open" className="p-6 space-y-4 min-h-[300px]">
                {positionsLoading ? (
                  <div className="text-center py-12">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-400 mb-4"></div>
                    <div className="text-zinc-400">Loading positions...</div>
                  </div>
                ) : openPositions.length === 0 ? (
                  <div className="text-center py-12 space-y-3">
                    <div className="text-4xl">📊</div>
                    <div className="text-zinc-400 text-lg">
                      No open positions
                    </div>
                    <div className="text-zinc-500 text-sm">
                      Start trading to see your positions here
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between p-4 bg-zinc-900/30 rounded-lg border border-zinc-800/30">
                      <span className="text-sm text-zinc-400">
                        Total Open:{" "}
                        <span className="text-emerald-400 font-medium">
                          {openPositions.length}
                        </span>
                      </span>
                      <div className="text-sm">
                        <span className="text-zinc-400">Total P&L: </span>
                        <span
                          className={`font-bold text-lg ${
                            openPositions.reduce((sum, p) => sum + p.pnl, 0) >=
                            0
                              ? "text-emerald-400"
                              : "text-red-400"
                          }`}
                        >
                          $
                          {openPositions
                            .reduce((sum, p) => sum + p.pnl, 0)
                            .toFixed(2)}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-3 max-h-[400px] overflow-y-auto custom-scrollbar">
                      {openPositions.map((position) => (
                        <div key={position.id} className="relative">
                          <PositionRow
                            onCancelPosition={handleCancelPosition}
                            currentPrice={
                              position.type === "LONG"
                                ? latestPrices[position.asset]?.bid || 0
                                : latestPrices[position.asset]?.ask || 0
                            }
                            position={position}
                            showCloseButton={true}
                          />
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </TabsContent>

              <TabsContent
                value="closed"
                className="p-6 space-y-4 min-h-[300px]"
              >
                {positionsLoading ? (
                  <div className="text-center py-12">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-zinc-400 mb-4"></div>
                    <div className="text-zinc-400">Loading positions...</div>
                  </div>
                ) : closedPositions.length === 0 ? (
                  <div className="text-center py-12 space-y-3">
                    <div className="text-4xl">📋</div>
                    <div className="text-zinc-400 text-lg">
                      No closed positions
                    </div>
                    <div className="text-zinc-500 text-sm">
                      Your trading history will appear here
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between p-4 bg-zinc-900/30 rounded-lg border border-zinc-800/30">
                      <span className="text-sm text-zinc-400">
                        Total Closed:{" "}
                        <span className="text-zinc-300 font-medium">
                          {closedPositions.length}
                        </span>
                      </span>
                      <div className="text-sm">
                        <span className="text-zinc-400">Historical P&L: </span>
                        <span
                          className={`font-bold text-lg ${
                            closedPositions.reduce(
                              (sum, p) => sum + p.pnl,
                              0,
                            ) >= 0
                              ? "text-emerald-400"
                              : "text-red-400"
                          }`}
                        >
                          $
                          {closedPositions
                            .reduce((sum, p) => sum + p.pnl, 0)
                            .toFixed(2)}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-3 max-h-[400px] overflow-y-auto custom-scrollbar">
                      {closedPositions.map((position) => (
                        <PositionRow
                          onCancelPosition={handleCancelPosition}
                          key={position.id}
                          position={position}
                          currentPrice={
                            position.type === "LONG"
                              ? latestPrices[position.asset]?.bid || 0
                              : latestPrices[position.asset]?.ask || 0
                          }
                          showCloseButton={false}
                        />
                      ))}
                    </div>
                  </>
                )}
              </TabsContent>
            </Tabs>
          </Card>
        </div>

        <div className="lg:col-span-1 space-y-6">
          <Card className="border border-zinc-800/50 bg-zinc-950/50 backdrop-blur-xl">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-emerald-400 rounded-full"></div>
                <span className="bg-gradient-to-r from-white to-zinc-300 bg-clip-text text-transparent">
                  Place Trade
                </span>
                <span className="px-2 py-1 bg-emerald-500/20 text-emerald-400 text-sm rounded-full border border-emerald-500/30">
                  {selectedInstrument}
                </span>
              </CardTitle>
              <div className="text-sm text-zinc-400 flex items-center space-x-2">
                <span>Balance:</span>
                <span className="text-emerald-400 font-bold text-lg">
                  ${balance.toFixed(2)}
                </span>
              </div>
            </CardHeader>

            <CardContent className="space-y-6">
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-2 gap-3">
                  <Button
                    type="button"
                    variant={tradeType === "LONG" ? "default" : "outline"}
                    className={`relative overflow-hidden transition-all duration-300 ${
                      tradeType === "LONG"
                        ? "bg-gradient-to-r from-emerald-600 to-emerald-700 text-white shadow-lg shadow-emerald-600/25"
                        : "bg-zinc-900/50 border-zinc-700/50 text-zinc-300 hover:bg-emerald-600/10 hover:border-emerald-500/50 hover:text-emerald-400"
                    }`}
                    onClick={() => setTradeType("LONG")}
                  >
                    <TrendingUp className="h-4 w-4 mr-2" />
                    <span className="font-medium">LONG</span>
                    {tradeType === "LONG" && (
                      <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 animate-pulse"></div>
                    )}
                  </Button>

                  <Button
                    type="button"
                    variant={tradeType === "SHORT" ? "default" : "outline"}
                    className={`relative overflow-hidden transition-all duration-300 ${
                      tradeType === "SHORT"
                        ? "bg-gradient-to-r from-red-600 to-red-700 text-white shadow-lg shadow-red-600/25"
                        : "bg-zinc-900/50 border-zinc-700/50 text-zinc-300 hover:bg-red-600/10 hover:border-red-500/50 hover:text-red-400"
                    }`}
                    onClick={() => setTradeType("SHORT")}
                  >
                    <TrendingDown className="h-4 w-4 mr-2" />
                    <span className="font-medium">SHORT</span>
                    {tradeType === "SHORT" && (
                      <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 animate-pulse"></div>
                    )}
                  </Button>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="margin" className="text-zinc-300 font-medium">
                    Margin ($)
                  </Label>
                  <div className="relative">
                    <Input
                      id="margin"
                      type="number"
                      value={margin}
                      onChange={(e) => setMargin(e.target.value)}
                      placeholder="Enter margin amount"
                      min={1}
                      step="0.01"
                      required
                      className="bg-zinc-900/50 border-zinc-700/50 text-white placeholder-zinc-500 focus:border-emerald-500/50 focus:ring-emerald-500/25 pr-12"
                    />
                    <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-zinc-400 text-sm">
                      USD
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <Label
                    htmlFor="leverage"
                    className="text-zinc-300 font-medium"
                  >
                    Leverage
                  </Label>
                  <div className="space-y-2">
                    <div className="flex items-center gap-4">
                      <input
                        id="leverage"
                        type="range"
                        min={1}
                        max={100}
                        step={1}
                        value={leverage}
                        onChange={(e) => setLeverage(e.target.valueAsNumber)}
                        className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer slider"
                      />
                      <div className="min-w-[50px] text-right">
                        <span className="font-bold text-emerald-400 text-lg">
                          {leverage}x
                        </span>
                      </div>
                    </div>
                    <div className="flex justify-between text-xs text-zinc-500">
                      <span>1x</span>
                      <span>Low Risk</span>
                      <span>High Risk</span>
                      <span>100x</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label
                    htmlFor="slippage"
                    className="text-zinc-300 font-medium"
                  >
                    Slippage (%)
                  </Label>
                  <div className="relative">
                    <Input
                      id="slippage"
                      type="number"
                      value={slippage}
                      onChange={(e) => setSlippage(e.target.valueAsNumber)}
                      min="0.1"
                      max="10"
                      step="0.1"
                      className="bg-zinc-900/50 border-zinc-700/50 text-white placeholder-zinc-500 focus:border-emerald-500/50 focus:ring-emerald-500/25 pr-8"
                    />
                    <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-zinc-400 text-sm">
                      %
                    </div>
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={
                    isLoading || !margin || Number.parseFloat(margin) <= 0
                  }
                  className={`w-full h-12 font-bold text-lg transition-all duration-300 relative overflow-hidden ${
                    tradeType === "LONG"
                      ? "bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 shadow-lg shadow-emerald-600/25"
                      : "bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 shadow-lg shadow-red-600/25"
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {isLoading && (
                    <div className="absolute left-4 top-1/2 transform -translate-y-1/2">
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    </div>
                  )}
                  <span className="relative z-10">
                    {isLoading
                      ? "Creating Trade..."
                      : `Place ${tradeType} Order`}
                  </span>
                  {!isLoading && (
                    <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700"></div>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>

      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(39, 39, 42, 0.3);
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(34, 197, 94, 0.5);
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(34, 197, 94, 0.7);
        }

        .slider::-webkit-slider-thumb {
          appearance: none;
          height: 20px;
          width: 20px;
          border-radius: 50%;
          background: linear-gradient(135deg, #10b981, #059669);
          cursor: pointer;
          box-shadow: 0 4px 8px rgba(16, 185, 129, 0.3);
          border: 2px solid #ffffff;
        }

        .slider::-webkit-slider-track {
          height: 8px;
          border-radius: 4px;
          background: linear-gradient(
            to right,
            #27272a 0%,
            #10b981 ${leverage}%,
            #27272a 100%
          );
        }
      `}</style>
    </div>
  );
}

export default TradingInterface;
