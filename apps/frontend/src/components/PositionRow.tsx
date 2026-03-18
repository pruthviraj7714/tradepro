"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  TrendingUp,
  TrendingDown,
  X,
  Clock,
  DollarSign,
  Target,
  Zap,
} from "lucide-react";
import { DecimalsMap } from "@repo/common";

interface Position {
  id: string;
  asset: string;
  type: "LONG" | "SHORT";
  size: number;
  openPrice: number;
  currentPrice: number;
  pnl?: number;
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

const formatPrice = (price: number) => {
  return price.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  });
};

const formatTimeAgo = (date: Date) => {
  const now = Date.now();
  const diff = now - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return "Just now";
};

const usdtDecimals = DecimalsMap["USDT"]!;

const PositionRow = ({
  position,
  currentPrice,
  showCloseButton = false,
  onCancelPosition,
}: {
  position: Position;
  showCloseButton?: boolean;
  currentPrice: number;
  onCancelPosition: (positionId: string) => void;
}) => {
  const isOpen = position.status === "OPEN";
  const isProfitable = (position.pnl || 0) >= 0;
  const isLong = position.type === "LONG";

  const displayPrice = isOpen
    ? currentPrice
    : position.closePrice || position.currentPrice;
  const sizeInUSDT = (position.margin / 10 ** usdtDecimals) * position.leverage;
  const entryPrice = position.openPrice / 10 ** DecimalsMap[position.asset];
  const currentDisplayPrice = displayPrice / 10 ** DecimalsMap[position.asset];

  return (
    <div
      className={`
      relative overflow-hidden rounded-xl border transition-all duration-300 hover:shadow-lg
      ${
        isOpen
          ? "bg-gradient-to-br from-background to-muted/20 border-border hover:border-primary/30"
          : "bg-gradient-to-br from-muted/30 to-muted/10 border-muted-foreground/20"
      }
    `}
    >
      <div
        className={`absolute top-0 left-0 right-0 h-1 ${
          isOpen
            ? isLong
              ? "bg-gradient-to-r from-emerald-500 to-green-400"
              : "bg-gradient-to-r from-red-500 to-rose-400"
            : "bg-gradient-to-r from-muted-foreground/40 to-muted-foreground/20"
        }`}
      />

      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold text-foreground">
                {position.asset}
              </span>
              <Badge
                variant={isLong ? "default" : "destructive"}
                className={`text-xs font-medium px-2 py-1 ${
                  isLong
                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"
                    : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
                }`}
              >
                {isLong ? (
                  <>
                    <TrendingUp className="w-3 h-3 mr-1" /> LONG
                  </>
                ) : (
                  <>
                    <TrendingDown className="w-3 h-3 mr-1" /> SHORT
                  </>
                )}
              </Badge>
            </div>

            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                <Zap className="w-3 h-3 mr-1" />
                {position.leverage}x
              </Badge>
              <Badge
                variant={isOpen ? "default" : "secondary"}
                className={`text-xs ${
                  isOpen
                    ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
                    : "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300"
                }`}
              >
                {isOpen ? "ACTIVE" : "CLOSED"}
              </Badge>
            </div>
          </div>

          {showCloseButton && isOpen && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onCancelPosition(position.id)}
              className="h-8 w-8 p-0 hover:bg-red-50 hover:border-red-200 dark:hover:bg-red-900/20"
            >
              <X className="w-4 h-4 text-red-500" />
            </Button>
          )}
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <DollarSign className="w-3 h-3" />
              Size
            </div>
            <div className="font-semibold text-sm">
              ${formatPrice(sizeInUSDT)}
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Target className="w-3 h-3" />
              Entry Price
            </div>
            <div className="font-semibold text-sm">
              ${formatPrice(entryPrice)}
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <TrendingUp className="w-3 h-3" />
              {isOpen ? "Current" : "Close"} Price
            </div>
            <div className="font-semibold text-sm">
              ${formatPrice(currentDisplayPrice)}
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="w-3 h-3" />
              {isOpen ? "Opened" : "Closed"}
            </div>
            <div className="text-xs">
              {formatTimeAgo(
                isOpen
                  ? new Date(position.openedAt)
                  : new Date(position.closedAt || new Date()) ||
                      new Date(position.openedAt),
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-border/50">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">
              Profit & Loss
            </span>
            {isOpen && (
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            )}
          </div>

          <div className="text-right">
            <div
              className={`text-lg font-bold ${
                isProfitable
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-red-600 dark:text-red-400"
              }`}
            >
              {isProfitable ? "+" : ""}${(position.pnl || 0).toFixed(2)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PositionRow;
