import type { VerixClient } from "./client";
import type {
  AgentResponse,
  CreateAgentRequest,
  UpdateAgentRequest,
} from "./types";

/** Agent management — wraps `/api/v1/agents`. */
export class AgentsResource {
  constructor(private readonly client: VerixClient) {}

  /** Create a project-scoped agent. */
  async create(input: CreateAgentRequest): Promise<AgentResponse> {
    const { agent } = await this.client.request<{ agent: AgentResponse }>(
      "POST",
      "/agents",
      input
    );
    return agent;
  }

  /** List this project's agents. */
  async list(): Promise<AgentResponse[]> {
    const { agents } = await this.client.request<{ agents: AgentResponse[] }>(
      "GET",
      "/agents"
    );
    return agents;
  }

  /** Fetch a single agent by id. */
  async get(id: string): Promise<AgentResponse> {
    const { agent } = await this.client.request<{ agent: AgentResponse }>(
      "GET",
      `/agents/${encodeURIComponent(id)}`
    );
    return agent;
  }

  /** Update mutable fields on an agent. */
  async update(id: string, input: UpdateAgentRequest): Promise<AgentResponse> {
    const { agent } = await this.client.request<{ agent: AgentResponse }>(
      "PATCH",
      `/agents/${encodeURIComponent(id)}`,
      input
    );
    return agent;
  }

  /** Delete an agent. */
  async delete(id: string): Promise<void> {
    await this.client.request<{ ok: boolean }>(
      "DELETE",
      `/agents/${encodeURIComponent(id)}`
    );
  }
}
