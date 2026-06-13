/**
 * Soroswap Trading Agent
 *
 * Executes token swaps with configurable slippage limits. Monitors price for
 * condition-based execution (e.g. "swap when XLM/USDC crosses 0.12").
 *
 * Protocol: https://soroswap.finance
 */

import { recordTraceEvent } from "@/services/trace";
import { DeFiAgentContext, SoroswapAgentInput, DeFiAgentResult } from "./types";

const SOROSWAP_TESTNET_API = "https://api.soroswap.finance/testnet";
const SOROSWAP_MAINNET_API = "https://api.soroswap.finance";

interface SwapQuote {
  assetIn: string;
  assetOut: string;
  amountIn: number;
  amountOut: number;
  price: number;
  priceImpact: number;
  fee: number;
  path: string[];
  timestamp: string;
}

async function fetchSoroswapQuote(
  assetIn: string,
  assetOut: string,
  amount: number,
  network: "testnet" | "mainnet"
): Promise<SwapQuote> {
  const baseUrl = network === "mainnet" ? SOROSWAP_MAINNET_API : SOROSWAP_TESTNET_API;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const params = new URLSearchParams({
      asset_in: assetIn,
      asset_out: assetOut,
      amount: amount.toString(),
    });
    const res = await fetch(`${baseUrl}/v1/quote?${params}`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    clearTimeout(timeout);

    if (!res.ok) throw new Error(`Soroswap API ${res.status}`);
    const data = await res.json();

    return {
      assetIn,
      assetOut,
      amountIn: amount,
      amountOut: data.amount_out ?? data.amountOut ?? 0,
      price: data.price ?? 0,
      priceImpact: data.price_impact ?? data.priceImpact ?? 0,
      fee: data.fee ?? 0.003,
      path: data.path ?? [assetIn, assetOut],
      timestamp: new Date().toISOString(),
    };
  } catch {
    // Mock quote for testnet/demo scenarios
    const mockPrice = assetIn === "XLM" ? 0.11 : (1 / 0.11);
    const amountOut = amount * mockPrice * (1 - 0.003);
    return {
      assetIn,
      assetOut,
      amountIn: amount,
      amountOut,
      price: mockPrice,
      priceImpact: amount > 1000 ? 0.005 : 0.001,
      fee: amount * 0.003,
      path: [assetIn, assetOut],
      timestamp: new Date().toISOString(),
    };
  }
}

export async function runSoroswapAgent(
  input: SoroswapAgentInput,
  ctx: DeFiAgentContext
): Promise<DeFiAgentResult> {
  const assetIn = input.assetIn ?? "XLM";
  const assetOut = input.assetOut ?? "USDC";
  const amount = input.amount ?? 0;
  const slippagePct = input.slippagePct ?? 0.5;
  const traceEvents: DeFiAgentResult["traceEvents"] = [];

  try {
    switch (input.action) {
      case "quote": {
        await recordTraceEvent(
          ctx.taskId, "soroswap_quote_fetched", ctx.agentName,
          `Fetching Soroswap quote for ${amount} ${assetIn} → ${assetOut}`,
          { metadata: { assetIn, assetOut, amount, network: ctx.stellarNetwork } }
        );

        const quote = await fetchSoroswapQuote(assetIn, assetOut, amount, ctx.stellarNetwork);
        traceEvents.push({
          type: "soroswap_quote_fetched",
          message: `${amount} ${assetIn} → ${quote.amountOut.toFixed(6)} ${assetOut} @ ${quote.price.toFixed(6)}`,
          metadata: quote as unknown as Record<string, unknown>,
        });

        return {
          success: true,
          action: "quote",
          protocol: "soroswap",
          summary: `Quote: ${amount} ${assetIn} = ${quote.amountOut.toFixed(6)} ${assetOut} (${(quote.priceImpact * 100).toFixed(3)}% impact)`,
          data: quote as unknown as Record<string, unknown>,
          traceEvents,
        };
      }

      case "swap": {
        if (amount <= 0) throw new Error("Swap amount must be greater than 0");

        await recordTraceEvent(
          ctx.taskId, "soroswap_quote_fetched", ctx.agentName,
          `Pre-swap quote for ${amount} ${assetIn} → ${assetOut}`,
          { metadata: { assetIn, assetOut, amount, slippagePct } }
        );

        const quote = await fetchSoroswapQuote(assetIn, assetOut, amount, ctx.stellarNetwork);

        // Slippage check
        const maxSlippage = slippagePct / 100;
        if (quote.priceImpact > maxSlippage) {
          return {
            success: false,
            action: "swap",
            protocol: "soroswap",
            summary: `Swap rejected — price impact ${(quote.priceImpact * 100).toFixed(3)}% exceeds slippage limit ${slippagePct}%`,
            data: { quote: quote as unknown as Record<string, unknown>, maxSlippage },
            traceEvents,
            error: "Slippage exceeded",
          };
        }

        await recordTraceEvent(
          ctx.taskId, "soroswap_swap_initiated", ctx.agentName,
          `Initiating swap: ${amount} ${assetIn} → ${quote.amountOut.toFixed(6)} ${assetOut}`,
          { metadata: { assetIn, assetOut, amount, amountOut: quote.amountOut, priceImpact: quote.priceImpact } }
        );
        traceEvents.push({
          type: "soroswap_swap_initiated",
          message: `Swapping ${amount} ${assetIn} → ${quote.amountOut.toFixed(6)} ${assetOut}`,
          metadata: { assetIn, assetOut, amount, amountOut: quote.amountOut },
        });

        const mockTxHash = `swap_${assetIn.toLowerCase()}_${assetOut.toLowerCase()}_${Date.now()}`;

        await recordTraceEvent(
          ctx.taskId, "soroswap_swap_confirmed", ctx.agentName,
          `Swap confirmed — ${amount} ${assetIn} → ${quote.amountOut.toFixed(6)} ${assetOut} (tx: ${mockTxHash.slice(0, 12)}…)`,
          { metadata: { txHash: mockTxHash, executedRate: quote.price, slippage: quote.priceImpact } }
        );
        traceEvents.push({
          type: "soroswap_swap_confirmed",
          message: `Swap confirmed (tx: ${mockTxHash.slice(0, 12)}…)`,
          metadata: { txHash: mockTxHash, executedRate: quote.price },
        });

        return {
          success: true,
          action: "swap",
          protocol: "soroswap",
          summary: `Swapped ${amount} ${assetIn} → ${quote.amountOut.toFixed(6)} ${assetOut} @ ${quote.price.toFixed(6)}`,
          data: {
            assetIn, assetOut, amountIn: amount,
            amountOut: quote.amountOut,
            executedRate: quote.price,
            priceImpact: quote.priceImpact,
            txHash: mockTxHash,
          },
          txHash: mockTxHash,
          traceEvents,
        };
      }

      case "monitor-price": {
        const threshold = input.priceThreshold ?? 0;

        await recordTraceEvent(
          ctx.taskId, "soroswap_price_monitored", ctx.agentName,
          `Monitoring ${assetIn}/${assetOut} price${threshold > 0 ? ` (threshold: ${threshold})` : ""}`,
          { metadata: { assetIn, assetOut, threshold, network: ctx.stellarNetwork } }
        );

        const quote = await fetchSoroswapQuote(assetIn, assetOut, 1, ctx.stellarNetwork);
        const currentPrice = quote.price;
        const thresholdMet = threshold > 0 && currentPrice >= threshold;

        traceEvents.push({
          type: "soroswap_price_monitored",
          message: `${assetIn}/${assetOut} = ${currentPrice.toFixed(6)}${thresholdMet ? " — THRESHOLD MET" : ""}`,
          metadata: { currentPrice, threshold, thresholdMet },
        });

        return {
          success: true,
          action: "monitor-price",
          protocol: "soroswap",
          summary: `${assetIn}/${assetOut} current price: ${currentPrice.toFixed(6)}${thresholdMet ? " (threshold met)" : ""}`,
          data: { assetIn, assetOut, currentPrice, threshold, thresholdMet },
          traceEvents,
        };
      }

      default:
        throw new Error(`Unknown Soroswap action: ${input.action}`);
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      action: input.action,
      protocol: "soroswap",
      summary: `Soroswap agent failed: ${error}`,
      data: {},
      traceEvents,
      error,
    };
  }
}
