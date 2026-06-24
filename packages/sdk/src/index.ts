import { VerixClient, type VerixOptions } from "./client";
import { AgentsResource } from "./agents";
import { ExecutionsResource } from "./executions";
import { ReceiptsResource } from "./receipts";

export type { VerixOptions } from "./client";
export type { WaitForAnchorOptions } from "./receipts";
export * from "./errors";
export * from "./types";

/**
 * The Verix SDK client.
 *
 * @example
 * const verix = new Verix({ apiKey: process.env.VERIX_API_KEY! });
 * const agent = await verix.agents.create({ name: "Bot", walletAddress: "G..." });
 */
export class Verix {
  /** Agent management (`/api/v1/agents`). */
  readonly agents: AgentsResource;
  /** Execution submission + reads (`/api/v1/executions`). */
  readonly executions: ExecutionsResource;
  /** Receipts, proofs, and Soroban anchoring (`/api/v1/receipts`). */
  readonly receipts: ReceiptsResource;

  /** Low-level transport, exposed for advanced use. */
  readonly client: VerixClient;

  constructor(options: VerixOptions) {
    this.client = new VerixClient(options);
    this.agents = new AgentsResource(this.client);
    this.executions = new ExecutionsResource(this.client);
    this.receipts = new ReceiptsResource(this.client);
  }
}

export { VerixClient } from "./client";
export default Verix;
