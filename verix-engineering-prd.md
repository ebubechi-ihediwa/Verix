# Verix, Engineering PRD
### Verifiable AI Execution Layer for Stellar DeFi
### Developer Platform Model
**Version 3.0 | Internal Engineering Document**

---

## 1. Executive Summary

Verix is a developer platform that enables any builder on Stellar to add verified AI agent execution to their product. Developers sign up, create a project, configure their AI provider, and get a Verix API key. They drop that key into the Verix SDK in their codebase. Their product now runs AI agents that execute DeFi operations on Stellar, with every action producing a cryptographic receipt anchored to Soroban. The developer sees everything those agents do in a per-project dashboard: receipts, verifications, agent activity, and DeFi operations.

Verix is the infrastructure. Developers are the customers. Their end users are the ultimate beneficiaries.

---

## 2. Problem Statement

Stellar's DeFi stack is live and growing. Blend enables on-chain lending and borrowing. Soroswap enables token swaps. Aquarius manages liquidity incentives. Anchors bridge fiat to stablecoins. The infrastructure is solid.

But there is no intelligence layer. Every DeFi interaction requires a human or a custom one-off script. Developers building savings apps, neobanks, payment tools, and portfolio products on Stellar have no ready-made way to offer AI-driven DeFi features to their users. Building the agent logic, the verification layer, the Soroban contracts, and the audit infrastructure from scratch is months of work that distracts from their core product.

Verix removes that problem entirely. A developer installs the SDK, connects their project, and their product gets verified AI agent execution on Stellar out of the box.

---

## 3. Product Vision

Verix is the Stripe of verified AI agent execution on Stellar. Just as Stripe made it trivial for any developer to accept payments, Verix makes it trivial for any developer to add trusted, verifiable AI-driven DeFi operations to their product.

The core promise is simple. When your AI agent does something on Stellar, your users can prove it happened exactly as claimed. Not trust, proof.

---

## 4. User Personas

### Persona 1: The Stellar Developer (Primary Customer)
A developer building a savings app, neobank, payment tool, or portfolio product on Stellar. They want to offer AI-powered features like auto-yield, smart payment routing, or automated liquidity management without building the agent infrastructure themselves. They integrate Verix via SDK, configure their project on the dashboard, and let Verix handle everything underneath.

### Persona 2: The Protocol or DAO
A Stellar-native protocol or DAO that wants AI-managed treasury operations with full auditability. They need proof that every agent action stayed within their governance-defined mandate. They use the Verix SDK to wire agent execution into their governance tooling and use the project dashboard to audit every operation.

### Persona 3: The End User (Indirect)
The customer of the developer's product. They never log into Verix directly. They interact with the developer's app. Verix's value reaches them through the verified receipts and trustworthy agent behavior that the developer surfaces inside their own product.

---

## 5. Core Product Flow

This is the canonical user journey for every developer using Verix.

```
Step 1: Discovery
Developer finds Verix, reads documentation, decides to integrate.

Step 2: Install SDK
npm install @verix/sdk

Step 3: Sign Up
Developer creates a Verix account at verix.xyz.
Email verification, wallet connection optional at signup.

Step 4: Create a Project
Developer clicks "Create Project" on the dashboard.
Fills in:
  - Project name
  - Project description
  - Select AI provider: Codex (OpenAI), Claude (Anthropic), Groq, or Kimi
  - Enter API key for the selected provider
Verix generates a unique Project API Key (vx_live_... format).

Step 5: Copy API Key
Developer copies the Verix-generated Project API Key.

Step 6: Initialize SDK in their codebase
  import { VerixClient } from '@verix/sdk'

  const verix = new VerixClient({
    apiKey: process.env.VERIX_API_KEY,  // their project's Verix key
  })

Step 7: Deploy agents via SDK
  const agent = await verix.agents.deploy({
    type: 'blend_yield',
    config: { ... },
    walletAddress: userStellarAddress,
  })

Step 8: Monitor everything in the project dashboard
  - Receipts tab: every execution receipt with proof status
  - Verifications tab: 5-constraint proof results per execution
  - Agents tab: what each agent did, when, and how much it cost
  - DeFi Activity tab: lending, swapping, liquidity, payment operations
  - Transactions tab: every Stellar transaction with explorer links
  - Settings tab: project config, API key management, AI provider
```

---

## 6. Core Features

### 6.1 Project Management
Each developer account can have multiple projects. A project represents one product or application. Each project has its own API key, its own AI provider configuration, its own agent history, and its own dashboard. Projects are isolated: agents, receipts, and trace events from one project are never visible to another.

### 6.2 AI Provider Configuration (BYOK)
Verix does not pay for AI inference. Developers bring their own API keys for their chosen provider. Supported providers:

| Provider | Models Used | Use Case |
|---|---|---|
| Codex (OpenAI) | gpt-4o, gpt-4o-mini | General agent routing and execution |
| Claude (Anthropic) | claude-sonnet-4-6, claude-haiku-4-5 | Complex reasoning and task decomposition |
| Groq | llama-3.3-70b-versatile | Fast inference, high-volume operations |
| Kimi (Moonshot AI) | moonshot-v1-128k | Long-context tasks and analysis |

The developer's API key is encrypted with AES-256-GCM before storage. At execution time, Verix decrypts the key server-side and uses it to make AI calls on behalf of the project. The developer is billed by their AI provider directly. Verix bills separately for platform usage.

### 6.3 Verix Project API Key
When a project is created, Verix generates a unique API key in the format `vx_live_{uuid}` for production or `vx_test_{uuid}` for testnet. This key authenticates all SDK calls from the developer's codebase back to the Verix platform. Keys can be rotated, and old keys can be revoked from the project settings.

### 6.4 DeFi Agent Library
Four purpose-built agent types available to all developers via the SDK:

**Blend Yield Agent**
Monitors supply rates across Blend Protocol pools. Supplies and rebalances liquidity to maximize yield for the developer's end users. Respects a per-execution spend cap set by the developer.

**Soroswap Trading Agent**
Executes token swaps on Soroswap with configurable slippage limits. Supports condition-based execution (price triggers) and immediate execution.

**Aquarius Liquidity Agent**
Manages AMM liquidity positions in Aquarius pools. Monitors fee accrual, tracks impermanent loss, and rebalances when configured thresholds are met.

**Anchor Payment Agent**
Routes cross-border USDC payments through the optimal Stellar anchor. Compares rates, fees, and settlement times before executing. Produces a fully auditable payment receipt.

### 6.5 Verification Engine
Every agent execution passes through a 5-constraint deterministic proof verifier before a receipt is issued:

1. Receipt integrity: receiptHash recomputed and confirmed to match
2. Spend cap compliance: totalCost is within the configured cap
3. Payment correctness: payment amounts sum correctly, all addresses are valid Stellar public keys
4. Agent membership: all agent version hashes are registered in the on-chain Agent Registry
5. Trace commitment: traceRoot is a valid SHA-256 hex that matches the execution chain

### 6.6 On-Chain Receipt Anchoring
Verified receipts are anchored to Soroban via the Receipt Anchor contract. The anchor stores the receiptHash, taskIdHash, traceRoot, and a proof reference permanently on-chain. Anyone can verify a receipt using only the Soroban contract and the receipt data, without trusting Verix.

### 6.7 Project Dashboard (6 Sections)

**Receipts**
A chronological list of every execution receipt across the project. Each receipt shows: status (verified or failed), agent type, total cost, receiptHash, and a link to the Soroban anchor transaction. Developers can click into any receipt for full detail.

**Verifications**
A view of every proof run across the project. Shows all 5 constraint results per execution with pass/fail indicators and detail messages. Developers can re-run verification on any receipt from this view.

**Agents**
A list of all deployed agents under the project. Shows each agent's type, configuration, deployment date, execution count, verified completion rate, and current status. Developers can pause, update, or remove agents from this view.

**DeFi Activity**
A protocol-centric view showing what the agents actually did on Stellar DeFi. Grouped by protocol: Blend operations (supply, withdraw, rebalance), Soroswap operations (swaps, amounts, effective prices), Aquarius operations (liquidity adjustments, fees collected), and Anchor operations (payment routes, amounts, settlement status).

**Transactions**
A complete log of every Stellar transaction produced by the project's agents. Each row shows: txHash (with Stellar explorer link), agent, amount, destination address, status, and timestamp.

**Settings**
Project name and description editing. API key display and rotation. AI provider selection and API key update. Webhook URL configuration. Project deletion.

### 6.8 Developer SDK
An npm package that provides a clean, typed interface for deploying agents, querying execution history, and receiving execution events via webhooks. Full TypeScript support. The SDK is the only integration surface developers need to touch in their codebase.

---

## 7. System Architecture

### 7.1 High-Level Architecture

```
+------------------------------------------------------------------+
|                    DEVELOPER'S PRODUCT                            |
|         (savings app, neobank, payment tool, etc.)               |
|                   uses @verix/sdk                                |
+------------------------------------------------------------------+
                              |
                    Verix Project API Key
                              |
+------------------------------------------------------------------+
|                    VERIX PLATFORM                                 |
|                                                                  |
|   +-----------------+          +-----------------------------+   |
|   | Next.js API      |          | Project Dashboard (Next.js) |  |
|   | (SDK gateway)    |          | Receipts, Verifications,    |  |
|   |                  |          | Agents, DeFi Activity,      |  |
|   |                  |          | Transactions, Settings      |  |
|   +-----------------+          +-----------------------------+   |
|            |                                                     |
|   +---------v------------------------------------------------+   |
|   |              COORDINATOR PIPELINE                         |   |
|   |   Stage 1: Init | Stage 2: Route | Stage 3: Spend Cap   |   |
|   |   Stage 4: Execute | Stage 5: Synthesize                 |   |
|   +---------+----------------------------------------+-------+   |
|             |                                        |           |
|   +---------v-----------+              +-------------v-------+   |
|   | DeFi AGENT LIBRARY  |              | VERIFICATION ENGINE  |  |
|   | Blend | Soroswap    |              | Hash Chain Trace     |  |
|   | Aquarius | Anchor   |              | 5-Constraint Verifier|  |
|   +---------------------+              | Receipt Engine       |  |
|                                        +-------------+-------+   |
|                                                      |           |
+------------------------------------------------------+-----------+
                                                       |
+------------------------------------------------------v-----------+
|                    STELLAR FOUNDATION                             |
|   Soroban (Receipt Anchor + Agent Registry)                      |
|   Blend | Soroswap | Aquarius | Anchors | Trustless Work         |
+------------------------------------------------------------------+
```

### 7.2 Request Flow (SDK Call to On-Chain Proof)

```
Developer's app calls verix.agents.deploy(config)
        |
        v
SDK sends POST /api/v1/agents with vx_live_... API key in header
        |
        v
API route authenticates key, resolves project, loads AI provider config
Decrypts developer's AI provider API key
        |
        v
Job Queue enqueues coordinator_execution job for the project
        |
        v
Coordinator Pipeline initialises (Stage 1)
  Sets spend cap, records coordinator_start trace event
        |
        v
AI Router selects appropriate DeFi agent (Stage 2)
  Uses project's configured AI provider and decrypted API key
  Computes registrySnapshotHash
        |
        v
Spend Cap Check (Stage 3)
  Fails fast if projected cost exceeds cap
        |
        v
DeFi Agent Execution (Stage 4)
  Agent queries target Stellar protocol
  Agent executes operation via Stellar SDK
  Trustless Work escrow created and funded
  Trace events written for every action
        |
        v
Synthesizer builds receipt (Stage 5)
  paymentBreakdown assembled
  ExecutionReceipt generated with receiptHash
        |
        v
Proof Verifier runs 5 constraints
  All pass: receipt status = "verified"
  Any fail: receipt status = "failed", reason logged
        |
        v
Receipt anchored to Soroban
  anchor_receipt() called on Receipt Anchor contract
  Real Stellar txHash returned and stored
        |
        v
Escrow milestone released
  USDC transferred to agent operator
        |
        v
Webhook fired to developer's webhookUrl
  { event: 'execution.completed', receiptHash, sorobanTxHash, ... }
        |
        v
Dashboard updated via SSE
  Project dashboard shows new receipt, trace, DeFi activity
```

---

## 8. Technical Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15, App Router, Turbopack |
| Language | TypeScript 5 throughout |
| Styling | Tailwind CSS v4 |
| Animation | Framer Motion |
| UI Components | shadcn/ui, Lucide Icons |
| ORM | Prisma 7 with PostgreSQL |
| Database | PostgreSQL (Supabase or Railway) |
| AI Providers | Anthropic SDK, OpenAI SDK, Groq SDK, Kimi SDK |
| Blockchain | Stellar SDK 13.3, Soroban RPC |
| Smart Contracts | Rust, Soroban SDK |
| Escrow | Trustless Work REST API |
| Wallet | Freighter SDK, Albedo |
| Background Jobs | PostgreSQL-backed job queue |
| Real-time | Server-Sent Events |
| Crypto | Node.js native crypto (SHA-256, AES-256-GCM) |
| Deployment | Vercel |
| SDK Distribution | npm |

### Repository Structure

```
verix/
  apps/
    web/
      app/
        (marketing)/
          page.tsx                  Landing page
          docs/page.tsx             Documentation
          pricing/page.tsx          Pricing page
        (auth)/
          login/page.tsx            Login
          signup/page.tsx           Signup
          verify/page.tsx           Email verification
        (dashboard)/
          layout.tsx                Dashboard shell with project switcher
          page.tsx                  All projects overview
          projects/
            new/page.tsx            Create project wizard
            [projectId]/
              page.tsx              Project overview
              receipts/
                page.tsx            Receipts tab
                [receiptHash]/page.tsx  Receipt detail
              verifications/
                page.tsx            Verifications tab
              agents/
                page.tsx            Agents tab
                [agentId]/page.tsx  Agent detail
              defi/
                page.tsx            DeFi Activity tab
              transactions/
                page.tsx            Transactions tab
              settings/
                page.tsx            Settings tab
        api/
          v1/
            agents/route.ts         SDK: deploy agent
            executions/route.ts     SDK: list executions
            receipts/route.ts       SDK: get receipt
          projects/route.ts         Dashboard: CRUD projects
          projects/[id]/route.ts
          keys/route.ts             Key generation and rotation
          stream/[taskId]/route.ts  SSE endpoint
          webhooks/route.ts         Incoming webhook handler
          auth/route.ts             Auth handler
      components/
        projects/
          CreateProjectWizard.tsx
          ProjectSwitcher.tsx
          ProjectCard.tsx
        dashboard/
          DashboardShell.tsx
          TabNavigation.tsx
        receipts/
          ReceiptList.tsx
          ReceiptDetail.tsx
          ReceiptStatusBadge.tsx
        verifications/
          VerificationPanel.tsx
          ConstraintRow.tsx
        agents/
          AgentList.tsx
          AgentDeployForm.tsx
          AgentStatusBadge.tsx
        defi/
          DeFiActivityFeed.tsx
          ProtocolSection.tsx
          OperationCard.tsx
        transactions/
          TransactionTable.tsx
          ExplorerLink.tsx
        settings/
          ProviderConfig.tsx
          ApiKeyPanel.tsx
          WebhookConfig.tsx
        wallet/
          WalletConnector.tsx
        shared/
          EmptyState.tsx
          LoadingSpinner.tsx
          CopyButton.tsx
          HashDisplay.tsx
      lib/
        coordinator/
        agents/
        verification/
        escrow/
        trace/
        jobs/
        ai/
          providers/
            openai.ts
            anthropic.ts
            groq.ts
            kimi.ts
          router.ts
        stellar/
        soroban/
        crypto/
        db/
      hooks/
      types/
      prisma/
        schema.prisma
  packages/
    sdk/
      src/
        client.ts
        agents/
        receipts/
        webhooks/
        types/
      package.json
  contracts/
    soroban/
      receipt-anchor/
      agent-registry/
```

---

## 9. Database Schema

```prisma
// prisma/schema.prisma

model User {
  id            String    @id @default(cuid())
  email         String    @unique
  passwordHash  String?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  projects      Project[]
}

model Project {
  id               String    @id @default(cuid())
  userId           String
  user             User      @relation(fields: [userId], references: [id])
  name             String
  description      String?
  network          Network   @default(MAINNET)
  aiProvider       AIProvider
  aiApiKeyEncrypted String   // AES-256-GCM encrypted
  webhookUrl       String?
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt
  apiKeys          ProjectApiKey[]
  agents           Agent[]
  tasks            Task[]
}

model ProjectApiKey {
  id          String    @id @default(cuid())
  projectId   String
  project     Project   @relation(fields: [projectId], references: [id])
  key         String    @unique
  // format: vx_live_{uuid} or vx_test_{uuid}
  label       String?
  lastUsedAt  DateTime?
  revokedAt   DateTime?
  createdAt   DateTime  @default(now())
}

model Agent {
  id              String      @id @default(cuid())
  projectId       String
  project         Project     @relation(fields: [projectId], references: [id])
  agentType       AgentType
  name            String
  config          Json
  status          AgentStatus @default(ACTIVE)
  versionHash     String
  walletAddress   String
  price           Float
  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt
  versions        AgentVersion[]
  tasks           Task[]
  reputation      Reputation?
}

model AgentVersion {
  id          String   @id @default(cuid())
  agentId     String
  agent       Agent    @relation(fields: [agentId], references: [id])
  version     String
  versionHash String   @unique
  config      Json
  createdAt   DateTime @default(now())
  subtasks    Subtask[]
}

model Task {
  id            String      @id @default(cuid())
  projectId     String
  project       Project     @relation(fields: [projectId], references: [id])
  agentId       String?
  agent         Agent?      @relation(fields: [agentId], references: [id])
  agentType     AgentType?
  description   String
  config        Json
  status        TaskStatus  @default(PENDING)
  spendCap      Float
  totalCost     Float?
  result        Json?
  walletAddress String?
  createdAt     DateTime    @default(now())
  updatedAt     DateTime    @updatedAt
  subtasks      Subtask[]
  traceEvents   ExecutionTraceEvent[]
  receipt       ExecutionReceipt?
  escrow        Escrow?
  jobs          Job[]
}

model Subtask {
  id                    String        @id @default(cuid())
  taskId                String
  task                  Task          @relation(fields: [taskId], references: [id])
  agentId               String
  agentVersionId        String
  agentVersion          AgentVersion  @relation(fields: [agentVersionId], references: [id])
  cost                  Float
  status                SubtaskStatus @default(PENDING)
  result                Json?
  parentSubtaskId       String?
  delegationDepth       Int           @default(0)
  delegatedBySpecialist String?
  createdAt             DateTime      @default(now())
  payments              Payment[]
}

model ExecutionTraceEvent {
  id            String   @id @default(cuid())
  taskId        String
  task          Task     @relation(fields: [taskId], references: [id])
  sequence      Int
  eventType     String
  actor         String
  inputHash     String?
  outputHash    String?
  prevEventHash String?
  eventHash     String   @unique
  displayMessage String
  createdAt     DateTime @default(now())

  @@unique([taskId, sequence])
}

model ExecutionReceipt {
  id                   String        @id @default(cuid())
  taskId               String        @unique
  task                 Task          @relation(fields: [taskId], references: [id])
  receiptHash          String        @unique
  taskInputHash        String
  agentVersionHashes   String[]
  spendCap             Float
  totalCost            Float
  traceRoot            String
  outputHash           String
  registrySnapshotHash String
  paymentSummary       Json
  status               ReceiptStatus @default(PENDING)
  sorobanTxHash        String?
  createdAt            DateTime      @default(now())
  proof                Proof?
}

model Proof {
  id                String           @id @default(cuid())
  receiptId         String           @unique
  receipt           ExecutionReceipt @relation(fields: [receiptId], references: [id])
  receiptIntegrity  Boolean
  spendCapCompliance Boolean
  paymentCorrectness Boolean
  agentMembership   Boolean
  traceCommitment   Boolean
  allPassed         Boolean
  verifierType      String           @default("local")
  verifiedAt        DateTime
  details           Json?
}

model Escrow {
  id          String          @id @default(cuid())
  taskId      String          @unique
  task        Task            @relation(fields: [taskId], references: [id])
  externalId  String?
  status      EscrowStatus    @default(PENDING)
  totalAmount Float
  createdAt   DateTime        @default(now())
  milestones  EscrowMilestone[]
}

model EscrowMilestone {
  id               String           @id @default(cuid())
  escrowId         String
  escrow           Escrow           @relation(fields: [escrowId], references: [id])
  subtaskId        String?
  amount           Float
  releaseCondition ReleaseCondition
  status           MilestoneStatus  @default(PENDING)
  releaseTxHash    String?
  createdAt        DateTime         @default(now())
}

model Payment {
  id          String        @id @default(cuid())
  subtaskId   String
  subtask     Subtask       @relation(fields: [subtaskId], references: [id])
  amount      Float
  txHash      String?
  toAddress   String
  status      PaymentStatus @default(PENDING)
  createdAt   DateTime      @default(now())
}

model Reputation {
  id           String            @id @default(cuid())
  agentId      String            @unique
  agent        Agent             @relation(fields: [agentId], references: [id])
  score        Float             @default(50)
  totalJobs    Int               @default(0)
  verifiedJobs Int               @default(0)
  demoJobs     Int               @default(0)
  failedJobs   Int               @default(0)
  updatedAt    DateTime          @updatedAt
  events       ReputationEvent[]
}

model ReputationEvent {
  id           String     @id @default(cuid())
  reputationId String
  reputation   Reputation @relation(fields: [reputationId], references: [id])
  eventType    String
  rating       Int
  taskId       String?
  createdAt    DateTime   @default(now())
}

model Job {
  id          String    @id @default(cuid())
  taskId      String
  task        Task      @relation(fields: [taskId], references: [id])
  type        JobType
  status      JobStatus @default(QUEUED)
  attempts    Int       @default(0)
  maxAttempts Int       @default(3)
  payload     Json
  error       String?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  @@unique([taskId, type])
}

// Enums

enum Network {
  MAINNET
  TESTNET
}

enum AIProvider {
  OPENAI
  ANTHROPIC
  GROQ
  KIMI
}

enum AgentType {
  BLEND_YIELD
  SOROSWAP_TRADING
  AQUARIUS_LIQUIDITY
  ANCHOR_PAYMENT
  CUSTOM
}

enum AgentStatus     { ACTIVE PAUSED DEPRECATED }
enum TaskStatus      { PENDING RUNNING COMPLETED FAILED }
enum SubtaskStatus   { PENDING RUNNING COMPLETED FAILED }
enum ReceiptStatus   { PENDING VERIFIED FAILED }
enum EscrowStatus    { PENDING CREATED FUNDED COMPLETED FAILED }
enum MilestoneStatus { PENDING COMPLETED RELEASED FAILED }
enum PaymentStatus   { PENDING CONFIRMED FAILED }
enum JobType         { COORDINATOR_EXECUTION COORDINATOR_EXECUTION_RESUME
                       PROOF_GENERATION ESCROW_SYNC }
enum JobStatus       { QUEUED RUNNING COMPLETED FAILED }
enum ReleaseCondition { PROOF_VERIFIED USER_APPROVED PROOF_AND_USER_APPROVED AUTO }
```

---

## 10. API Design

### 10.1 Authentication

All SDK-facing API routes (under /api/v1/) authenticate via the Verix Project API Key in the Authorization header:

```
Authorization: Bearer vx_live_abc123...
```

The API key is hashed and looked up in the ProjectApiKey table. The associated project is loaded and attached to the request context. All operations are scoped to that project.

Dashboard routes use session-based auth (cookie). Developers log in with email and password or wallet signature.

### 10.2 SDK-Facing API Routes

```
POST   /api/v1/agents               Deploy a new agent
GET    /api/v1/agents               List agents for the project
GET    /api/v1/agents/:agentId      Get agent detail
PATCH  /api/v1/agents/:agentId      Update agent config
DELETE /api/v1/agents/:agentId      Deactivate agent

GET    /api/v1/executions           List executions for the project
GET    /api/v1/executions/:id       Get execution with trace events
POST   /api/v1/executions/:id/approve   Approve result

GET    /api/v1/receipts/:hash       Get receipt by hash
POST   /api/v1/receipts/:hash/verify    Re-run proof verification
```

**POST /api/v1/agents — Request:**
```typescript
{
  type: 'blend_yield' | 'soroswap_trading' | 'aquarius_liquidity' | 'anchor_payment'
  name: string
  config: AgentConfig
  spendCap: number
  walletAddress: string
}
```

**POST /api/v1/receipts/:hash/verify — Response:**
```typescript
{
  receiptHash: string
  constraints: {
    receiptIntegrity:   { passed: boolean, detail: string }
    spendCapCompliance: { passed: boolean, detail: string }
    paymentCorrectness: { passed: boolean, detail: string }
    agentMembership:    { passed: boolean, detail: string }
    traceCommitment:    { passed: boolean, detail: string }
  }
  allPassed: boolean
  sorobanTxHash: string | null
  stellarExplorerUrl: string | null
}
```

### 10.3 Dashboard API Routes

```
GET    /api/projects                     List all projects for user
POST   /api/projects                     Create new project
GET    /api/projects/:id                 Get project detail
PATCH  /api/projects/:id                 Update project (name, description, webhookUrl)
DELETE /api/projects/:id                 Delete project

POST   /api/projects/:id/provider        Update AI provider config
POST   /api/projects/:id/keys            Generate new API key
DELETE /api/projects/:id/keys/:keyId     Revoke API key

GET    /api/stream/:taskId               SSE stream for live execution updates
```

---

## 11. Frontend Architecture

### 11.1 Create Project Wizard

```typescript
// components/projects/CreateProjectWizard.tsx

// Step 1: Project Info
//   Input: Project name (required)
//   Input: Project description (optional)
//   Input: Network (mainnet or testnet toggle)

// Step 2: AI Provider Config
//   Select: AI provider (Codex, Claude, Groq, Kimi)
//   Input: API key for selected provider
//   Button: Test connection (makes a lightweight test call to confirm key works)

// Step 3: Review and Create
//   Summary of project config
//   Button: Create Project

// Step 4: API Key Reveal
//   Shows generated Verix API Key (vx_live_...)
//   Copy button
//   Warning: this key will not be shown again in full
//   Quick start code snippet showing SDK initialization
```

### 11.2 Project Dashboard Shell

```typescript
// app/(dashboard)/projects/[projectId]/layout.tsx

// Top navigation: Project name + network badge + project switcher dropdown
// Tab navigation:
//   Receipts | Verifications | Agents | DeFi Activity | Transactions | Settings
// Each tab is a separate page route under /projects/[projectId]/

// Project context loaded once at layout level
// Passed to all child pages via React context
```

### 11.3 Receipts Tab

```typescript
// app/(dashboard)/projects/[projectId]/receipts/page.tsx

// Table columns:
//   Status badge (Verified / Failed / Pending)
//   Agent type
//   Execution date
//   Total cost (USDC)
//   Receipt hash (truncated, copy button)
//   Soroban anchor (link to Stellar explorer or "Pending")
//   Actions: View detail

// Receipt detail page (/receipts/[receiptHash]):
//   Full receipt hash with copy
//   All 5 proof constraint results
//   Payment breakdown table
//   Agent version hashes used
//   Trace root hash
//   Soroban txHash with explorer link
//   Button: Re-run verification
```

### 11.4 Verifications Tab

```typescript
// app/(dashboard)/projects/[projectId]/verifications/page.tsx

// Per-execution verification summary
// Each row shows all 5 constraints at a glance:
//   Receipt Integrity     [PASS] / [FAIL]
//   Spend Cap Compliance  [PASS] / [FAIL]
//   Payment Correctness   [PASS] / [FAIL]
//   Agent Membership      [PASS] / [FAIL]
//   Trace Commitment      [PASS] / [FAIL]
// Expandable row shows detail message for each constraint
// Filter: All | Passed | Failed
```

### 11.5 Agents Tab

```typescript
// app/(dashboard)/projects/[projectId]/agents/page.tsx

// Agent cards showing:
//   Agent name and type
//   Status badge (Active / Paused)
//   Total executions
//   Verified completion rate
//   Last execution timestamp
//   Spend cap configured
// Button: Deploy New Agent (opens agent deployment form)

// Agent deployment form:
//   Select agent type
//   Configure type-specific parameters
//   Set spend cap
//   Enter end-user's Stellar wallet address
//   Submit
```

### 11.6 DeFi Activity Tab

```typescript
// app/(dashboard)/projects/[projectId]/defi/page.tsx

// Protocol-grouped activity feed:
//
// BLEND
//   [ Supply | 150 USDC | Pool: XLM/USDC | APY: 8.2% | 2h ago ]
//   [ Rebalance | From pool A to pool B | Rate delta: 1.2% | 5h ago ]
//
// SOROSWAP
//   [ Swap | 100 USDC to 125 XLM | Price impact: 0.12% | 3h ago ]
//
// AQUARIUS
//   [ Add Liquidity | 200 USDC + 250 XLM | Fee accrued: 0.42 USDC | 1d ago ]
//
// ANCHOR PAYMENTS
//   [ Payment | 500 USDC via Anclap | Recipient: Colombia | Settled | 2d ago ]
//
// Filter by: All | Blend | Soroswap | Aquarius | Anchor
// Date range picker
```

### 11.7 Transactions Tab

```typescript
// app/(dashboard)/projects/[projectId]/transactions/page.tsx

// Full transaction log table:
//   txHash (link to Stellar expert)
//   Type (supply, swap, payment, rebalance, etc.)
//   Agent name
//   Amount and asset
//   Destination address (truncated)
//   Status (confirmed / pending / failed)
//   Timestamp
// Export as CSV button
```

### 11.8 Settings Tab

```typescript
// app/(dashboard)/projects/[projectId]/settings/page.tsx

// Project Info section:
//   Edit project name
//   Edit project description
//   Network display (read-only after creation)

// AI Provider section:
//   Current provider badge
//   Change provider button (opens provider config modal)
//   API key display (masked: sk-...xxxx)
//   Update API key button

// API Keys section:
//   Table of all keys with labels and last used timestamps
//   Generate new key button
//   Revoke key button per row

// Webhooks section:
//   Webhook URL input
//   Test webhook button (sends a test payload)
//   Webhook secret display

// Danger Zone:
//   Delete project button (requires typing project name to confirm)
```

### 11.9 Live Execution Feed via SSE

```typescript
// app/api/stream/[taskId]/route.ts

export async function GET(req: Request, { params }: { params: { taskId: string } }) {
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      let lastSequence = 0
      const interval = setInterval(async () => {
        const newEvents = await db.executionTraceEvent.findMany({
          where: { taskId: params.taskId, sequence: { gt: lastSequence } },
          orderBy: { sequence: 'asc' },
        })

        for (const event of newEvents) {
          send(event)
          lastSequence = event.sequence
        }

        const task = await db.task.findUnique({ where: { id: params.taskId } })
        if (task?.status === 'completed' || task?.status === 'failed') {
          send({ type: 'stream_end', status: task.status })
          clearInterval(interval)
          controller.close()
        }
      }, 500)
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    }
  })
}
```

---

## 12. Developer SDK

### 12.1 Installation

```bash
npm install @verix/sdk
```

### 12.2 Initialization

```typescript
import { VerixClient } from '@verix/sdk'

const verix = new VerixClient({
  apiKey: process.env.VERIX_API_KEY,  // vx_live_... key from project settings
  network: 'mainnet',                  // or 'testnet'
})
```

### 12.3 Deploy an Agent

```typescript
// Deploy a Blend yield agent
const agent = await verix.agents.deploy({
  type: 'blend_yield',
  name: 'Auto Yield',
  config: {
    targetAsset: 'USDC',
    rebalanceThreshold: 50,    // basis points
    poolIds: ['pool_id_1', 'pool_id_2'],
    spendCap: 10,              // USDC per execution
  },
  walletAddress: userStellarAddress,
})

// Deploy an anchor payment agent
const paymentAgent = await verix.agents.deploy({
  type: 'anchor_payment',
  name: 'Payment Router',
  config: {
    destinationCurrency: 'NGN',
    spendCap: 500,
  },
  walletAddress: userStellarAddress,
})
```

### 12.4 Get Execution and Receipt

```typescript
// Get all executions for a user's agent
const executions = await verix.executions.list({ agentId: agent.id })

// Get a specific execution with full trace
const execution = await verix.executions.get(executionId)

// Verify a receipt
const verification = await verix.receipts.verify(execution.receiptHash)

if (verification.allPassed) {
  console.log('On-chain proof:', verification.stellarExplorerUrl)
}
```

### 12.5 Webhooks

```typescript
// In your webhook endpoint (e.g. /api/webhooks/verix)
import { VerixWebhookHandler } from '@verix/sdk'

const handler = new VerixWebhookHandler({
  secret: process.env.VERIX_WEBHOOK_SECRET,
})

export async function POST(req: Request) {
  const payload = await handler.parse(req)

  switch (payload.event) {
    case 'execution.completed':
      // payload.data.receiptHash, payload.data.sorobanTxHash
      break
    case 'execution.failed':
      // payload.data.failureReason
      break
    case 'receipt.anchored':
      // payload.data.sorobanTxHash, payload.data.stellarExplorerUrl
      break
  }
}
```

### 12.6 TypeScript Types

```typescript
// All types exported from @verix/sdk

export type AgentType =
  | 'blend_yield'
  | 'soroswap_trading'
  | 'aquarius_liquidity'
  | 'anchor_payment'

export type AIProvider = 'openai' | 'anthropic' | 'groq' | 'kimi'

export interface AgentConfig {
  targetAsset?: string
  spendCap: number
  rebalanceThreshold?: number
  poolIds?: string[]
  maxSlippage?: number
  destinationCurrency?: string
}

export interface ExecutionReceipt {
  receiptHash: string
  status: 'verified' | 'failed' | 'pending'
  totalCost: number
  spendCap: number
  traceRoot: string
  sorobanTxHash: string | null
  paymentSummary: PaymentSummaryItem[]
  createdAt: string
}

export interface VerificationResult {
  receiptHash: string
  allPassed: boolean
  sorobanTxHash: string | null
  stellarExplorerUrl: string | null
  constraints: {
    receiptIntegrity:   ConstraintResult
    spendCapCompliance: ConstraintResult
    paymentCorrectness: ConstraintResult
    agentMembership:    ConstraintResult
    traceCommitment:    ConstraintResult
  }
}

export interface ConstraintResult {
  passed: boolean
  detail: string
}
```

---

## 13. Soroban Smart Contracts

### 13.1 Receipt Anchor Contract

```rust
// contracts/soroban/receipt-anchor/src/lib.rs

pub struct AnchoredReceipt {
    pub verifier:     Address,
    pub receipt_hash: BytesN<32>,
    pub task_id_hash: BytesN<32>,
    pub trace_root:   BytesN<32>,
    pub proof_ref:    String,
    pub anchored_at:  u64,
}

// anchor_receipt: immutable insert, panics if already anchored
pub fn anchor_receipt(
    env: Env,
    verifier: Address,
    receipt_hash: BytesN<32>,
    task_id_hash: BytesN<32>,
    trace_root: BytesN<32>,
    proof_ref: String,
) -> AnchoredReceipt

// get_receipt: public lookup by hash
pub fn get_receipt(env: Env, receipt_hash: BytesN<32>) -> Option<AnchoredReceipt>

// is_anchored: public boolean check
pub fn is_anchored(env: Env, receipt_hash: BytesN<32>) -> bool
```

### 13.2 Agent Registry Contract

```rust
// contracts/soroban/agent-registry/src/lib.rs

pub struct AgentVersion {
    pub agent_id:     String,
    pub owner:        Address,
    pub version_hash: BytesN<32>,
    pub metadata_uri: String,
    pub registered_at: u64,
}

// register_agent: register a new agent
pub fn register_agent(
    env: Env,
    agent_id: String,
    owner: Address,
    version_hash: BytesN<32>,
    metadata_uri: String,
) -> AgentVersion

// update_version: add a new version, panics if version_hash already used
pub fn update_version(
    env: Env,
    agent_id: String,
    version_hash: BytesN<32>,
    metadata_uri: String,
) -> AgentVersion

// has_version: membership proof check
pub fn has_version(env: Env, agent_id: String, version_hash: BytesN<32>) -> bool
```

---

## 14. Security Architecture

**API Key Security**
Verix project API keys are stored as SHA-256 hashes in the database. The raw key is only shown once at creation and never stored in plain text. Lookups hash the incoming key and compare.

**AI Provider Key Encryption**
Developer AI provider keys are encrypted with AES-256-GCM before storage. Format: `iv:authTag:ciphertext` as hex. ENCRYPTION_KEY is 32 bytes loaded from environment. Server throws on startup if ENCRYPTION_KEY is missing or matches dev default.

**Request Authentication**
SDK routes: Bearer token in Authorization header, resolved to project via hashed key lookup.
Dashboard routes: Session cookie (httpOnly, 30-day expiry), resolved to user.

**Soroban Key Management**
Coordinator wallet S... private key stored in COORDINATOR_STELLAR_PRIVATE_KEY environment variable. Never exposed in API responses or logs. Used server-side only for signing Trustless Work XDR.

**Spend Cap Enforcement**
Checked at Stage 3 (before execution) and again serially in Phase A of Stage 4 (before each payment intent). Serial Phase A prevents concurrent subtasks from simultaneously passing a cap check that would be violated in aggregate.

**Contract Immutability**
Both Soroban contracts have no upgrade mechanism. Once deployed, they are immutable. anchor_receipt panics on duplicate hash. update_version panics on duplicate version hash.

---

## 15. Milestone Plan

### Milestone 1: Foundation (10%)
Deliverables:
Receipt Anchor and Agent Registry contracts deployed to Stellar testnet. Live anchor_receipt() invocations replacing the current stub. Real Stellar txHash stored on every anchoring. Freighter wallet integration for user-signed XDR. End-to-end test from SDK call to on-chain receipt.

Success criteria: A verifiable receipt can be independently confirmed on Stellar testnet via any block explorer.

### Milestone 2: DeFi Agent Library (20%)
Deliverables:
All four agent types built and tested on Stellar testnet: Blend Yield, Soroswap Trading, Aquarius Liquidity, and Anchor Payment. All agents produce full trace events and anchored receipts. Spend cap enforcement active.

Success criteria: Each agent type executes a live operation on Stellar testnet with a verifiable on-chain receipt.

### Milestone 3: Developer Platform and Dashboard (30%)
Deliverables:
Create Project wizard with AI provider config and BYOK key entry. Verix API key generation. All six dashboard tabs: Receipts, Verifications, Agents, DeFi Activity, Transactions, Settings. Live SSE execution feed. SDK published to npm with full TypeScript types and documentation.

Success criteria: A developer can sign up, create a project, install the SDK, deploy an agent, and see the verified receipt in their dashboard without any assistance.

### Milestone 4: Mainnet Launch and Ecosystem Integration (40%)
Deliverables:
Full mainnet deployment of both Soroban contracts. Security review of both contracts. Public receipt verification API. At least one external Stellar project integrated using the Verix SDK. RISC Zero proof upgrade design document. Full developer documentation.

Success criteria: Verix live on mainnet with at least one external integration and independently verifiable receipts using only on-chain data.

---

## 16. Non-Functional Requirements

**Performance**
API routes respond in under 500ms for read operations. SSE streams deliver trace events within 1 second of database write. Soroban contract calls complete within Stellar's 5-second finality window.

**Availability**
Platform targets 99% uptime. Job queue persists through process restarts via database-backed state. Atomic job claiming survives horizontal scaling.

**Data Integrity**
Every coordinator action produces a trace event. No coordinator action is undocumented. Any gap in the hash chain is detectable. Receipt anchoring is idempotent.

**Project Isolation**
All data is scoped to a project. No cross-project data leakage. API key authentication enforces project scope on every SDK request.

**Developer Experience**
SDK fully typed in TypeScript. Every SDK method returns typed responses. Error messages are descriptive and actionable. Webhook payloads are documented and versioned.

---

*Verix Engineering PRD v3.0, the developer platform for verified AI agent execution on Stellar DeFi.*
